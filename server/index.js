const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const Parser = require('rss-parser');
const { FEEDS } = require('./feeds');

const app = express();
app.use(express.json({ limit: '100kb' }));
const parser = new Parser({ timeout: 8000 });

const CACHE_TTL_MS = 60 * 1000;
const cache = { timestamp: 0, articles: [], errors: [] };

function normalizeItem(item, source) {
  const rawSummary = item.contentSnippet || item.summary || item.content || '';
  return {
    title: (item.title || '').trim(),
    link: item.link || item.guid || '',
    pubDate: item.isoDate || item.pubDate || null,
    summary: rawSummary.replace(/\\s+/g, ' ').trim().slice(0, 280),
    source: source.name,
    category: source.category,
  };
}

async function fetchAllFeeds() {
  const settled = await Promise.allSettled(
    FEEDS.map(async source => {
      const feed = await parser.parseURL(source.url);
      return (feed.items || []).map(item => normalizeItem(item, source));
    })
  );

  const articles = [];
  const errors = [];
  settled.forEach((result, index) => {
    const source = FEEDS[index];
    if (result.status === 'fulfilled') articles.push(...result.value);
    else errors.push({
      source: source.name,
      message: result.reason?.message || 'errore sconosciuto',
    });
  });
  articles.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
  return { articles, errors };
}

async function getFeeds() {
  const isFresh = Date.now() - cache.timestamp < CACHE_TTL_MS;
  if (isFresh && cache.timestamp > 0) return cache;
  const { articles, errors } = await fetchAllFeeds();
  cache.timestamp = Date.now();
  cache.articles = articles;
  cache.errors = errors;
  return cache;
}


const LAUNCHES_PATH = process.env.LAUNCHES_PATH || 'data/launches.json';
const GITHUB_REPO = process.env.GITHUB_REPO || 'giutrap/giutrapani';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'claude/rss-news-aggregator-dosocy';
async function githubRequest(method, url, body) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('Archivio non configurato: manca GITHUB_TOKEN.');
  const response = await fetch(url, {
    method,
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? {'Content-Type':'application/json'} : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!response.ok) throw new Error('Archivio GitHub: HTTP ' + response.status);
  return response.status === 204 ? null : response.json();
}
async function readLaunches() {
  const url = 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + LAUNCHES_PATH + '?ref=' + encodeURIComponent(GITHUB_BRANCH);
  try {
    const file = await githubRequest('GET', url);
    return { launches: JSON.parse(Buffer.from(file.content.replace(/\\n/g, ''), 'base64').toString('utf8')), sha: file.sha };
  } catch (error) {
    if (String(error.message).includes('HTTP 404')) return { launches: [], sha: null };
    throw error;
  }
}
async function writeLaunches(launches, sha) {
  const url = 'https://api.github.com/repos/' + GITHUB_REPO + '/contents/' + LAUNCHES_PATH;
  const body = { message: 'Aggiorna lanci editoriali BREAKING', branch: GITHUB_BRANCH, content: Buffer.from(JSON.stringify(launches, null, 2)).toString('base64'), ...(sha ? { sha } : {}) };
  return githubRequest('PUT', url, body);
}
function safeEqual(a, b) {
  const aa = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function requireAuthor(req, res, next) {
  const expected = process.env.EDITOR_PASSWORD;
  const supplied = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!expected) return res.status(503).json({ error: 'Area autore non ancora configurata: manca EDITOR_PASSWORD.' });
  if (!safeEqual(supplied, expected)) return res.status(401).json({ error: 'Password non valida.' });
  next();
}
app.post('/api/author/login', async (req, res) => {
  const expected = process.env.EDITOR_PASSWORD;
  if (!expected) return res.status(503).json({ error: 'Area autore non ancora configurata: manca EDITOR_PASSWORD.' });
  if (!safeEqual(req.body?.password || '', expected)) return res.status(401).json({ error: 'Password non valida.' });
  if (!process.env.GITHUB_TOKEN) return res.status(503).json({ error: 'Archivio editoriale non configurato: manca la chiave GitHub.' });
  res.json({ ok: true });
});
app.get('/api/launches', (req, res) => {
  try { res.json({ launches: readLaunches() }); }
  catch (error) { console.error(error); res.status(500).json({ error: 'Archivio lanci non leggibile.' }); }
});
app.post('/api/launches', requireAuthor, async (req, res) => {
  const title = String(req.body?.title || '').trim();
  const body = String(req.body?.body || '').trim();
  const link = String(req.body?.link || '').trim();
  if (!title || !body) return res.status(400).json({ error: 'Titolo e testo sono obbligatori.' });
  if (title.length > 180 || body.length > 5000) return res.status(400).json({ error: 'Testo troppo lungo.' });
  if (link && !/^https?:\/\//i.test(link)) return res.status(400).json({ error: 'Il link deve iniziare con http:// o https://.' });
  try {
    if (!process.env.GITHUB_TOKEN) return res.status(503).json({ error: 'Archivio editoriale non configurato: manca la chiave GitHub.' });
    const stored = await readLaunches(); const launches = stored.launches; const now = new Date().toISOString();
    launches.unshift({ id: crypto.randomUUID(), title, body, link, createdAt: now, updatedAt: now });
    await writeLaunches(launches, stored.sha); res.status(201).json({ launches });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Impossibile salvare il lancio.' }); }
});
app.put('/api/launches/:id', requireAuthor, async (req, res) => {
  const title = String(req.body?.title || '').trim(); const body = String(req.body?.body || '').trim(); const link = String(req.body?.link || '').trim();
  if (!title || !body) return res.status(400).json({ error: 'Titolo e testo sono obbligatori.' });
  if (title.length > 180 || body.length > 5000) return res.status(400).json({ error: 'Testo troppo lungo.' });
  if (link && !/^https?:\/\//i.test(link)) return res.status(400).json({ error: 'Il link deve iniziare con http:// o https://.' });
  try {
    if (!process.env.GITHUB_TOKEN) return res.status(503).json({ error: 'Archivio editoriale non configurato: manca la chiave GitHub.' });
    const stored = await readLaunches(); const launches = stored.launches; const item = launches.find(x => x.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Lancio non trovato.' });
    Object.assign(item, { title, body, link, updatedAt: new Date().toISOString() });
    await writeLaunches(launches, stored.sha); res.json({ launches });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Impossibile aggiornare il lancio.' }); }
});
app.delete('/api/launches/:id', requireAuthor, async (req, res) => {
  try {
    if (!process.env.GITHUB_TOKEN) return res.status(503).json({ error: 'Archivio editoriale non configurato: manca la chiave GitHub.' });
    const stored = await readLaunches(); const launches = stored.launches; const remaining = launches.filter(x => x.id !== req.params.id);
    if (remaining.length === launches.length) return res.status(404).json({ error: 'Lancio non trovato.' });
    await writeLaunches(remaining, stored.sha); res.json({ launches: remaining });
  } catch (error) { console.error(error); res.status(500).json({ error: 'Impossibile eliminare il lancio.' }); }
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/sources', (req, res) => {
  const sources = [...new Set(FEEDS.map(feed => feed.name))].sort();
  const categories = [...new Set(FEEDS.map(feed => feed.category))].sort();
  res.json({ sources, categories });
});

app.get('/api/feeds', async (req, res) => {
  try {
    const data = await getFeeds();
    res.json({
      updatedAt: data.timestamp,
      count: data.articles.length,
      articles: data.articles,
      errors: data.errors,
    });
  } catch (error) {
    res.status(500).json({ error: 'Impossibile recuperare i feed RSS.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`BREAKING in ascolto su http://localhost:${PORT}`);
});