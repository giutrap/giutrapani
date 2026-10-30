const AUTO_REFRESH_MS = 60000;
const state = { news: [], newsErrors: [] };
const el = {
  search: document.getElementById('search'),
  refreshBtn: document.getElementById('refresh-btn'),
  status: document.getElementById('status'),
  newsErrorsDetails: document.getElementById('news-errors-details'),
  newsErrorsList: document.getElementById('news-errors-list'),
  articles: document.getElementById('articles'),
  emptyState: document.getElementById('empty-state'),
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

// La priorità viene assegnata solo quando il titolo contiene un'indicazione esplicita.
function urgency(item) {
  const title = String(item.title || '').toLocaleLowerCase('it');
  if (/\b(ultim['’ ]ora|breaking|flash news|notizia urgente)\b/.test(title)) return 'urgent';
  if (/\b(in aggiornamento|aggiornamento|diretta|live|sviluppi)\b/.test(title)) return 'developing';
  return 'normal';
}

function render() {
  const query = el.search.value.trim().toLocaleLowerCase('it');
  const rows = state.news.filter(item => !query || (
    String(item.title || '') + ' ' + String(item.source || '') + ' ' + String(item.summary || '')
  ).toLocaleLowerCase('it').includes(query));

  el.articles.innerHTML = rows.map(item => {
    const link = esc(item.link || '#');
    const level = urgency(item);
    const marker = level === 'urgent'
      ? '<span class="urgency-label urgency-urgent">ULTIM’ORA</span>'
      : level === 'developing'
        ? '<span class="urgency-label urgency-developing">AGGIORNAMENTO</span>'
        : '';
    return '<article class="news-item urgency-' + level + '">'
      + '<time class="news-time">' + tm(item.pubDate) + '</time>'
      + '<div class="news-main">' + marker
      + '<h2 class="news-title"><a href="' + link + '" target="_blank" rel="noopener">'
      + esc(item.title || 'Senza titolo') + '</a></h2></div>'
      + '<div class="news-source">' + esc(item.source || '') + '</div>'
      + '<a class="news-link" href="' + link + '" target="_blank" rel="noopener" aria-label="Leggi la notizia">LEGGI ↗</a>'
      + '</article>';
  }).join('');

  el.emptyState.hidden = rows.length > 0;
  el.emptyState.textContent = query
    ? 'Nessuna notizia corrisponde alla ricerca.'
    : 'Nessuna notizia disponibile al momento.';
}

function renderErrors() {
  el.newsErrorsList.innerHTML = state.newsErrors.map(error =>
    '<li>' + esc(error.source) + ': ' + esc(error.message) + '</li>').join('');
  el.newsErrorsDetails.hidden = state.newsErrors.length === 0;
}

async function load() {
  el.status.textContent = 'Aggiornamento delle fonti…';
  el.refreshBtn.disabled = true;
  try {
    const response = await fetch('/api/feeds');
    if (!response.ok) throw new Error('News HTTP ' + response.status);
    const data = await response.json();
    state.news = data.articles || [];
    state.newsErrors = data.errors || [];
    render();
    renderErrors();
    el.status.textContent = state.news.length + ' notizie · aggiornato '
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
load();
setInterval(load, AUTO_REFRESH_MS);
