const AUTO_REFRESH_MS = 60000;
const state = { news: [], newsErrors: [], activeCategory: 'TUTTE' };
const el = {
  search: document.getElementById('search'),
  refreshBtn: document.getElementById('refresh-btn'),
  status: document.getElementById('status'),
  newsErrorsDetails: document.getElementById('news-errors-details'),
  newsErrorsList: document.getElementById('news-errors-list'),
  articles: document.getElementById('articles'),
  emptyState: document.getElementById('empty-state'),
  categoryFilters: document.getElementById('category-filters'),
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

// Classificazione editoriale della singola notizia: prima il contenuto, poi la categoria RSS come ripiego.
function newsCategory(item) {
  // Etichetta editoriale dedicata: identifica sempre gli articoli della testata.
  if (/il riformista/i.test(String(item.source || ''))) return 'IL RIFORMISTA';
  const text = (String(item.title || '') + ' ' + String(item.summary || '')).toLocaleLowerCase('it');
  const rules = [
    ['GEOPOLITICA', /\b(guerra|attacco|missil|truppe|esercito|kiev|ucrain|russia|mosca|putin|israel|gaza|iran|medio oriente|nato|cremlino|trump|dazi|diplomaz|vertice internazionale|sanzion)\b/],
    ['POLITICA', /\b(governo|parlamento|premier|ministro|ministra|meloni|salvini|schlein|opposizione|maggioranza|partito|elezioni|voto|decreto|riforma|senato|camera|quirinale|sindaco|regione)\b/],
    ['CRONACA', /\b(omicid|uccis|morto|morta|morti|morte|ferit|incidente|tragedia|arrest|rapina|furto|indagine|inchiesta|polizia|carabinieri|procura|violenza|neonat|intossicat|scompar|maltempo|alluvion|terremoto)\b/],
    ['LAVORO E SOCIETÀ', /\b(sciopero|sindacat|lavorator|salari|stipendi|pension|precari|contratto|licenzi|occupazione|carovita|protest|manifestaz|diritti|scuola|universit|docenti)\b/],
    ['FINANZA', /\b(borsa|borsa valori|azioni|titoli|spread|obbligazioni|banca|banche|tassi|borsistico|ftse|nasdaq|wall street|utili|bilancio|quotazioni|investiment)\b/],
    ['ECONOMIA', /\b(economia|economico|economica|aziend|industria|mercato|prezzi|inflazione|pil|consumi|imprese|auto|automotive|dazi|export|import|fisco|tasse|accise|rimborso|carburant|energia)\b/],
    ['SALUTE', /\b(salute|sanità|sanitario|ospedale|medic|medicina|malattia|virus|epidemia|vaccin|tumore|medici|pazienti|farmac)\b/],
    ['SPORT', /\b(calcio|serie a|champions|juventus|inter|milan|napoli|roma|lazio|tennis|formula 1|motogp|olimpiad|gara|campionato|allenatore|atleta|sport)\b/],
    ['SPETTACOLO', /\b(cinema|film|attore|attrice|cantante|concerto|musica|festival|sanremo|teatro|televisione|tv|fedez|vip|celebrity|serie tv|streaming)\b/],
    ['TECNOLOGIA', /\b(tecnologia|intelligenza artificiale|\bai\b|digitale|internet|cyber|hacker|smartphone|apple|google|microsoft|software|social network)\b/],
    ['AMBIENTE', /\b(ambiente|clima|climatico|ambientale|emissioni|inquinamento|green|rinnovabili|siccità|biodiversità|energia)\b/],
    ['CULTURA', /\b(libro|libri|scrittore|scrittura|mostra|museo|arte|cultura|letteratura|premio letterario|archeologia|storia)\b/],
  ];
  for (const [label, pattern] of rules) if (pattern.test(text)) return label;
  const sourceCategory = String(item.category || '').toLocaleLowerCase('it');
  const fallback = {
    'mondo': 'MONDO', 'europa': 'EUROPA', 'economia': 'ECONOMIA',
    'finanza': 'FINANZA', 'sport': 'SPORT', 'tecnologia': 'TECNOLOGIA',
    'scienza': 'SCIENZA', 'ambiente': 'AMBIENTE', 'chiesa': 'CHIESA',
    'istituzioni': 'ISTITUZIONI', 'italia': 'ATTUALITÀ',
  };
  return fallback[sourceCategory] || 'ATTUALITÀ';
}

// La priorità viene assegnata solo quando il titolo contiene un'indicazione esplicita.
function urgency(item) {
  const title = String(item.title || '').toLocaleLowerCase('it');
  if (/\b(ultim['’ ]ora|breaking|flash news|notizia urgente)\b/.test(title)) return 'urgent';
  if (/\b(in aggiornamento|aggiornamento|diretta|live|sviluppi)\b/.test(title)) return 'developing';
  return 'normal';
}

function renderCategoryFilters() {
  const counts = new Map();
  for (const item of state.news) {
    const category = newsCategory(item);
    counts.set(category, (counts.get(category) || 0) + 1);
  }
  const total = state.news.length;
  const categories = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'it'));
  const buttons = [['TUTTE', total], ...categories];
  el.categoryFilters.innerHTML = buttons.map(([name, count]) =>
    '<button type="button" class="category-filter' + (state.activeCategory === name ? ' is-active' : '')
    + '" data-category="' + esc(name) + '" aria-pressed="' + (state.activeCategory === name ? 'true' : 'false') + '">'
    + esc(name) + '<span class="category-count">' + count + '</span></button>'
  ).join('') + '<a class="category-filter category-social" href="https://x.com/giutrapani" target="_blank" rel="noopener noreferrer" aria-label="Apri i post di giutrapani su X">@giutrapani <span aria-hidden="true">↗</span></a>';
}

function render() {
  const query = el.search.value.trim().toLocaleLowerCase('it');
  const rows = [...state.news]
    .sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0))
    .filter(item => state.activeCategory === 'TUTTE' || newsCategory(item) === state.activeCategory)
    .filter(item => !query || (
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
    const category = newsCategory(item);
    return '<article class="news-item urgency-' + level + '">'
      + '<time class="news-time">' + tm(item.pubDate) + '</time>'
      + '<span class="news-category' + (category === 'IL RIFORMISTA' ? ' news-category-riformista' : '') + '"' + (category === 'IL RIFORMISTA' ? ' style="gap:4px"' : '') + '>' + (category === 'IL RIFORMISTA' ? '<img src="data:image/png;base64,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" alt="" aria-hidden="true" style="height:15px;width:auto;display:block;flex:none">' : '') + esc(category) + '</span>'
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
    if (state.activeCategory !== 'TUTTE' && !state.news.some(item => newsCategory(item) === state.activeCategory)) state.activeCategory = 'TUTTE';
    renderCategoryFilters();
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
el.categoryFilters.addEventListener('click', event => {
  const button = event.target.closest('button[data-category]');
  if (!button) return;
  state.activeCategory = button.dataset.category;
  renderCategoryFilters();
  render();
});
el.refreshBtn.addEventListener('click', load);
load();
setInterval(load, AUTO_REFRESH_MS);
