const path = require('path');
const crypto = require('crypto');
const express = require('express');
const Parser = require('rss-parser');
const { Pool } = require('pg');
const { FEEDS } = require('./feeds');
const app = express();
const RSS_TIMEOUT_MS = 9000;
const MAX_ITEMS_PER_SOURCE = 10;
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
  // Le risposte 429/5xx sono spesso temporanee: tre tentativi distanziati
  // evitano di dichiarare guasto un feed per un singolo errore del provider.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const parsed = await new Parser({ timeout, headers: RSS_HEADERS }).parseURL(url);
      return parsed;
    } catch (error) {
      lastError = error;
      if (attempt < 1 && isTransientFeedError(error)) {
        const delay = 500;
        await new Promise(resolve => setTimeout(resolve, delay));
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
const CACHE_TTL_MS = 5 * 60 * 1000;
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
  await pool.query("CREATE TABLE IF NOT EXISTS rss_cache (id INTEGER PRIMARY KEY CHECK (id=1), payload JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await pool.query('ALTER TABLE editorial_notes ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ');
  await pool.query("ALTER TABLE editorial_notes ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT ''");
  await pool.query("CREATE TABLE IF NOT EXISTS featured_news (id INTEGER PRIMARY KEY CHECK (id = 1), article JSONB NOT NULL, pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await pool.query("CREATE TABLE IF NOT EXISTS editorial_highlights (slot TEXT PRIMARY KEY CHECK (slot IN ('featured','urgent','developing')), article JSONB NOT NULL, pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await pool.query("INSERT INTO editorial_highlights (slot,article,pinned_at) SELECT 'featured',article,pinned_at FROM featured_news WHERE id=1 ON CONFLICT (slot) DO NOTHING");
  await pool.query("CREATE TABLE IF NOT EXISTS live_settings (id INTEGER PRIMARY KEY CHECK (id = 1), enabled BOOLEAN NOT NULL DEFAULT FALSE, video_id TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await pool.query("INSERT INTO live_settings (id, enabled, video_id, title, description) VALUES (1, TRUE, 'WUTDiO_fXdE', 'Diretta di prova', 'Primo test del player YouTube di Breaking') ON CONFLICT (id) DO NOTHING");
  await pool.query("CREATE TABLE IF NOT EXISTS podcast_settings (id INTEGER PRIMARY KEY CHECK (id = 1), enabled BOOLEAN NOT NULL DEFAULT FALSE, episode_id TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await pool.query("INSERT INTO podcast_settings (id, enabled, episode_id, url, title, description) VALUES (1, TRUE, '76168692', 'https://www.spreaker.com/episode/speciale-midterm-negli-usa-i-democratici-stravincono-le-elezioni-di-meta-mandato--76168692', 'Speciale Midterm negli USA: i Democratici stravincono le elezioni di metà mandato', 'Speciale dedicato alle elezioni di metà mandato negli Stati Uniti.') ON CONFLICT (id) DO NOTHING");
  await pool.query("CREATE TABLE IF NOT EXISTS media_settings (id INTEGER PRIMARY KEY CHECK (id = 1), enabled BOOLEAN NOT NULL DEFAULT FALSE, post_id TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', caption TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await pool.query("INSERT INTO media_settings (id,enabled,post_id,url,title,caption) VALUES (1,TRUE,'2117852081189216309','https://x.com/Iran_in_India/status/2117852081189216309/video/1','','') ON CONFLICT (id) DO NOTHING");
  await pool.query("UPDATE media_settings SET enabled=TRUE, post_id='2116057861448966355', url='https://x.com/sarrah_bellus/status/2116057861448966355/video/1', title='', caption='', updated_at=NOW() WHERE id=1 AND post_id='2117852081189216309'");

  await pool.query(`CREATE TABLE IF NOT EXISTS live_blogs (
    id BIGSERIAL PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL,
    subtitle TEXT NOT NULL DEFAULT '', cover_url TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','live','closed')),
    featured BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), closed_at TIMESTAMPTZ
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS live_blog_updates (
    id BIGSERIAL PRIMARY KEY, blog_id BIGINT NOT NULL REFERENCES live_blogs(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '',
    source_url TEXT NOT NULL DEFAULT '', embed_url TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS live_blog_updates_order_idx ON live_blog_updates(blog_id,created_at DESC)');

  await pool.query('CREATE TABLE IF NOT EXISTS insight_daily (day DATE NOT NULL, event TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day,event))');
  await pool.query('CREATE TABLE IF NOT EXISTS x_feed_cache (id INTEGER PRIMARY KEY CHECK (id = 1), item JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  await pool.query("CREATE TABLE IF NOT EXISTS poll_settings (id INTEGER PRIMARY KEY CHECK (id = 1), question TEXT NOT NULL DEFAULT '', options JSONB NOT NULL DEFAULT '[]'::jsonb, starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ, enabled BOOLEAN NOT NULL DEFAULT FALSE, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
  await pool.query("CREATE TABLE IF NOT EXISTS poll_votes (id BIGSERIAL PRIMARY KEY, poll_id INTEGER NOT NULL DEFAULT 1, voter_hash TEXT NOT NULL, option_index INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(poll_id,voter_hash))");
  await pool.query('ALTER TABLE poll_settings ADD COLUMN IF NOT EXISTS visible BOOLEAN NOT NULL DEFAULT TRUE');
  const savedFeeds = await pool.query('SELECT payload,updated_at FROM rss_cache WHERE id=1');
  if (savedFeeds.rowCount && savedFeeds.rows[0].payload) {
    cache.articles = Array.isArray(savedFeeds.rows[0].payload.articles) ? savedFeeds.rows[0].payload.articles : [];
    cache.errors = Array.isArray(savedFeeds.rows[0].payload.errors) ? savedFeeds.rows[0].payload.errors : [];
    cache.timestamp = new Date(savedFeeds.rows[0].updated_at).getTime() || 0;
  }
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
const X_CACHE_TTL_MS = 90 * 1000;

async function fetchXPosts(source) {
  if (xPostCache.items.length && Date.now() - xPostCache.updatedAt < X_CACHE_TTL_MS) {
    return xPostCache.items.slice(0, 1);
  }
  const errors = [];
  // Le fonti X sono alternative: basta la prima che restituisce un post valido.
  // Evita quattro download XML simultanei per una sezione che mostra un solo elemento.
  for (const url of X_FEED_URLS) {
    try {
      const feed = await new Parser({ timeout: 8000, headers: RSS_HEADERS }).parseURL(url);
      const items = (feed.items || [])
        .map(item => normalizeItem(item, source))
        .filter(item => item.title && item.link)
        .sort((a, b) => (Date.parse(b.pubDate || '') || 0) - (Date.parse(a.pubDate || '') || 0));
      console.log('[X RSS]', url, 'articoli:', items.length);
      if (!items.length) continue;
      xPostCache.items = [items[0]];
      xPostCache.updatedAt = Date.now();
      if (pool) {
        try {
          await pool.query('INSERT INTO x_feed_cache (id,item,updated_at) VALUES (1,$1,NOW()) ON CONFLICT (id) DO UPDATE SET item=EXCLUDED.item,updated_at=NOW()', [JSON.stringify(items[0])]);
        } catch (error) { console.warn('[X RSS] impossibile salvare la cache persistente:', error.message); }
      }
      return xPostCache.items.slice(0, 1);
    } catch (error) {
      errors.push(error?.message || 'feed non disponibile');
      console.warn('[X RSS] fonte non disponibile:', url, error?.message || 'errore');
    }
  }
  if (xPostCache.items.length) {
    console.warn('[X RSS] nessuna fonte ha restituito post: mostro l’ultimo post salvato.');
    return xPostCache.items.slice(0, 1);
  }
  throw new Error(errors.join(' | ').slice(0, 220) || 'Feed X raggiungibili ma senza post');
}
function normalizeItem(item, source) {
  const rawSummary = item.contentSnippet || item.summary || item.content || '';
  return { title: (item.title || '').trim(), link: item.link || item.guid || '', pubDate: item.isoDate || item.pubDate || null, summary: rawSummary.replace(/\\s+/g, ' ').trim().slice(0, 280), source: source.name, category: source.category };
}
async function fetchAllFeeds() {
  const settled = await mapWithConcurrency(FEEDS, 12, async source => {
    if (source.name === '@giutrapani · X') return fetchXPosts(source);
    const feed = source.name === 'Il Riformista'
      ? await new Parser({ timeout: RSS_TIMEOUT_MS, headers: RSS_HEADERS }).parseURL(source.url)
      : await parseSourceFeed(source);
    const items = (feed.items || [])
      .map(item => normalizeItem(item, source))
      .filter(item => item.title && item.link)
      .sort((a,b) => (Date.parse(b.pubDate || '') || 0) - (Date.parse(a.pubDate || '') || 0));
    if (source.name === 'Il Riformista') return items.slice(0, 2);
    return items.slice(0, MAX_ITEMS_PER_SOURCE);
  });
  const articles = [], errors = [], seenLinks = new Set();
  settled.forEach((result,index) => {
    const source = FEEDS[index];
    if (result.status === 'fulfilled') {
      for (const item of result.value) {
        let key = item.link;
        try {
          const url = new URL(item.link);
          url.hash = '';
          for (const param of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(param)) url.searchParams.delete(param);
          key = url.toString();
        } catch {}
        if (key && seenLinks.has(key)) continue;
        if (key) seenLinks.add(key);
        articles.push(item);
      }
    } else errors.push({ source: source.name, message: result.reason?.message || 'errore sconosciuto' });
  });
  // Se i feed editoriali falliscono tutti, non lasciare la homepage vuota:
  // conserva almeno l'ultimo post X valido già raccolto.
  if (!articles.length && xPostCache.items.length) articles.push(...xPostCache.items.slice(0,1));
  articles.sort((a,b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
  console.log('[RSS collection] fonti:', FEEDS.length, 'articoli:', articles.length, 'errori:', errors.length, 'cache X:', xPostCache.items.length);
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
    const workers = Array.from({ length: Math.min(3, FEEDS.length) }, async () => {
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

let feedsPromise = null;
function refreshFeeds() {
  if (feedsPromise) return feedsPromise;
  feedsPromise = (async () => {
    const data = await fetchAllFeeds();
    // Una raccolta vuota non deve mai cancellare l'ultima raccolta valida.
    if (data.articles.length) {
      cache.timestamp = Date.now();
      cache.articles = data.articles;
      cache.errors = data.errors;
    } else {
      cache.timestamp = Date.now();
      cache.errors = data.errors;
      console.warn('[RSS] Raccolta vuota: conservata la cache precedente.');
    }
    if (pool) {
      try {
        await pool.query(
          'INSERT INTO rss_cache (id,payload,updated_at) VALUES (1,$1::jsonb,NOW()) ON CONFLICT (id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=NOW()',
          [JSON.stringify({ articles:cache.articles, errors:cache.errors })]
        );
      } catch (error) { console.warn('[RSS cache] Salvataggio persistente non riuscito:', error.message); }
    }
    return cache;
  })();
  feedsPromise = feedsPromise.finally(() => { feedsPromise = null; });
  return feedsPromise;
}
async function getFeeds() {
  const fresh = cache.timestamp > 0 && cache.articles.length > 0 && Date.now() - cache.timestamp < CACHE_TTL_MS;
  if (fresh) return { ...cache, refreshing:Boolean(feedsPromise) };
  if (cache.articles.length) {
    refreshFeeds().catch(error => console.warn('[RSS] Aggiornamento in background non riuscito:', error.message));
    return { ...cache, refreshing:true };
  }
  refreshFeeds().catch(error => console.warn('[RSS] Primo aggiornamento non riuscito:', error.message));
  return { ...cache, refreshing:true };
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
    const result = await pool.query('SELECT question,options,starts_at,ends_at,enabled,visible FROM poll_settings WHERE id=1');
    const row = result.rows[0], status = pollState(row);
    if (!row || row.visible === false || status === 'empty' || status === 'scheduled') return res.json({ visible:false, status });
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
    const result = await pool.query('SELECT question,options,starts_at,ends_at,enabled,visible FROM poll_settings WHERE id=1');
    const row=result.rows[0] || {}, counts=await readPollResults();
    const options=(row.options || []).map((label,index)=>({label,votes:Number(counts.find(item=>item.option_index===index)?.votes || 0)}));
    res.json({question:row.question || '',options,startsAt:row.starts_at || null,endsAt:row.ends_at || null,enabled:row.enabled === true,visible:row.visible !== false,status:pollState(row),total:options.reduce((sum,item)=>sum+item.votes,0)});
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
    await pool.query('INSERT INTO poll_settings (id,question,options,starts_at,ends_at,enabled,visible,updated_at) VALUES (1,$1,$2::jsonb,$3,$4,$5,TRUE,NOW()) ON CONFLICT (id) DO UPDATE SET question=EXCLUDED.question,options=EXCLUDED.options,starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at,enabled=EXCLUDED.enabled,visible=TRUE,updated_at=NOW()',[safeQuestion,JSON.stringify(safeOptions),start.toISOString(),end.toISOString(),enabled===true]);
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

app.post('/api/redazione/poll/hide', requireRedazione, async (req,res) => {
  try {
    if (!pool) return res.status(503).json({error:'Archivio non configurato.'});
    await pool.query('UPDATE poll_settings SET visible=FALSE,enabled=FALSE,updated_at=NOW() WHERE id=1');
    res.json({ok:true});
  } catch { res.status(500).json({error:'Impossibile ritirare il sondaggio.'}); }
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
app.get('/api/highlights', async (req,res) => {
  try {
    if (!pool) return res.json({ highlights:{} });
    const result = await pool.query('SELECT slot,article,pinned_at FROM editorial_highlights');
    const highlights = {};
    for (const row of result.rows) highlights[row.slot] = { ...row.article, pinnedAt:row.pinned_at };
    res.json({ highlights });
  } catch { res.status(500).json({ error:'Notizie in primo piano non disponibili.' }); }
});
app.post('/api/redazione/highlights/:slot', requireRedazione, async (req,res) => {
  try {
    if (!pool) return res.status(503).json({ error:'Archivio non configurato.' });
    const slot = String(req.params.slot || '');
    if (!['featured','urgent','developing'].includes(slot)) return res.status(400).json({ error:'Tipo di evidenza non valido.' });
    const article = req.body?.article || {};
    const title = String(article.title || '').trim().slice(0,500);
    const link = String(article.link || '').trim();
    let parsed;
    try { parsed = new URL(link); } catch { return res.status(400).json({ error:'Il link della notizia non è valido.' }); }
    if (!title || !['http:','https:'].includes(parsed.protocol) || !parsed.hostname)
      return res.status(400).json({ error:'La notizia deve avere un titolo e un link web valido.' });
    const safeArticle = {
      title, link:parsed.href, source:String(article.source || '').slice(0,240),
      pubDate:article.pubDate || new Date().toISOString(), category:String(article.category || '').slice(0,80),
      summary:String(article.summary || '').slice(0,3000), image:String(article.image || '').slice(0,2000)
    };
    await pool.query('DELETE FROM editorial_highlights WHERE article->>\'link\'=$1 AND slot<>$2',[parsed.href,slot]);
    await pool.query('INSERT INTO editorial_highlights (slot,article,pinned_at) VALUES ($1,$2::jsonb,NOW()) ON CONFLICT (slot) DO UPDATE SET article=EXCLUDED.article,pinned_at=NOW()',[slot,JSON.stringify(safeArticle)]);
    res.json({ ok:true, slot, article:safeArticle, pinnedAt:new Date().toISOString() });
  } catch { res.status(500).json({ error:'Impossibile aggiornare la notizia selezionata.' }); }
});
app.delete('/api/redazione/highlights/:slot', requireRedazione, async (req,res) => {
  try {
    if (!pool) return res.status(503).json({ error:'Archivio non configurato.' });
    const slot = String(req.params.slot || '');
    if (!['featured','urgent','developing'].includes(slot)) return res.status(400).json({ error:'Tipo di evidenza non valido.' });
    await pool.query('DELETE FROM editorial_highlights WHERE slot=$1',[slot]);
    res.json({ ok:true, slot });
  } catch { res.status(500).json({ error:'Impossibile rimuovere la notizia selezionata.' }); }
});
app.post('/api/redazione/featured', requireRedazione, async (req,res) => {
  try {
    if (!pool) return res.status(503).json({ error:'Archivio non configurato.' });
    const article = req.body?.article || {};
    const title = String(article.title || '').trim().slice(0,500);
    const link = String(article.link || '').trim();
    let parsed;
    try { parsed = new URL(link); } catch { return res.status(400).json({ error:'Il link della notizia non è valido.' }); }
    if (!title || !['http:','https:'].includes(parsed.protocol) || !parsed.hostname)
      return res.status(400).json({ error:'La notizia deve avere un titolo e un link web valido.' });
    const safeArticle = {
      title, link:parsed.href,
      source:String(article.source || '').slice(0,240),
      pubDate:article.pubDate || new Date().toISOString(),
      category:String(article.category || '').slice(0,80),
      summary:String(article.summary || '').slice(0,3000),
      image:String(article.image || '').slice(0,2000)
    };
    await pool.query('INSERT INTO featured_news (id,article,pinned_at) VALUES (1,$1::jsonb,NOW()) ON CONFLICT (id) DO UPDATE SET article=EXCLUDED.article,pinned_at=NOW()',[JSON.stringify(safeArticle)]);
    res.json({ ok:true, article:safeArticle, pinnedAt:new Date().toISOString() });
  } catch { res.status(500).json({ error:'Impossibile mettere in evidenza la notizia.' }); }
});
app.delete('/api/redazione/featured', requireRedazione, async (req,res) => {
  try {
    if (!pool) return res.status(503).json({ error:'Archivio non configurato.' });
    await pool.query('DELETE FROM featured_news WHERE id=1');
    res.json({ ok:true });
  } catch { res.status(500).json({ error:'Impossibile rimuovere la notizia in evidenza.' }); }
});
app.get('/api/feeds', async (req,res) => {
  try {
    const data = req.query.force === '1' ? await refreshFeeds() : await getFeeds();
    res.json({ updatedAt:data.timestamp, count:data.articles.length, articles:data.articles, errors:data.errors, refreshing:Boolean(feedsPromise) });
  }
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

function liveBlogSlug(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,90);
}
function liveBlogUrl(value) {
  const raw=String(value||'').trim();
  if(!raw)return '';
  try { const u=new URL(raw); return ['http:','https:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}
function liveBlogPublic(row) {
  return {id:row.id,slug:row.slug,title:row.title,subtitle:row.subtitle||'',coverUrl:row.cover_url||'',status:row.status,featured:row.featured===true,createdAt:row.created_at,updatedAt:row.updated_at,closedAt:row.closed_at||null};
}
app.get('/api/live-blogs/featured', async (req,res) => {
  try {
    if(!pool)return res.json({blog:null});
    const q=await pool.query("SELECT * FROM live_blogs WHERE status='live' AND featured=TRUE ORDER BY updated_at DESC LIMIT 1");
    res.json({blog:q.rowCount?liveBlogPublic(q.rows[0]):null});
  } catch {res.status(500).json({error:'Live Blog non disponibile.'});}
});
app.get('/api/live-blogs/:slug', async (req,res) => {
  try {
    if(!pool)return res.status(503).json({error:'Archivio non disponibile.'});
    const q=await pool.query("SELECT * FROM live_blogs WHERE slug=$1 AND status IN ('live','closed')",[req.params.slug]);
    if(!q.rowCount)return res.status(404).json({error:'Live Blog non trovato.'});
    const blog=q.rows[0];
    const updates=await pool.query('SELECT id,title,body,source,source_url,embed_url,created_at,updated_at FROM live_blog_updates WHERE blog_id=$1 ORDER BY created_at DESC,id DESC',[blog.id]);
    res.json({blog:liveBlogPublic(blog),updates:updates.rows});
  } catch {res.status(500).json({error:'Impossibile caricare la diretta.'});}
});
app.get('/api/redazione/live-blogs', requireRedazione, async (req,res) => {
  try {
    if(!pool)return res.status(503).json({error:'Archivio non configurato.'});
    const q=await pool.query('SELECT * FROM live_blogs ORDER BY CASE status WHEN \'live\' THEN 0 WHEN \'draft\' THEN 1 ELSE 2 END,updated_at DESC');
    res.json({blogs:q.rows.map(liveBlogPublic)});
  } catch {res.status(500).json({error:'Impossibile caricare i Live Blog.'});}
});
app.post('/api/redazione/live-blogs', requireRedazione, async (req,res) => {
  try {
    if(!pool)return res.status(503).json({error:'Archivio non configurato.'});
    const {title='',subtitle='',coverUrl='',status='draft',featured=false}=req.body||{};
    const safeTitle=String(title).trim().slice(0,180), slug=liveBlogSlug(req.body?.slug||safeTitle);
    if(!safeTitle||!slug)return res.status(400).json({error:'Inserisci un titolo per la diretta.'});
    const cover=liveBlogUrl(coverUrl); if(coverUrl&&!cover)return res.status(400).json({error:'Il link della copertina non è valido.'});
    const safeStatus=['draft','live','closed'].includes(status)?status:'draft';
    if(featured&&safeStatus!=='live')return res.status(400).json({error:'Solo una diretta attiva può essere messa in homepage.'});
    const q=await pool.query('INSERT INTO live_blogs(slug,title,subtitle,cover_url,status,featured,closed_at) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $5=\'closed\' THEN NOW() ELSE NULL END) RETURNING *',[slug,safeTitle,String(subtitle).trim().slice(0,300),cover,safeStatus,Boolean(featured)]);
    if(featured)await pool.query('UPDATE live_blogs SET featured=FALSE WHERE id<>$1',[q.rows[0].id]);
    res.status(201).json({blog:liveBlogPublic(q.rows[0])});
  } catch(error) {res.status(error.code==='23505'?409:500).json({error:error.code==='23505'?'Esiste già una diretta con questo indirizzo.':'Creazione del Live Blog non riuscita.'});}
});
app.put('/api/redazione/live-blogs/:id', requireRedazione, async (req,res) => {
  try {
    if(!pool)return res.status(503).json({error:'Archivio non configurato.'});
    const {title='',subtitle='',coverUrl='',status='draft',featured=false}=req.body||{};
    const safeTitle=String(title).trim().slice(0,180), slug=liveBlogSlug(req.body?.slug||safeTitle);
    if(!safeTitle||!slug)return res.status(400).json({error:'Inserisci un titolo per la diretta.'});
    const cover=liveBlogUrl(coverUrl);if(coverUrl&&!cover)return res.status(400).json({error:'Il link della copertina non è valido.'});
    const safeStatus=['draft','live','closed'].includes(status)?status:'draft';
    if(featured&&safeStatus!=='live')return res.status(400).json({error:'Solo una diretta attiva può essere messa in homepage.'});
    const q=await pool.query("UPDATE live_blogs SET slug=$1,title=$2,subtitle=$3,cover_url=$4,status=$5,featured=$6,closed_at=CASE WHEN $5='closed' THEN COALESCE(closed_at,NOW()) ELSE NULL END,updated_at=NOW() WHERE id=$7 RETURNING *",[slug,safeTitle,String(subtitle).trim().slice(0,300),cover,safeStatus,Boolean(featured),req.params.id]);
    if(!q.rowCount)return res.status(404).json({error:'Live Blog non trovato.'});
    if(featured)await pool.query('UPDATE live_blogs SET featured=FALSE WHERE id<>$1',[req.params.id]);
    res.json({blog:liveBlogPublic(q.rows[0])});
  } catch(error) {res.status(error.code==='23505'?409:500).json({error:error.code==='23505'?'Esiste già una diretta con questo indirizzo.':'Modifica del Live Blog non riuscita.'});}
});
app.delete('/api/redazione/live-blogs/:id', requireRedazione, async (req,res) => {
  try {if(!pool)return res.status(503).json({error:'Archivio non configurato.'});const q=await pool.query('DELETE FROM live_blogs WHERE id=$1',[req.params.id]);if(!q.rowCount)return res.status(404).json({error:'Live Blog non trovato.'});res.json({ok:true});}
  catch {res.status(500).json({error:'Eliminazione non riuscita.'});}
});
app.post('/api/redazione/live-blogs/:id/updates', requireRedazione, async (req,res) => {
  try {
    if(!pool)return res.status(503).json({error:'Archivio non configurato.'});
    const {title='',body='',source='',sourceUrl='',embedUrl=''}=req.body||{};
    const safeTitle=String(title).trim().slice(0,220),safeBody=String(body).trim().slice(0,12000);
    if(!safeTitle&&!safeBody&&!embedUrl)return res.status(400).json({error:'Inserisci un testo o un contenuto da pubblicare.'});
    const sourceLink=liveBlogUrl(sourceUrl),embed=liveBlogUrl(embedUrl);
    if(sourceUrl&&!sourceLink||embedUrl&&!embed)return res.status(400).json({error:'Uno dei collegamenti inseriti non è valido.'});
    const q=await pool.query('INSERT INTO live_blog_updates(blog_id,title,body,source,source_url,embed_url) SELECT id,$2,$3,$4,$5,$6 FROM live_blogs WHERE id=$1 AND status=\'live\' RETURNING id,title,body,source,source_url,embed_url,created_at,updated_at',[req.params.id,safeTitle,safeBody,String(source).trim().slice(0,120),sourceLink,embed]);
    if(!q.rowCount)return res.status(404).json({error:'Diretta non trovata o non attiva.'});
    await pool.query('UPDATE live_blogs SET updated_at=NOW() WHERE id=$1',[req.params.id]);
    res.status(201).json({update:q.rows[0]});
  } catch {res.status(500).json({error:'Pubblicazione dell’aggiornamento non riuscita.'});}
});
app.put('/api/redazione/live-blogs/:id/updates/:updateId', requireRedazione, async (req,res) => {
  try {
    if(!pool)return res.status(503).json({error:'Archivio non configurato.'});
    const {title='',body='',source='',sourceUrl='',embedUrl=''}=req.body||{};
    const sourceLink=liveBlogUrl(sourceUrl),embed=liveBlogUrl(embedUrl);
    if(sourceUrl&&!sourceLink||embedUrl&&!embed)return res.status(400).json({error:'Uno dei collegamenti inseriti non è valido.'});
    const q=await pool.query('UPDATE live_blog_updates SET title=$1,body=$2,source=$3,source_url=$4,embed_url=$5,updated_at=NOW() WHERE id=$6 AND blog_id=$7 RETURNING id,title,body,source,source_url,embed_url,created_at,updated_at',[String(title).trim().slice(0,220),String(body).trim().slice(0,12000),String(source).trim().slice(0,120),sourceLink,embed,req.params.updateId,req.params.id]);
    if(!q.rowCount)return res.status(404).json({error:'Aggiornamento non trovato.'});
    await pool.query('UPDATE live_blogs SET updated_at=NOW() WHERE id=$1',[req.params.id]);res.json({update:q.rows[0]});
  } catch {res.status(500).json({error:'Modifica non riuscita.'});}
});
app.delete('/api/redazione/live-blogs/:id/updates/:updateId', requireRedazione, async (req,res) => {
  try {if(!pool)return res.status(503).json({error:'Archivio non configurato.'});const q=await pool.query('DELETE FROM live_blog_updates WHERE id=$1 AND blog_id=$2',[req.params.updateId,req.params.id]);if(!q.rowCount)return res.status(404).json({error:'Aggiornamento non trovato.'});await pool.query('UPDATE live_blogs SET updated_at=NOW() WHERE id=$1',[req.params.id]);res.json({ok:true});}
  catch {res.status(500).json({error:'Cancellazione non riuscita.'});}
});
app.get('/live/:slug', (req,res) => res.sendFile(path.join(__dirname,'..','public','live.html')));

const PORT = process.env.PORT || 3000;
async function start() {
  if (pool) await initDatabase();
  app.listen(PORT, () => {
    console.log('BREAKING in ascolto su http://localhost:' + PORT);
    refreshFeeds().catch(error => console.warn('[RSS] Aggiornamento iniziale non riuscito:', error.message));
  });
}
start().catch(error => { console.error('Avvio database non riuscito:',error); process.exit(1); });
