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
  const ddl = `CREATE TABLE IF NOT EXISTS editorial_notes (id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', original_url TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', extra_links TEXT NOT NULL DEFAULT '', published_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  await pool.query(ddl);
  await pool.query('ALTER TABLE editorial_notes ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ');
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
    if (source.name === '@giutrapani · X' || source.name === 'Il Riformista') {
      items.sort((a,b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
      return items.slice(0, source.name === '@giutrapani · X' ? 10 : 2);
    }
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
const DIAGNOSTICS_CACHE_MS = 10 * 60 * 1000;
let diagnosticsCache = { checkedAt: 0, results: [] };
let diagnosticsPromise = null;

async function checkOneFeed(source) {
  const checkedAt = new Date().toISOString();
  try {
    const feed = await new Parser({ timeout: 7000 }).parseURL(source.url);
    const items = feed.items || [];
    const dates = items.map(item => new Date(item.isoDate || item.pubDate || 0)).filter(date => !Number.isNaN(date.getTime()) && date.getTime() > 0);
    const latest = dates.length ? new Date(Math.max(...dates.map(date => date.getTime()))).toISOString() : null;
    const ageHours = latest ? (Date.now() - new Date(latest).getTime()) / 3600000 : null;
    return {
      name: source.name, category: source.category, url: source.url,
      status: !items.length ? 'empty' : ageHours > 168 ? 'stale' : 'ok',
      count: items.length, latestPublishedAt: latest, checkedAt,
      error: !items.length ? 'Feed raggiungibile ma senza articoli.' : ageHours > 168 ? 'Ultimo contenuto più vecchio di 7 giorni.' : null
    };
  } catch (error) {
    return { name: source.name, category: source.category, url: source.url, status: 'error', count: 0, latestPublishedAt: null, checkedAt, error: String(error.message || 'Errore di lettura').slice(0, 220) };
  }
}
async function runFeedDiagnostics(force = false) {
  if (!force && diagnosticsCache.checkedAt && Date.now() - diagnosticsCache.checkedAt < DIAGNOSTICS_CACHE_MS) return diagnosticsCache;
  if (diagnosticsPromise) return diagnosticsPromise;
  diagnosticsPromise = (async () => {
    const results = new Array(FEEDS.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(16, FEEDS.length) }, async () => {
      while (true) {
        const index = next++;
        if (index >= FEEDS.length) return;
        results[index] = await checkOneFeed(FEEDS[index]);
      }
    });
    await Promise.all(workers);
    diagnosticsCache = { checkedAt: Date.now(), results };
    diagnosticsPromise = null;
    return diagnosticsCache;
  })();
  try { return await diagnosticsPromise; }
  catch (error) { diagnosticsPromise = null; throw error; }
}

async function getFeeds() {
  if (Date.now() - cache.timestamp < CACHE_TTL_MS && cache.timestamp > 0) return cache;
  const data = await fetchAllFeeds(); cache.timestamp = Date.now(); cache.articles = data.articles; cache.errors = data.errors; return cache;
}
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/api/sources', (req,res) => res.json({ sources: [...new Set(FEEDS.map(f=>f.name))].sort(), categories: [...new Set(FEEDS.map(f=>f.category))].sort() }));
app.get('/api/diagnostics/feeds', async (req,res) => {
  try {
    const data = await runFeedDiagnostics(req.query.force === '1');
    const counts = data.results.reduce((acc,item) => { acc[item.status] = (acc[item.status] || 0) + 1; return acc; }, {});
    res.json({ checkedAt: new Date(data.checkedAt).toISOString(), total: data.results.length, counts, results: data.results });
  } catch { res.status(500).json({ error: 'Diagnostica delle fonti non disponibile.' }); }
});
app.get('/api/feeds', async (req,res) => {
  try { const data = await getFeeds(); res.json({ updatedAt:data.timestamp, count:data.articles.length, articles:data.articles, errors:data.errors }); }
  catch { res.status(500).json({ error:'Impossibile recuperare i feed RSS.' }); }
});
// I contenuti pubblicati sono consultabili senza credenziali; le bozze restano private.
app.get('/api/redazione/published', async (req,res) => {
  try {
    if (!pool) return res.status(503).json({ error:'Archivio non configurato.' });
    const result = await pool.query("SELECT id,title,source,notes,extra_links,published_at FROM editorial_notes WHERE published_at IS NOT NULL ORDER BY published_at DESC");
    res.json({ notes:result.rows });
  } catch { res.status(500).json({ error:'Impossibile leggere i contenuti della redazione.' }); }
});
app.get('/api/redazione/public/:id', async (req,res) => {
  try {
    if (!pool) return res.status(503).json({ error:'Archivio non configurato.' });
    const result = await pool.query("SELECT id,title,source,original_url,notes,extra_links,published_at FROM editorial_notes WHERE id=$1 AND published_at IS NOT NULL",[req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error:'Contenuto non trovato.' });
    res.json({ note:result.rows[0] });
  } catch { res.status(500).json({ error:'Impossibile leggere il contenuto.' }); }
});
app.use('/api/redazione', requireRedazione);
app.get('/api/redazione/notes', async (req,res) => {
  try {
    if (!pool) return res.status(503).json({ error:'Archivio non configurato.' });
    const result = await pool.query('SELECT id,title,source,original_url,notes,extra_links,published_at,created_at,updated_at FROM editorial_notes ORDER BY updated_at DESC');
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
app.post('/api/redazione/notes/:id/publish', async (req,res) => {
  try {
    if (!pool) return res.status(503).json({ error:'Archivio non configurato.' });
    const result = await pool.query("UPDATE editorial_notes SET published_at=COALESCE(published_at,NOW()),updated_at=NOW() WHERE id=$1 RETURNING id,published_at",[req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error:'Nota non trovata.' });
    res.json({ ok:true, published_at:result.rows[0].published_at });
  } catch { res.status(500).json({ error:'Pubblicazione non riuscita.' }); }
});
app.post('/api/redazione/notes/:id/unpublish', async (req,res) => {
  try {
    if (!pool) return res.status(503).json({ error:'Archivio non configurato.' });
    const result = await pool.query("UPDATE editorial_notes SET published_at=NULL,updated_at=NOW() WHERE id=$1 RETURNING id",[req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error:'Nota non trovata.' });
    res.json({ ok:true });
  } catch { res.status(500).json({ error:'Operazione non riuscita.' }); }
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
