const path = require('path');
const express = require('express');
const Parser = require('rss-parser');
const { FEEDS } = require('./feeds');

const app = express();
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