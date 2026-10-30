const path = require('path');
const express = require('express');
const Parser = require('rss-parser');
const { Pool } = require('pg');
const { FEEDS } = require('./feeds');
const app = express();
const parser = new Parser({ timeout: 8000 });
const CACHE_TTL_MS = 60 * 1000;
const cache = { timestamp: 0, articles: [], errors: [] };
const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
}) : null;

function requireRedazione(req, res, next) {
  const expectedUser = process.env.REDAZIONE_USER;
  const expectedPassword = process.env.REDAZIONE_PASSWORD;
  if (!expectedUser || !expectedPassword) return res.status(503).json({ error: 'Accesso redazione non ancora configurato.' });
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return res.status(401).json({ error: 'Autenticazione richiesta.' });
  let credentials = '';
  try { credentials = Buffer.from(header.slice(6), 'base64').toString('utf8'); } catch {}
  const separator = credentials.indexOf(':');
  if (separator < 0 || credentials.slice(0, separator) !== expectedUser || credentials.slice(separator + 1) !== expectedPassword)
    return res.status(403).json({ error: 'Credenziali non valide.' });
  next();
}
async function initDatabase() {
  if (!pool) return;
  await pool.query('CREATE TABLE IF NOT EXISTS editorial_notes (id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL DEFAULT \\'\\', source TEXT NOT NULL DEFAULT \\'\\', original_url TEXT NOT NULL DEFAULT \\'\\', notes TEXT NOT NULL DEFAULT \\'\\', extra_links TEXT NOT NULL DEFAULT \\'\\', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
}
function normalizeItem(item, source) {
  const rawSummary = item.contentSnippet || item.summary || item.content || '';
  return { title: (item.title || '').trim(), link: item.link || item.guid || '', pubDate: item.isoDate || item.pubDate || null, summary: rawSummary.replace(/\\s+/g, ' ').trim().slice(0, 280), source: source.name, category: source.category };
}
async function fetchAllFeeds() {
  const settled = await Promise.allSettled(FEEDS.map(async source => {
    const sourceParser = ['@giutrapani · X', 'Il Riformista'].includes(source.name) ? new Parser({ timeout: 30000 }) : parser;
    const feed = await sourceParser.parseURL(source.url);
    const items = (feed.items || []).map(item => normalizeItem(item, source));
    if (source.name === '@giutrapani · X') { items.sort((a,b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0)); return items.slice(0,1); }
    return items;
  }));
  const articles = [], errors = [];
  settled.forEach((result,index) => {
    const source = FEEDS[index];
    if (result.status === 'fulfilled') articles.push(...result.value);
    else errors.push({ source: source.name, message: result.reason?.message || 'errore sconosciuto' });
  });
  articles.sort((a,b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
  return { articles, errors };
}
async function getFeeds() {
  if (Date.now() - cache.timestamp < CACHE_TTL_MS && cache.timestamp > 0) return cache;
  const data = await fetchAllFeeds(); cache.timestamp = Date.now(); cache.articles = data.articles; cache.errors = data.errors; return cache;
}
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/api/sources', (req,res) => res.json({ sources: [...new Set(FEEDS.map(f=>f.name))].sort(), categories: [...new Set(FEEDS.map(f=>f.category))].sort() }));
app.get('/api/feeds', async (req,res) => {
  try { const data = await getFeeds(); res.json({ updatedAt:data.timestamp, count:data.articles.length, articles:data.articles, errors:data.errors }); }
  catch { res.status(500).json({ error:'Impossibile recuperare i feed RSS.' }); }
});
app.use('/api/redazione', requireRedazione);
app.get('/api/redazione/notes', async (req,res) => {
  try {
    if (!pool) return res.status(503).json({ error:'Archivio non configurato.' });
    const result = await pool.query('SELECT id,title,source,original_url,notes,extra_links,created_at,updated_at FROM editorial_notes ORDER BY updated_at DESC');
    res.json({ notes:result.rows });
  } catch { res.status(500).json({ error:'Errore nella lettura dell’archivio.' }); }
});
app.post('/api/redazione/notes', async (req,res) => {
  try {
    if (!pool) return res.status(503).json({ error:'Archivio non configurato.' });
    const { title='',source='',original_url='',notes='',extra_links='' } = req.body || {};
    const result = await pool.query('INSERT INTO editorial_notes (title,source,original_url,notes,extra_links) VALUES ($1,$2,$3,$4,$5) RETURNING id',[title,source,original_url,notes,extra_links]);
    res.status(201).json({ id:result.rows[0].id });
  } catch { res.status(500).json({ error:'Errore nel salvataggio.' }); }
});
app.put('/api/redazione/notes/:id', async (req,res) => {
  try {
    if (!pool) return res.status(503).json({ error:'Archivio non configurato.' });
    const { title='',source='',original_url='',notes='',extra_links='' } = req.body || {};
    const result = await pool.query('UPDATE editorial_notes SET title=$1,source=$2,original_url=$3,notes=$4,extra_links=$5,updated_at=NOW() WHERE id=$6 RETURNING id',[title,source,original_url,notes,extra_links,req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error:'Nota non trovata.' });
    res.json({ ok:true });
  } catch { res.status(500).json({ error:'Errore nella modifica.' }); }
});
app.delete('/api/redazione/notes/:id', async (req,res) => {
  try {
    if (!pool) return res.status(503).json({ error:'Archivio non configurato.' });
    await pool.query('DELETE FROM editorial_notes WHERE id=$1',[req.params.id]); res.json({ ok:true });
  } catch { res.status(500).json({ error:'Errore nella cancellazione.' }); }
});
const PORT = process.env.PORT || 3000;
async function start() {
  if (pool) await initDatabase();
  app.listen(PORT, () => console.log('BREAKING in ascolto su http://localhost:' + PORT));
}
start().catch(error => { console.error('Avvio database non riuscito:',error); process.exit(1); });
