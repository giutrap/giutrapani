const AUTO_REFRESH_MS = 60000;
const state = { stream: 'all', news: [], social: [], newsErrors: [], socialErrors: [], socialConfigured: [], socialPaused: [] };
const el = {
  search: document.getElementById('search'),
  refreshBtn: document.getElementById('refresh-btn'),
  status: document.getElementById('status'),
  newsErrorsDetails: document.getElementById('news-errors-details'),
  newsErrorsList: document.getElementById('news-errors-list'),
  socialErrorsDetails: document.getElementById('social-errors-details'),
  socialErrorsList: document.getElementById('social-errors-list'),
  articles: document.getElementById('articles'),
  emptyState: document.getElementById('empty-state'),
  socialNote: document.getElementById('social-note'),
  socialFilters: document.getElementById('social-filters'),
  socialQuery: document.getElementById('social-query'),
  socialAccounts: document.getElementById('social-accounts'),
  socialApply: document.getElementById('social-apply'),
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function tm(value) {
  if (!value) return 'Orario n.d.';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Orario n.d.';
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
    + ' · ' + date.toLocaleTimeString('it-IT', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
}

function render() {
  const query = el.search.value.trim().toLocaleLowerCase('it');
  let rows = [
    ...(state.stream === 'social' ? [] : state.news.map(article => ({
      ...article, kind: 'news', display: article.title, href: article.link, origin: article.source,
    }))),
    ...(state.stream === 'news' ? [] : state.social.map(post => ({
      ...post, kind: 'social', display: post.text || 'Post senza testo',
      href: post.url, origin: post.account || post.platform,
    }))),
  ];
  rows = rows.filter(item => !query || (
    String(item.display || '') + ' ' + String(item.origin || '') + ' ' + String(item.platform || '')
  ).toLocaleLowerCase('it').includes(query));
  rows.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));

  el.articles.innerHTML = rows.map(item => {
    const platform = item.kind === 'social'
      ? String(item.platform || 'Social').toLowerCase().replace(/[^a-z0-9-]/g, '') : '';
    const label = item.kind === 'social'
      ? '<span class="platform-tag platform-' + esc(platform) + '">' + esc(item.platform || 'SOCIAL') + '</span>'
      : '<span class="source-tag">NEWS</span>';
    const link = esc(item.href || '#');
    return '<article class="news-item ' + (item.kind === 'social' ? 'social-row' : '') + '">'
      + '<time class="news-time">' + tm(item.pubDate) + '</time>'
      + '<div class="news-main">' + label + '<h2 class="news-title">'
      + (item.kind === 'social'
        ? esc(item.display)
        : '<a href="' + link + '" target="_blank" rel="noopener">' + esc(item.display) + '</a>')
      + '</h2></div><div class="news-source">' + esc(item.origin || item.source || '')
      + ' · <a href="' + link + '" target="_blank" rel="noopener">'
      + (item.kind === 'social' ? 'APRI' : 'LEGGI') + ' ↗</a></div></article>';
  }).join('');

  el.emptyState.hidden = rows.length > 0;
  el.emptyState.textContent = query
    ? 'Nessun contenuto corrisponde alla ricerca.'
    : 'Nessun contenuto disponibile per questa selezione.';
  el.socialNote.hidden = state.stream === 'news';
  el.socialFilters.hidden = state.stream === 'news';
}

function renderErrors() {
  el.newsErrorsList.innerHTML = state.newsErrors.map(error =>
    '<li>' + esc(error.source) + ': ' + esc(error.message) + '</li>').join('');
  el.socialErrorsList.innerHTML = state.socialErrors.map(error =>
    '<li>' + esc(error.source) + ': ' + esc(error.message) + '</li>').join('');
  el.newsErrorsDetails.hidden = state.stream === 'social' || state.newsErrors.length === 0;
  el.socialErrorsDetails.hidden = state.stream === 'news' || state.socialErrors.length === 0;
  const configured = state.socialConfigured.length
    ? 'Attive: ' + state.socialConfigured.join(', ') + '. ' : '';
  const paused = state.socialPaused.length
    ? state.socialPaused.join(', ') + '. ' : '';
  el.socialNote.textContent = configured + paused
    + 'Le fonti social pubbliche disponibili dipendono dalle API e dalle autorizzazioni; X resta sospeso finché non viene riattivato esplicitamente.';
}

async function load() {
  el.status.textContent = 'Aggiornamento delle fonti…';
  el.refreshBtn.disabled = true;
  try {
    const params = new URLSearchParams({
      q: el.socialQuery.value,
      accounts: el.socialAccounts.value,
    });
    const [newsResponse, socialResponse] = await Promise.all([
      state.stream === 'social' ? Promise.resolve(null) : fetch('/api/feeds?refresh=true'),
      state.stream === 'news' ? Promise.resolve(null) : fetch('/api/social?' + params.toString()),
    ]);
    const counts = [];
    if (newsResponse) {
      if (!newsResponse.ok) throw new Error('News HTTP ' + newsResponse.status);
      const data = await newsResponse.json();
      state.news = data.articles || [];
      state.newsErrors = data.errors || [];
      counts.push(state.news.length + ' notizie');
    }
    if (socialResponse) {
      if (!socialResponse.ok) throw new Error('Social HTTP ' + socialResponse.status);
      const data = await socialResponse.json();
      state.social = data.posts || [];
      state.socialConfigured = data.configured || [];
      state.socialPaused = data.paused || [];
      state.socialErrors = data.errors || [];
      counts.push(state.social.length + ' post social');
    }
    render();
    renderErrors();
    el.status.textContent = counts.join(' · ') + ' · aggiornato '
      + new Date().toLocaleTimeString('it-IT');
  } catch (error) {
    el.status.textContent = 'Servizio momentaneamente non raggiungibile.';
    console.error(error);
  } finally {
    el.refreshBtn.disabled = false;
  }
}

el.search.addEventListener('input', render);
el.refreshBtn.addEventListener('click', load);
el.socialApply.addEventListener('click', load);
document.querySelectorAll('.stream-tab').forEach(button => {
  button.addEventListener('click', () => {
    state.stream = button.dataset.stream;
    document.querySelectorAll('.stream-tab').forEach(tab =>
      tab.classList.toggle('active', tab === button));
    el.search.placeholder = state.stream === 'social'
      ? 'Cerca post, account o piattaforma…'
      : 'Cerca nelle notizie e nei social…';
    load();
  });
});
load();
setInterval(load, AUTO_REFRESH_MS);
