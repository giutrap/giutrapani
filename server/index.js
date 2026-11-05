const path = require('path');
const crypto = require('crypto');
const express = require('express');
const Parser = require('rss-parser');
const { Pool } = require('pg');
const { FEEDS } = require('./feeds');
const app = express();
const RSS_TIMEOUT_MS = 74000;
const RSS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; BreakingNewsRSS/1.0; +https://breakingnewsognigiorno.onrender.com)',
  'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*'
};
const parser = new Parser({ timeout: RSS_TIMEOUT_MS, headers: RSS_HEADERS });

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      try { results[index] = { status:'fulfilled', value:await worker(items[index], index) }; }
      catch (reason) { results[index] = { status:'rejected', reason }; }
    }
  });
  await Promise.all(workers);
  return results;
}

const GOOGLE_NEWS_FALLBACKS = {
  'la Repubblica - Sport': [
    'https://news.google.com/rss/search?q=site%3Arepubblica.it%2Fsport&hl=it&gl=IT&ceid=IT%3Ait',
    'https://news.google.com/rss/search?q=site%3Awww.repubblica.it%2Fsport&hl=it-IT&gl=IT&ceid=IT%3Ait'
  ],
  'Il Giornale': [
    'https://news.google.com/rss/search?q=site%3Ailgiornale.it&hl=it&gl=IT&ceid=IT%3Ait',
    'https://news.google.com/rss/search?q=site%3Awww.ilgiornale.it&hl=it-IT&gl=IT&ceid=IT%3Ait'
  ],
  'Conferenza Episcopale Italiana': [
    'https://news.google.com/rss/search?q=site%3Achiesacattolica.it&hl=it&gl=IT&ceid=IT%3Ait',
    'https://news.google.com/rss/search?q=site%3Awww.chiesacattolica.it&hl=it-IT&gl=IT&ceid=IT%3Ait'
  ],
  'FISC - Settimanali cattolici': [
    'https://news.google.com/rss/search?q=site%3Afisc.it&hl=it&gl=IT&ceid=IT%3Ait',
    'https://news.google.com/rss/search?q=site%3Awww.fisc.it&hl=it-IT&gl=IT&ceid=IT%3Ait'
  ],
  'Avvenire': 'https://news.google.com/rss/search?q=site%3Aavvenire.it&hl=it&gl=IT&ceid=IT%3Ait',
  'Il Post': [
    'https://news.google.com/rss/search?q=site%3Ailpost.it&hl=it&gl=IT&ceid=IT%3Ait',
    'https://news.google.com/rss/search?q=site%3Awww.ilpost.it&hl=it-IT&gl=IT&ceid=IT%3Ait'
  ],
  'Fanpage.it': [
    'https://news.google.com/rss/search?q=site%3Afanpage.it&hl=it&gl=IT&ceid=IT%3Ait',
    'https://news.google.com/rss/search?q=site%3Awww.fanpage.it&hl=it-IT&gl=IT&ceid=IT%3Ait'
  ],
  'Limes - via Google News': [
    'https://news.google.com/rss/search?q=site%3Alimesonline.com&hl=it&gl=IT&ceid=IT%3Ait',
    'https://news.google.com/rss/search?q=site%3Awww.limesonline.com&hl=it-IT&gl=IT&ceid=IT%3Ait',
    'https://news.google.com/rss/search?q=Limes+geopolitica&hl=it&gl=IT&ceid=IT%3Ait'
  ],
  'Sky TG24': 'https://news.google.com/rss/search?q=site%3Atg24.sky.it&hl=it&gl=IT&ceid=IT%3Ait',
  'Start Magazine': 'https://news.google.com/rss/search?q=site%3Astartmag.it&hl=it&gl=IT&ceid=IT%3Ait',
  'Il Gazzettino - via Google News': [
    'https://news.google.com/rss/search?q=site%3Awww.ilgazzettino.it&hl=it&gl=IT&ceid=IT%3Ait',
    'https://news.google.com/rss/search?q=ilgazzettino.it&hl=it&gl=IT&ceid=IT%3Ait'
  ],
  'Il Tirreno - via Google News': [
    'https://news.google.com/rss/search?q=site%3Awww.iltirreno.it&hl=it&gl=IT&ceid=IT%3Ait',
    'https://news.google.com/rss/search?q=iltirreno.it&hl=it&gl=IT&ceid=IT%3Ait'
  ],
  'La Gazzetta del Mezzogiorno - via Google News': [
    'https://www.lagazzettadelmezzogiorno.it/rss.jsp?sezione=113',
    'https://news.google.com/rss/search?q=site%3Awww.lagazzettadelmezzogiorno.it&hl=it&gl=IT&ceid=IT%3Ait',
    'https://news.google.com/rss/search?q=lagazzettadelmezzogiorno.it&hl=it&gl=IT&ceid=IT%3Ait'
  ],
  'Domino - via Google News': [
    'https://news.google.com/rss/search?q=site%3Awww.rivistadomino.it&hl=it&gl=IT&ceid=IT%3Ait',
    'https://news.google.com/rss/search?q=rivista+Domino+Dario+Fabbri&hl=it&gl=IT&ceid=IT%3Ait'
  ]
};

