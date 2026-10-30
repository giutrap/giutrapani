const Parser = require('rss-parser');
const parser = new Parser({ timeout: 9000 });

const defaultTerms = (process.env.BLUESKY_QUERIES || 'Italia politica|governo Italia|breaking Italia')
  .split('|').map(x => x.trim()).filter(Boolean);
const CACHE_TTL_MS = 45 * 1000;
const cache = new Map();

const make = (platform, account, text, url, date, id) => ({
  id: String(id || url || ''),
  platform,
  account: account || platform,
  text: (text || '').trim(),
  url: url || '',
  pubDate: date || null,
});

async function getJson(url, headers = {}) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'BREAKING-NewsMonitor/1.0', ...headers },
  });
  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.detail || body?.error?.message || body?.title || '';
    } catch (_) {}
    throw new Error(`HTTP ${response.status}${detail ? ': ' + detail : ''}`);
  }
  return response.json();
}

async function bluesky(options) {
  const searches = [...(options.q ? [options.q] : defaultTerms)];
  const accounts = options.accounts.map(x => x.replace(/^@/, '').trim()).filter(Boolean);
  searches.push(...accounts.map(handle => `from:${handle}`));
  const uniqueSearches = [...new Set(searches)].slice(0, 30);
  const results = await Promise.allSettled(uniqueSearches.map(async query => {
    const url = 'https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q='
      + encodeURIComponent(query) + '&limit=30&sort=latest';
    const data = await getJson(url);
    return (data.posts || []).map(post => make(
      'Bluesky',
      '@' + post.author.handle,
      post.record?.text,
      'https://bsky.app/profile/' + post.author.handle + '/post/' + post.uri.split('/').pop(),
      post.record?.createdAt || post.indexedAt,
      post.uri,
    ));
  }));
  const items = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  if (!items.length && results.every(result => result.status === 'rejected')) {
    throw new Error(results.find(result => result.status === 'rejected').reason?.message || 'ricerca non riuscita');
  }
  return items;
}

async function xPosts(options) {
  // X resta sospeso per impostazione predefinita: nessuna chiamata a pagamento accidentale.
  if (process.env.ENABLE_X_API !== 'true' || !process.env.X_BEARER_TOKEN) return [];
  const term = options.q || process.env.X_SEARCH_QUERY || '(Italia OR governo OR politica OR breaking) lang:it -is:retweet';
  const handles = options.accounts.map(x => 'from:' + x.replace(/^@/, '')).join(' OR ');
  const query = handles ? '(' + term + ') OR (' + handles + ')' : term;
  const url = 'https://api.x.com/2/tweets/search/recent?max_results=50'
    + '&tweet.fields=created_at,author_id&expansions=author_id&user.fields=username&query='
    + encodeURIComponent(query);
  const data = await getJson(url, { Authorization: 'Bearer ' + process.env.X_BEARER_TOKEN });
  const users = Object.fromEntries((data.includes?.users || []).map(user => [user.id, user]));
  return (data.data || []).map(post => {
    const handle = users[post.author_id]?.username || post.author_id;
    return make('X', '@' + handle, post.text, 'https://x.com/' + handle + '/status/' + post.id, post.created_at, post.id);
  });
}

async function facebook() {
  const token = process.env.META_ACCESS_TOKEN;
  const ids = (process.env.FACEBOOK_PAGE_IDS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!token || !ids.length) return [];
  const results = await Promise.allSettled(ids.map(async id => {
    const data = await getJson('https://graph.facebook.com/v23.0/' + id
      + '/posts?fields=id,message,created_time,permalink_url,from&limit=30&access_token='
      + encodeURIComponent(token));
    return (data.data || []).map(post => make(
      'Facebook', post.from?.name || id, post.message, post.permalink_url, post.created_time, post.id,
    ));
  }));
  const items = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  if (!items.length && results.some(result => result.status === 'rejected')) {
    throw new Error(results.find(result => result.status === 'rejected').reason?.message || 'richiesta non riuscita');
  }
  return items;
}