function isTransientFeedError(error) {
  const status = Number(error?.statusCode || error?.status || error?.response?.statusCode || 0);
  return !status || status === 408 || status === 425 || status === 429 || status >= 500;
}

async function parseFeedUrl(url, timeout) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const parsed = await new Parser({ timeout, headers: RSS_HEADERS }).parseURL(url);
      return parsed;
    } catch (error) {
      lastError = error;
      if (attempt === 0 && isTransientFeedError(error)) {
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

async function parseSourceFeed(source, timeout = RSS_TIMEOUT_MS) {
  try {
    const primary = await parseFeedUrl(source.url, timeout);
    primary._breakingSourceUrl = source.url;
    primary._breakingFallbackUsed = false;
    return primary;
  } catch (primaryError) {
    const configuredFallbacks = GOOGLE_NEWS_FALLBACKS[source.name];
    const fallbackUrls = Array.isArray(configuredFallbacks)
      ? configuredFallbacks
      : configuredFallbacks ? [configuredFallbacks] : [];
    if (!fallbackUrls.length) throw primaryError;
    let fallbackError;
    for (const fallbackUrl of fallbackUrls) {
      try {
        const fallback = await parseFeedUrl(fallbackUrl, timeout);
        fallback._breakingSourceUrl = fallbackUrl;
        fallback._breakingFallbackUsed = true;
        fallback._breakingPrimaryError = String(primaryError.message || 'Feed principale non disponibile').slice(0, 220);
        console.warn('[RSS fallback] Fonte alternativa attiva:', source.name, fallbackUrl);
        return fallback;
      } catch (error) {
        fallbackError = error;
      }
    }
    throw new Error('Feed principale: ' + (primaryError.message || 'non disponibile') + '; alternative: ' + (fallbackError?.message || 'non disponibili'));
  }
}
const CACHE_TTL_MS = 60 * 1000;
const cache = { timestamp: 0, articles: [], errors: [] };
const insightSessions = new Map();
const INSIGHT_SESSION_TTL_MS = 2 * 60 * 1000;
const INSIGHT_EVENTS = new Set(['visit','article_open','podcast_open','social_open','trend_filter','category_filter','manual_refresh','live_open']);
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
  await pool.query("ALTER TABLE editorial_notes ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT ''");
  await pool.query("CREATE TABLE IF NOT EXISTS live_settings (id INTEGER PRIMARY KEY CHECK (id = 1), enabled BOOLEAN NOT NULL DEFAULT FALSE, video_id TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await pool.query("INSERT INTO live_settings (id, enabled, video_id, title, description) VALUES (1, TRUE, 'WUTDiO_fXdE', 'Diretta di prova', 'Primo test del player YouTube di Breaking') ON CONFLICT (id) DO NOTHING");
  await pool.query("CREATE TABLE IF NOT EXISTS podcast_settings (id INTEGER PRIMARY KEY CHECK (id = 1), enabled BOOLEAN NOT NULL DEFAULT FALSE, episode_id TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await pool.query("INSERT INTO podcast_settings (id, enabled, episode_id, url, title, description) VALUES (1, TRUE, '76168692', 'https://www.spreaker.com/episode/speciale-midterm-negli-usa-i-democratici-stravincono-le-elezioni-di-meta-mandato--76168692', 'Speciale Midterm negli USA: i Democratici stravincono le elezioni di metà mandato', 'Speciale dedicato alle elezioni di metà mandato negli Stati Uniti.') ON CONFLICT (id) DO NOTHING");
  await pool.query("CREATE TABLE IF NOT EXISTS media_settings (id INTEGER PRIMARY KEY CHECK (id = 1), enabled BOOLEAN NOT NULL DEFAULT FALSE, post_id TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', caption TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await pool.query("INSERT INTO media_settings (id,enabled,post_id,url,title,caption) VALUES (1,TRUE,'2117852081189216309','https://x.com/Iran_in_India/status/2117852081189216309/video/1','','') ON CONFLICT (id) DO NOTHING");
  await pool.query("UPDATE media_settings SET enabled=TRUE, post_id='2116057861448966355', url='https://x.com/sarrah_bellus/status/2116057861448966355/video/1', title='', caption='', updated_at=NOW() WHERE id=1 AND post_id='2117852081189216309'");
  await pool.query('CREATE TABLE IF NOT EXISTS insight_daily (day DATE NOT NULL, event TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day,event))');
  await pool.query('CREATE TABLE IF NOT EXISTS x_feed_cache (id INTEGER PRIMARY KEY CHECK (id = 1), item JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  await pool.query("CREATE TABLE IF NOT EXISTS poll_settings (id INTEGER PRIMARY KEY CHECK (id = 1), question TEXT NOT NULL DEFAULT '', options JSONB NOT NULL DEFAULT '[]'::jsonb, starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ, enabled BOOLEAN NOT NULL DEFAULT FALSE, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await pool.query("CREATE TABLE IF NOT EXISTS poll_votes (id BIGSERIAL PRIMARY KEY, poll_id INTEGER NOT NULL DEFAULT 1, voter_hash TEXT NOT NULL, option_index INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(poll_id,voter_hash))");
  const savedX = await pool.query('SELECT item FROM x_feed_cache WHERE id=1');
  if (savedX.rowCount && savedX.rows[0].item) xPostCache.items = [savedX.rows[0].item];
}
const X_FEED_URLS = [
  'https://rss.app/feeds/OvP3XcTYa2zjZUcZ.xml',
  'https://nitter.mie.foundation/giutrapani/rss',
  'https://nitter.mizuki.st/giutrapani/rss',
  'https://rsshub.app/twitter/user/giutrapani'
];

const xPostCache = { items: [], updatedAt: 0 };

async function fetchXPosts(source) {
  const attempts = await Promise.allSettled(X_FEED_URLS.map(async (url) => {
    const feed = await new Parser({ timeout: 72000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BreakingNewsRSS/1.0)' } }).parseURL(url);
    return (feed.items || []).map(item => normalizeItem(item, source)).filter(item => item.title && item.link);
  }));
  const combined = [];
  const seen = new Set();
  attempts.forEach((attempt, index) => {
    if (attempt.status === 'fulfilled') {
      console.log('[X RSS]', X_FEED_URLS[index], 'articoli:', attempt.value.length);
      for (const item of attempt.value) {
        const key = item.link || item.title;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        combined.push(item);
      }
    } else {
      console.warn('[X RSS] fonte non disponibile:', X_FEED_URLS[index], attempt.reason?.message || 'errore');
    }
  });
  combined.sort((a, b) => {
    const da = Date.parse(a.pubDate || '') || 0;
    const db = Date.parse(b.pubDate || '') || 0;
    return db - da;
  });
  if (combined.length) {
    xPostCache.items = [combined[0]];
    xPostCache.updatedAt = Date.now();
    if (pool) {
      try {
        await pool.query('INSERT INTO x_feed_cache (id,item,updated_at) VALUES (1,$1,NOW()) ON CONFLICT (id) DO UPDATE SET item=EXCLUDED.item,updated_at=NOW()', [JSON.stringify(combined[0])]);
      } catch (error) { console.warn('[X RSS] impossibile salvare la cache persistente:', error.message); }
    }
    return xPostCache.items;
  }
  if (xPostCache.items.length) {
    console.warn('[X RSS] nessuna fonte ha restituito post: mostro l’ultimo post salvato.');
    return xPostCache.items.slice(0, 1);
  }
  const errors = attempts.filter(x => x.status === 'rejected').map(x => x.reason?.message || 'feed non disponibile');
  throw new Error(errors.join(' | ').slice(0, 220) || 'Feed X raggiungibili ma senza post');
}
function normalizeItem(item, source) {
  const rawSummary = item.contentSnippet || item.summary || item.content || '';
  return { title: (item.title || '').trim(), link: item.link || item.guid || '', pubDate: item.isoDate || item.pubDate || null, summary: rawSummary.replace(/\\s+/g, ' ').trim().slice(0, 280), source: source.name, category: source.category };
}
async function fetchAllFeeds() {
  const settled = await mapWithConcurrency(FEEDS, 10, async source => {
    if (source.name === '@giutrapani · X') return fetchXPosts(source);
    const feed = source.name === 'Il Riformista'
      ? await new Parser({ timeout: 90000, headers: RSS_HEADERS }).parseURL(source.url)
      : await parseSourceFeed(source);
    const items = (feed.items || []).map(item => normalizeItem(item, source));
    if (source.name === 'Il Riformista') {
      items.sort((a,b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
      return items.slice(0, 2);
    }
    return items;
  });
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
    const feed = await parseSourceFeed(source, RSS_TIMEOUT_MS);
    const items = feed.items || [];
    const dates = items.map(item => new Date(item.isoDate || item.pubDate || 0)).filter(date => !Number.isNaN(date.getTime()) && date.getTime() > 0);
    const latest = dates.length ? new Date(Math.max(...dates.map(date => date.getTime()))).toISOString() : null;
    const ageHours = latest ? (Date.now() - new Date(latest).getTime()) / 3600000 : null;
    const fallbackUsed = feed._breakingFallbackUsed === true;
    const status = !items.length ? 'empty' : ageHours > 168 ? 'stale' : fallbackUsed ? 'fallback' : 'ok';
    return {
      name: source.name, category: source.category, url: source.url,
      resolvedUrl: feed._breakingSourceUrl || source.url,
      fallbackUsed,
      status,
      count: items.length, latestPublishedAt: latest,
      ageHours: ageHours === null ? null : Math.round(ageHours * 10) / 10,
      checkedAt,
      primaryError: feed._breakingPrimaryError || null,
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
    const workers = Array.from({ length: Math.min(6, FEEDS.length) }, async () => {
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

function pruneInsightSessions() {
  const cutoff = Date.now() - INSIGHT_SESSION_TTL_MS;
  for (const [id,session] of insightSessions) if (session.lastSeen < cutoff) insightSessions.delete(id);
}
app.post('/api/insight/collect', async (req,res) => {
  const { sessionId, event, audience } = req.body || {};
  if (typeof sessionId !== 'string' || !/^[a-f0-9-]{36}$/i.test(sessionId)) return res.status(400).json({ error:'Sessione non valida.' });
  if (event === 'heartbeat') {
    pruneInsightSessions();
    insightSessions.set(sessionId,{ lastSeen:Date.now(), audience:audience === 'redazione' ? 'redazione' : 'pubblico' });
    return res.status(204).end();
  }
  if (!INSIGHT_EVENTS.has(event)) return res.status(400).json({ error:'Evento non riconosciuto.' });
  if (!pool) return res.status(204).end();
  try {
    await pool.query("INSERT INTO insight_daily (day,event,count) VALUES ((NOW() AT TIME ZONE 'Europe/Rome')::date,$1,1) ON CONFLICT (day,event) DO UPDATE SET count=insight_daily.count+1",[event]);
    res.status(204).end();
  } catch { res.status(503).json({ error:'Raccolta statistiche temporaneamente non disponibile.' }); }
});

function pollVoterHash(voterId) {
  return crypto.createHash('sha256').update('breaking-poll-v1:' + voterId).digest('hex');
}
function pollState(row, now = Date.now()) {
  if (!row || !row.question || !Array.isArray(row.options) || !row.options.length) return 'empty';
  const start = row.starts_at ? new Date(row.starts_at).getTime() : 0;
  const end = row.ends_at ? new Date(row.ends_at).getTime() : 0;
  if (now < start) return 'scheduled';
  if (row.enabled && now <= end) return 'active';
  return 'closed';
}
async function readPollResults() {
  const result = await pool.query('SELECT option_index,COUNT(*)::int AS votes FROM poll_votes WHERE poll_id=1 GROUP BY option_index');
  return result.rows;
}
app.get('/api/poll', async (req,res) => {
  try {
    if (!pool) return res.json({ visible:false });
    const result = await pool.query('SELECT question,options,starts_at,ends_at,enabled FROM poll_settings WHERE id=1');
    const row = result.rows[0], status = pollState(row);
    if (!row || status === 'empty' || status === 'scheduled') return res.json({ visible:false, status });
    const counts = await readPollResults();
    const options = (row.options || []).map((label,index)=>({ label, votes:Number(counts.find(item=>item.option_index===index)?.votes || 0) }));
    const voterId = String(req.query.voterId || '');
    const alreadyVoted = /^[a-f0-9-]{36}$/i.test(voterId) ? (await pool.query('SELECT 1 FROM poll_votes WHERE poll_id=1 AND voter_hash=$1',[pollVoterHash(voterId)])).rowCount > 0 : false;
    res.json({ visible:true, question:row.question, options, total:options.reduce((sum,item)=>sum+item.votes,0), status, startsAt:row.starts_at, endsAt:row.ends_at, alreadyVoted });
  } catch { res.status(500).json({ error:'Sondaggio temporaneamente non disponibile.' }); }
});
app.post('/api/poll/vote', async (req,res) => {
  try {
    if (!pool) return res.status(503).json({ error:'Archivio non configurato.' });
    const { voterId, optionIndex } = req.body || {};
    if (typeof voterId !== 'string' || !/^[a-f0-9-]{36}$/i.test(voterId)) return res.status(400).json({ error:'Identificativo di voto non valido.' });
    if (!Number.isInteger(optionIndex) || optionIndex < 0) return res.status(400).json({ error:'Seleziona una risposta.' });
    const result = await pool.query('SELECT options,starts_at,ends_at,enabled,question FROM poll_settings WHERE id=1');
    const row = result.rows[0];
    if (pollState(row) !== 'active') return res.status(409).json({ error:'Il sondaggio non è attivo.' });
    if (optionIndex >= row.options.length) return res.status(400).json({ error:'Risposta non valida.' });
    try { await pool.query('INSERT INTO poll_votes (poll_id,voter_hash,option_index) VALUES (1,$1,$2)',[pollVoterHash(voterId),optionIndex]); }
    catch (error) { if (error.code === '23505') return res.status(409).json({ error:'Hai già partecipato a questo sondaggio.' }); throw error; }
    res.json({ ok:true });
  } catch { res.status(500).json({ error:'Non è stato possibile registrare il voto.' }); }
});
app.get('/api/redazione/poll', requireRedazione, async (req,res) => {
  try {
    if (!pool) return res.status(503).json({ error:'Archivio non configurato.' });
    const result = await pool.query('SELECT question,options,starts_at,ends_at,enabled FROM poll_settings WHERE id=1');
    const row=result.rows[0] || {}, counts=await readPollResults();
    const options=(row.options || []).map((label,index)=>({label,votes:Number(counts.find(item=>item.option_index===index)?.votes || 0)}));
    res.json({question:row.question || '',options,startsAt:row.starts_at || null,endsAt:row.ends_at || null,enabled:row.enabled === true,status:pollState(row),total:options.reduce((sum,item)=>sum+item.votes,0)});
  } catch { res.status(500).json({ error:'Impostazioni sondaggio non disponibili.' }); }
});
app.put('/api/redazione/poll', requireRedazione, async (req,res) => {
  try {
    if (!pool) return res.status(503).json({ error:'Archivio non configurato.' });
    const {question='',options=[],startsAt='',endsAt='',enabled=true}=req.body || {};
    const safeQuestion=String(question).trim().slice(0,240);
    const safeOptions=Array.isArray(options)?options.map(value=>String(value).trim().slice(0,120)).filter(Boolean):[];
    if (!safeQuestion) return res.status(400).json({error:'Inserisci la domanda del sondaggio.'});
    if (safeOptions.length<3 || safeOptions.length>4) return res.status(400).json({error:'Inserisci tre o quattro risposte.'});
    if (new Set(safeOptions.map(value=>value.toLocaleLowerCase('it'))).size!==safeOptions.length) return res.status(400).json({error:'Le risposte devono essere diverse.'});
    const start=new Date(startsAt),end=new Date(endsAt);
    if (!startsAt || !endsAt || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return res.status(400).json({error:'Imposta data e ora di inizio e di fine.'});
    if (end<=start) return res.status(400).json({error:'La fine deve essere successiva all’inizio.'});
    const previous=await pool.query('SELECT question,options FROM poll_settings WHERE id=1'),old=previous.rows[0];
    const changed=old && (old.question!==safeQuestion || JSON.stringify(old.options)!==JSON.stringify(safeOptions));
    if (changed) await pool.query('DELETE FROM poll_votes WHERE poll_id=1');
    await pool.query('INSERT INTO poll_settings (id,question,options,starts_at,ends_at,enabled,updated_at) VALUES (1,$1,$2::jsonb,$3,$4,$5,NOW()) ON CONFLICT (id) DO UPDATE SET question=EXCLUDED.question,options=EXCLUDED.options,starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,enabled=EXCLUDED.enabled,updated_at=NOW()',[safeQuestion,JSON.stringify(safeOptions),start.toISOString(),end.toISOString(),enabled===true]);
    res.json({ok:true,status:pollState({question:safeQuestion,options:safeOptions,starts_at:start,ends_at:end,enabled:enabled===true})});
  } catch { res.status(500).json({error:'Salvataggio del sondaggio non riuscito.'}); }
});
app.post('/api/redazione/poll/close', requireRedazione, async (req,res) => {
  try {
    if (!pool) return res.status(503).json({error:'Archivio non configurato.'});
    await pool.query('UPDATE poll_settings SET enabled=FALSE,updated_at=NOW() WHERE id=1');
    res.json({ok:true});
  } catch { res.status(500).json({error:'Chiusura del sondaggio non riuscita.'}); }
});

app.get('/api/live', async (req,res) => {
  try {
    if (!pool) return res.json({ enabled:false, videoId:'', title:'', description:'' });
    const result = await pool.query('SELECT enabled,video_id,title,description FROM live_settings WHERE id=1');
    const live = result.rows[0] || {};
    res.json({ enabled:live.enabled === true, videoId:live.video_id || '', title:live.title || '', description:live.description || '' });
  } catch { res.status(500).json({ error:'Stato della diretta non disponibile.' }); }
});
app.get('/api/podcast', async (req,res) => {
  try {
    if (!pool) return res.json({ enabled:false, episodeId:'', title:'', description:'' });
    const result = await pool.query('SELECT enabled,episode_id,url,title,description FROM podcast_settings WHERE id=1');
    const item = result.rows[0] || {};
    res.json({ enabled:item.enabled === true, episodeId:item.episode_id || '', url:item.url || '', title:item.title || '', description:item.description || '' });
  } catch { res.status(500).json({ error:'Stato del podcast non disponibile.' }); }
});
app.get('/api/media', async (req,res) => {
  try {
    if (!pool) return res.json({ enabled:false, postId:'', postUrl:'', title:'', caption:'' });
    const result = await pool.query('SELECT enabled,post_id,url,title,caption FROM media_settings WHERE id=1');
    const item = result.rows[0] || {};
    res.json({ enabled:item.enabled === true, postId:item.post_id || '', postUrl:item.url || '', title:item.title || '', caption:item.caption || '' });
  } catch { res.status(500).json({ error:'Contenuto media non disponibile.' }); }
});
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
    const result = await pool.query("SELECT id,title,source,notes,extra_links,image_url,published_at FROM editorial_notes WHERE published_at IS NOT NULL ORDER BY published_at DESC");
    res.json({ notes:result.rows });
  } catch { res.status(500).json({ error:'Impossibile leggere i contenuti della redazione.' }); }
});
app.get('/api/redazione/public/:id', async (req,res) => {
  try {
    if (!pool) return res.status(503).json({ error:'Archivio non configurato.' });
    const result = await pool.query("SELECT id,title,source,original_url,notes,extra_links,image_url,published_at FROM editorial_notes WHERE id=$1 AND published_at IS NOT NULL",[req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error:'Contenuto non trovato.' });
    res.json({ note:result.rows[0] });
  } catch { res.status(500).json({ error:'Impossibile leggere il contenuto.' }); }
});
app.use('/api/redazione', requireRedazione);

app.get('/api/redazione/insights', async (req,res) => {
  try {
    if (!pool) return res.status(503).json({ error:'Archivio statistiche non configurato.' });
    pruneInsightSessions();
    const result = await pool.query("SELECT day::text AS day,event,count FROM insight_daily WHERE day >= (NOW() AT TIME ZONE 'Europe/Rome')::date - 6 ORDER BY day ASC,event ASC");
    const rows = result.rows;
    const today = new Date().toLocaleDateString('en-CA',{ timeZone:'Europe/Rome' });
    const totals = rows.filter(row => row.day === today).reduce((acc,row) => { acc[row.event] = Number(row.count); return acc; },{});
    const days = [];
    for (let offset=6;offset>=0;offset--) {
      const date = new Date(Date.now() - offset*86400000);
      const key = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
      const dayRows = rows.filter(row => row.day === key);
      days.push({ day:key, visits:dayRows.filter(row=>row.event==='visit').reduce((n,row)=>n+Number(row.count),0), articles:dayRows.filter(row=>row.event==='article_open').reduce((n,row)=>n+Number(row.count),0), interactions:dayRows.filter(row=>row.event!=='visit').reduce((n,row)=>n+Number(row.count),0) });
    }
    const activeSessions = [...insightSessions.values()].filter(session=>session.audience==='pubblico').length;
    const editorialSessions = [...insightSessions.values()].filter(session=>session.audience==='redazione').length;
    res.json({ activeSessions, editorialSessions, today:totals, days, events:rows.filter(row=>row.day===today).map(row=>({event:row.event,count:Number(row.count)})), refreshedAt:new Date().toISOString() });
  } catch { res.status(500).json({ error:'Statistiche non disponibili.' }); }
});
app.get('/api/redazione/live', async (req,res) => {
  try {
    if (!pool) return res.status(503).json({ error:'Archivio non configurato.' });
    const result = await pool.query('SELECT enabled,video_id,title,description FROM live_settings WHERE id=1');
    const live = result.rows[0] || {};
    res.json({ enabled:live.enabled === true, videoId:live.video_id || '', title:live.title || '', description:live.description || '' });
  } catch { res.status(500).json({ error:'Impostazioni LIVE non disponibili.' }); }
});
app.put('/api/redazione/live', async (req,res) => {
  try {
    if (!pool) return res.status(503).json({ error:'Archivio non configurato.' });
    const { enabled=false, url='', title='', description='' } = req.body || {};
    let videoId = '';
    if (enabled) {
      let parsed;
      try { parsed = new URL(String(url)); } catch { return res.status(400).json({ error:'Inserisci un link YouTube valido.' }); }
      const host = parsed.hostname.toLowerCase().replace(/^www\./,'');
      if (!['youtube.com','m.youtube.com','youtu.be','youtube-nocookie.com'].includes(host)) return res.status(400).json({ error:'Il collegamento deve appartenere a YouTube.' });
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      const embedIndex = pathParts.findIndex(part => ['embed','live','shorts'].includes(part));
      videoId = host === 'youtu.be' ? pathParts[0] : (parsed.searchParams.get('v') || (embedIndex >= 0 ? pathParts[embedIndex + 1] : '') || '');
      if (!/^[A-Za-z0-9_-]{11}$/.test(videoId || '')) return res.status(400).json({ error:'Non riesco a riconoscere l’ID del video. Usa il link standard della diretta YouTube.' });
    }
    const safeTitle = String(title || '').trim().slice(0,140);
    const safeDescription = String(description || '').trim().slice(0,400);
    const result = await pool.query('INSERT INTO live_settings (id,enabled,video_id,title,description,updated_at) VALUES (1,$1,$2,$3,$4,NOW()) ON CONFLICT (id) DO UPDATE SET enabled=EXCLUDED.enabled,video_id=EXCLUDED.video_id,title=EXCLUDED.title,description=EXCLUDED.description,updated_at=NOW() RETURNING enabled,video_id,title,description',[Boolean(enabled),videoId,safeTitle,safeDescription]);
    const live = result.rows[0];
    res.json({ enabled:live.enabled === true, videoId:live.video_id || '', title:live.title || '', description:live.description || '' });
  } catch { res.status(500).json({ error:'Non è stato possibile aggiornare la diretta.' }); }
});
app.get('/api/redazione/podcast', async (req,res) => {
  try {
    if (!pool) return res.status(503).json({ error:'Archivio non configurato.' });
    const result = await pool.query('SELECT enabled,episode_id,url,title,description FROM podcast_settings WHERE id=1');
    const item = result.rows[0] || {};
    res.json({ enabled:item.enabled === true, episodeId:item.episode_id || '', url:item.url || '', title:item.title || '', description:item.description || '' });
  } catch { res.status(500).json({ error:'Impostazioni podcast non disponibili.' }); }
});
app.put('/api/redazione/podcast', async (req,res) => {
  try {
    if (!pool) return res.status(503).json({ error:'Archivio non configurato.' });
    const { enabled=false, url='', title='', description='' } = req.body || {};
    let episodeId = '', safeUrl = '';
    if (enabled) {
      let parsed;
      try { parsed = new URL(String(url)); } catch { return res.status(400).json({ error:'Inserisci un collegamento valido.' }); }
      if (!['http:', 'https:'].includes(parsed.protocol)) return res.status(400).json({ error:'Il collegamento deve iniziare con https:// oppure http://.' });
      if (!parsed.hostname || parsed.username || parsed.password) return res.status(400).json({ error:'Inserisci un indirizzo web valido.' });
      if (!String(title).trim()) return res.status(400).json({ error:'Inserisci un titolo per il podcast.' });
      safeUrl = parsed.toString();
    }
    const safeTitle = String(title || '').trim().slice(0,180);
    const safeDescription = String(description || '').trim().slice(0,500);
    const result = await pool.query('INSERT INTO podcast_settings (id,enabled,episode_id,url,title,description,updated_at) VALUES (1,$1,$2,$3,$4,$5,NOW()) ON CONFLICT (id) DO UPDATE SET enabled=EXCLUDED.enabled,episode_id=EXCLUDED.episode_id,url=EXCLUDED.url,title=EXCLUDED.title,description=EXCLUDED.description,updated_at=NOW() RETURNING enabled,episode_id,url,title,description',[Boolean(enabled),episodeId,safeUrl,safeTitle,safeDescription]);
    const item = result.rows[0];
    res.json({ enabled:item.enabled === true, episodeId:item.episode_id || '', url:item.url || '', title:item.title || '', description:item.description || '' });
  } catch { res.status(500).json({ error:'Non è stato possibile aggiornare il podcast.' }); }
});
app.get('/api/redazione/media', async (req,res) => {
  try {
    if (!pool) return res.status(503).json({ error:'Archivio non configurato.' });
    const result = await pool.query('SELECT enabled,post_id,url,title,caption FROM media_settings WHERE id=1');
    const item = result.rows[0] || {};
    res.json({ enabled:item.enabled === true, postId:item.post_id || '', url:item.url || '', title:item.title || '', caption:item.caption || '' });
  } catch { res.status(500).json({ error:'Impostazioni media non disponibili.' }); }
});
app.put('/api/redazione/media', async (req,res) => {
  try {
    if (!pool) return res.status(503).json({ error:'Archivio non configurato.' });
    const { enabled=false, url='', title='', caption='' } = req.body || {};
    let postId = '', safeUrl = '';
    if (enabled) {
      let parsed;
      try { parsed = new URL(String(url)); } catch { return res.status(400).json({ error:'Inserisci un link X valido.' }); }
      if (parsed.protocol !== 'https:') return res.status(400).json({ error:'Il collegamento social deve utilizzare HTTPS.' });
      const rawHost = parsed.hostname.toLowerCase();
      if (!rawHost || rawHost.includes(' ')) return res.status(400).json({ error:'Inserisci un collegamento social valido.' });
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      const statusIndex = pathParts.indexOf('status');
      postId = statusIndex >= 0 ? (pathParts[statusIndex + 1] || '') : '';
      safeUrl = parsed.href;
    }
    const safeTitle = String(title || '').trim().slice(0,180);
    const safeCaption = String(caption || '').trim().slice(0,500);
    const result = await pool.query('INSERT INTO media_settings (id,enabled,post_id,url,title,caption,updated_at) VALUES (1,$1,$2,$3,$4,$5,NOW()) ON CONFLICT (id) DO UPDATE SET enabled=EXCLUDED.enabled,post_id=EXCLUDED.post_id,url=EXCLUDED.url,title=EXCLUDED.title,caption=EXCLUDED.caption,updated_at=NOW() RETURNING enabled,post_id,url,title,caption',[Boolean(enabled),postId,safeUrl,safeTitle,safeCaption]);
    const item = result.rows[0];
    res.json({ enabled:item.enabled === true, postId:item.post_id || '', postUrl:item.url || '', title:item.title || '', caption:item.caption || '' });
  } catch { res.status(500).json({ error:'Non è stato possibile aggiornare il contenuto media.' }); }
});
app.get('/api/redazione/notes', async (req,res) => {
  try {
    if (!pool) return res.status(503).json({ error:'Archivio non configurato.' });
    const result = await pool.query('SELECT id,title,source,original_url,notes,extra_links,image_url,published_at,created_at,updated_at FROM editorial_notes ORDER BY updated_at DESC');
    res.json({ notes:result.rows });
  } catch { res.status(500).json({ error:'Errore nella lettura dell’archivio.' }); }
});
app.post('/api/redazione/notes', async (req,res) => {
  try {
    if (!pool) return res.status(503).json({ error:'Archivio non configurato.' });
    const { title='',source='',original_url='',image_url='',notes='',extra_links='' } = req.body || {};
    let safeImage = '';
    if (String(image_url).trim()) {
      let parsed;
      try { parsed = new URL(String(image_url).trim()); } catch { return res.status(400).json({ error:'Inserisci un link immagine valido.' }); }
      if (parsed.protocol !== 'https:' || !parsed.hostname) return res.status(400).json({ error:'Il link dell’immagine deve iniziare con https://.' });
      safeImage = parsed.href;
    }
    const result = await pool.query('INSERT INTO editorial_notes (title,source,original_url,image_url,notes,extra_links) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',[title,source,original_url,safeImage,notes,extra_links]);
    res.status(201).json({ id:result.rows[0].id });
  } catch { res.status(500).json({ error:'Errore nel salvataggio.' }); }
});
app.put('/api/redazione/notes/:id', async (req,res) => {
  try {
    if (!pool) return res.status(503).json({ error:'Archivio non configurato.' });
    const { title='',source='',original_url='',image_url='',notes='',extra_links='' } = req.body || {};
    let safeImage = '';
    if (String(image_url).trim()) {
      let parsed;
      try { parsed = new URL(String(image_url).trim()); } catch { return res.status(400).json({ error:'Inserisci un link immagine valido.' }); }
      if (parsed.protocol !== 'https:' || !parsed.hostname) return res.status(400).json({ error:'Il link dell’immagine deve iniziare con https://.' });
      safeImage = parsed.href;
    }
    const result = await pool.query('UPDATE editorial_notes SET title=$1,source=$2,original_url=$3,image_url=$4,notes=$5,extra_links=$6,updated_at=NOW() WHERE id=$7 RETURNING id',[title,source,original_url,safeImage,notes,extra_links,req.params.id]);
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