async function instagram() {
  const token = process.env.META_ACCESS_TOKEN;
  const id = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (!token || !id) return [];
  const data = await getJson('https://graph.facebook.com/v23.0/' + id
    + '/media?fields=id,caption,timestamp,permalink,username&limit=50&access_token='
    + encodeURIComponent(token));
  return (data.data || []).map(post => make(
    'Instagram', post.username ? '@' + post.username : 'Instagram',
    post.caption, post.permalink, post.timestamp, post.id,
  ));
}

async function youtube() {
  const ids = (process.env.YOUTUBE_CHANNEL_IDS || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!ids.length) return [];
  const results = await Promise.allSettled(ids.map(async id => {
    const feed = await parser.parseURL('https://www.youtube.com/feeds/videos.xml?channel_id=' + encodeURIComponent(id));
    return (feed.items || []).map(post => make(
      'YouTube', feed.title, post.title, post.link, post.isoDate || post.pubDate, post.id,
    ));
  }));
  const items = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  if (!items.length && results.some(result => result.status === 'rejected')) {
    throw new Error(results.find(result => result.status === 'rejected').reason?.message || 'feed non raggiungibile');
  }
  return items;
}

async function mastodon() {
  const urls = (process.env.MASTODON_RSS_URLS || '').split('|').map(x => x.trim()).filter(Boolean);
  if (!urls.length) return [];
  const results = await Promise.allSettled(urls.map(async url => {
    const feed = await parser.parseURL(url);
    return (feed.items || []).map(post => make(
      'Mastodon', feed.title, post.contentSnippet || post.title,
      post.link, post.isoDate || post.pubDate, post.guid,
    ));
  }));
  const items = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  if (!items.length && results.some(result => result.status === 'rejected')) {
    throw new Error(results.find(result => result.status === 'rejected').reason?.message || 'feed non raggiungibile');
  }
  return items;
}

async function getSocial(options = {}) {
  const normalized = {
    q: String(options.q || '').trim().slice(0, 200),
    accounts: Array.isArray(options.accounts) ? options.accounts.slice(0, 30) : [],
  };
  const key = JSON.stringify(normalized);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.data;

  const providers = [
    ['Bluesky', () => bluesky(normalized)],
    ['X', xPosts],
    ['Facebook', facebook],
    ['Instagram', instagram],
    ['YouTube', youtube],
    ['Mastodon', mastodon],
  ];
  const settled = await Promise.all(providers.map(async ([name, fetcher]) => {
    try {
      // X non viene interrogato finché ENABLE_X_API non è esplicitamente true.
      if (name === 'X' && process.env.ENABLE_X_API !== 'true') {
        return { name, items: [], error: null, skipped: true };
      }
      const items = await fetcher(normalized);
      return { name, items, error: null, skipped: false };
    } catch (error) {
      return { name, items: [], error: error.message || 'errore sconosciuto', skipped: false };
    }
  }));

  const seen = new Set();
  const posts = settled.flatMap(result => result.items).filter(post => {
    const key = post.id || post.url;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));

  const configured = ['Bluesky'];
  if (process.env.ENABLE_X_API === 'true' && process.env.X_BEARER_TOKEN) configured.push('X');
  if (process.env.META_ACCESS_TOKEN && process.env.FACEBOOK_PAGE_IDS) configured.push('Facebook');
  if (process.env.META_ACCESS_TOKEN && process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID) configured.push('Instagram');
  if (process.env.YOUTUBE_CHANNEL_IDS) configured.push('YouTube');
  if (process.env.MASTODON_RSS_URLS) configured.push('Mastodon');

  const paused = process.env.X_BEARER_TOKEN && process.env.ENABLE_X_API !== 'true'
    ? ['X (sospeso: crediti non disponibili)'] : [];
  const data = {
    posts,
    configured,
    paused,
    errors: settled.filter(result => result.error).map(result => ({
      source: result.name,
      message: result.error,
    })),
  };
  cache.set(key, { timestamp: Date.now(), data });
  return data;
}

module.exports = { getSocial };
