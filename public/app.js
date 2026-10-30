const AUTO_REFRESH_MS = 60000;
const PAGE_SIZE = 50;
const state = { news: [], newsErrors: [], activeCategory: 'TUTTE', currentPage: 1 };
const el = {
  search: document.getElementById('search'),
  refreshBtn: document.getElementById('refresh-btn'),
  status: document.getElementById('status'),
  newsErrorsDetails: document.getElementById('news-errors-details'),
  newsErrorsList: document.getElementById('news-errors-list'),
  articles: document.getElementById('articles'),
  emptyState: document.getElementById('empty-state'),
  categoryFilters: document.getElementById('category-filters'),
  pagination: document.getElementById('pagination'),
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
  if (item.isEditorial) return 'REDAZIONE';
  // Etichetta editoriale dedicata: identifica sempre gli articoli della testata.
  if (/giutrapani.*x|@giutrapani/i.test(String(item.source || ''))) return '@giutrapani';
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
  const categories = [...counts.entries()].filter(([name]) => name !== 'IL RIFORMISTA' && name !== '@giutrapani' && name !== 'REDAZIONE').sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'it'));
  const buttons = [['TUTTE', total], ['REDAZIONE', counts.get('REDAZIONE') || 0], ['IL RIFORMISTA', counts.get('IL RIFORMISTA') || 0], ['@giutrapani', counts.get('@giutrapani') || 0], ...categories];
  el.categoryFilters.innerHTML = buttons.map(([name, count]) =>
    '<button type="button" class="category-filter' + (name === 'REDAZIONE' ? ' category-redazione-filter' : '') + (name === 'IL RIFORMISTA' ? ' category-riformista-filter' : '') + (name === '@giutrapani' ? ' category-x-filter' : '') + (state.activeCategory === name ? ' is-active' : '')
    + '" data-category="' + esc(name) + '" aria-pressed="' + (state.activeCategory === name ? 'true' : 'false') + '">'
    + esc(name) + '<span class="category-count">' + count + '</span></button>'
  ).join('') + '<a class="category-filter category-social" href="https://x.com/giutrapani" target="_blank" rel="noopener noreferrer" aria-label="Apri il profilo di giutrapani su X">↗ X</a>';
}

function render() {
  const query = el.search.value.trim().toLocaleLowerCase('it');
  const rows = [...state.news]
    // I contenuti di @giutrapani hanno una corsia editoriale prioritaria:
    // post e repost restano in testa, ordinati dal più recente, prima delle news.
    .sort((a, b) => {
      // Prima gli approfondimenti pubblicati dalla Redazione, dal più recente;
      // subito dopo i post/repost X, poi tutte le altre fonti in ordine cronologico.
      const aIsEditorial = newsCategory(a) === 'REDAZIONE';
      const bIsEditorial = newsCategory(b) === 'REDAZIONE';
      if (aIsEditorial !== bIsEditorial) return aIsEditorial ? -1 : 1;
      const aIsX = newsCategory(a) === '@giutrapani';
      const bIsX = newsCategory(b) === '@giutrapani';
      if (aIsX !== bIsX) return aIsX ? -1 : 1;
      return new Date(b.pubDate || 0) - new Date(a.pubDate || 0);
    })
    .filter(item => state.activeCategory === 'TUTTE' || newsCategory(item) === state.activeCategory)
    .filter(item => !query || (
      String(item.title || '') + ' ' + String(item.source || '') + ' ' + String(item.summary || '')
    ).toLocaleLowerCase('it').includes(query));

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  state.currentPage = Math.min(state.currentPage, pageCount);
  const visibleRows = rows.slice((state.currentPage - 1) * PAGE_SIZE, state.currentPage * PAGE_SIZE);
  el.articles.innerHTML = visibleRows.map(item => {
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
      + '<span class="news-category' + (category === 'REDAZIONE' ? ' news-category-redazione' : category === 'IL RIFORMISTA' ? ' news-category-riformista' : category === '@giutrapani' ? ' news-category-x' : '') + '">' + esc(category) + '</span>'
      + '<div class="news-main">' + marker
      + '<h2 class="news-title"><a href="' + link + '" ' + (item.isEditorial ? '' : 'target="_blank" rel="noopener"') + '>'
      + esc(item.title || 'Senza titolo') + '</a></h2></div>'
      + '<div class="news-source">' + esc(item.source || '') + '</div>'
      + (item.isEditorial ? '<a class="news-link" href="' + link + '" aria-label="Apri approfondimento">APRI ↗</a>' : '<a class="news-link" href="' + link + '" target="_blank" rel="noopener" aria-label="Leggi la notizia">LEGGI ↗</a>')
      + (redazione.auth ? '<button type="button" class="redazione-open" data-title="' + esc(item.title || '') + '" data-source="' + esc(item.source || '') + '" data-url="' + link + '">REDAZIONE</button>' : '')
      + '</article>';
  }).join('');

  el.emptyState.hidden = rows.length > 0;
  el.pagination.innerHTML = rows.length > 0
    ? '<div class="pagination-info">Pagina ' + state.currentPage + ' di ' + pageCount + ' · visualizzati ' + ((state.currentPage - 1) * PAGE_SIZE + 1) + '–' + Math.min(state.currentPage * PAGE_SIZE, rows.length) + ' di ' + rows.length + '</div>'
      + '<div class="pagination-controls">'
      + '<button type="button" data-page="prev" ' + (state.currentPage === 1 ? 'disabled' : '') + '>← PRECEDENTE</button>'
      + '<button type="button" data-page="next" ' + (state.currentPage === pageCount ? 'disabled' : '') + '>SUCCESSIVA →</button>'
      + '</div><button type="button" id="footer-redazione-edit" class="footer-redazione-button">✎ SCRIVI IN REDAZIONE</button>'
    : '<button type="button" id="footer-redazione-edit" class="footer-redazione-button">✎ SCRIVI IN REDAZIONE</button>';
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
    const editorialResponse = await fetch('/api/redazione/published');
    const editorialData = editorialResponse.ok ? await editorialResponse.json() : { notes:[] };
    const editorialItems = (editorialData.notes || []).map(note => ({ id:note.id, title:note.title, source:'A cura della Redazione', pubDate:note.published_at, summary:note.notes || '', link:'/redazione.html?id=' + encodeURIComponent(note.id), category:'REDAZIONE', isEditorial:true }));
    state.news = [...(data.articles || []), ...editorialItems];
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

el.search.addEventListener('input', () => { state.currentPage = 1; render(); });
el.categoryFilters.addEventListener('click', event => {
  const button = event.target.closest('button[data-category]');
  if (!button) return;
  state.activeCategory = button.dataset.category;
  state.currentPage = 1;
  renderCategoryFilters();
  render();
});
el.refreshBtn.addEventListener('click', load);
load();
setInterval(load, AUTO_REFRESH_MS);


// Area privata: le credenziali restano nella memoria della pagina e non vengono salvate.
const redazione = { auth: '', notes: [] };
const redPanel = document.getElementById('redazione-panel');
const redForm = document.getElementById('redazione-form');
const redMessage = document.getElementById('redazione-message');
const redList = document.getElementById('redazione-notes-list');
const rf = {
  id: document.getElementById('redazione-id'),
  title: document.getElementById('redazione-title'),
  source: document.getElementById('redazione-source'),
  url: document.getElementById('redazione-url'),
  notes: document.getElementById('redazione-notes'),
  links: document.getElementById('redazione-links')
};
async function redRequest(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (redazione.auth) headers.Authorization = redazione.auth;
  if (options.body) headers['Content-Type'] = 'application/json';
  return fetch(url, { ...options, headers });
}
async function redLogin() {
  if (!redazione.auth) {
    const user = prompt('Utente REDAZIONE:');
    if (user === null) return false;
    const pass = prompt('Password REDAZIONE:');
    if (pass === null) return false;
    redazione.auth = 'Basic ' + btoa(unescape(encodeURIComponent(user + ':' + pass)));
  }
  const response = await redRequest('/api/redazione/notes');
  if (response.status === 401 || response.status === 403) {
    redazione.auth = ''; alert('Credenziali non valide. Riprova.'); return false;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { alert(data.error || 'Archivio non disponibile.'); return false; }
  redazione.notes = data.notes || []; renderRedArchive(); render(); return true;
}
function renderRedArchive() {
  if (!redazione.notes.length) { redList.textContent = 'Nessuna nota salvata.'; return; }
  redList.innerHTML = redazione.notes.map(note =>
    '<article class="redazione-note"><button type="button" class="redazione-note-title" data-edit-note="' + note.id + '">' + esc(note.title || 'Senza titolo') + '</button><span>' + esc(note.source || '') + (note.published_at ? ' · PUBBLICATA' : ' · BOZZA') + '</span><div class="redazione-note-tools">' + (note.published_at ? '<button type="button" data-unpublish-note="' + note.id + '">RITIRA</button>' : '<button type="button" data-publish-note="' + note.id + '">PUBBLICA</button>') + '<button type="button" class="redazione-delete" data-delete-note="' + note.id + '">ELIMINA</button></div></article>'
  ).join('');
}
async function refreshRedArchive() {
  const response = await redRequest('/api/redazione/notes');
  if (response.ok) { redazione.notes = (await response.json()).notes || []; renderRedArchive(); load(); }
}
function openRedPanel(item) {
  redPanel.classList.add('is-open'); redPanel.setAttribute('aria-hidden','false');
  document.body.classList.add('redazione-lock'); redForm.reset(); rf.id.value = '';
  rf.title.value = item.title || ''; rf.source.value = item.source || ''; rf.url.value = item.url || '';
  redMessage.textContent = ''; redLogin();
}
function closeRedPanel() {
  redPanel.classList.remove('is-open'); redPanel.setAttribute('aria-hidden','true');
  document.body.classList.remove('redazione-lock');
}
document.getElementById('redazione-login').addEventListener('click', () => openRedPanel({}));
el.pagination.addEventListener('click', event => {
  const pageButton = event.target.closest('[data-page]');
  if (pageButton) {
    state.currentPage += pageButton.dataset.page === 'next' ? 1 : -1;
    render();
    document.getElementById('articles').scrollIntoView({ behavior:'smooth', block:'start' });
    return;
  }
  if (event.target.closest('#footer-redazione-edit')) openRedPanel({});
});
document.addEventListener('click', async event => {
  const open = event.target.closest('.redazione-open');
  if (open) openRedPanel({ title:open.dataset.title, source:open.dataset.source, url:open.dataset.url });
  if (event.target.closest('[data-redazione-close]')) closeRedPanel();
  const edit = event.target.closest('[data-edit-note]');
  if (edit) {
    const note = redazione.notes.find(item => String(item.id) === edit.dataset.editNote);
    if (!note) return;
    rf.id.value = note.id; rf.title.value = note.title; rf.source.value = note.source;
    rf.url.value = note.original_url; rf.notes.value = note.notes; rf.links.value = note.extra_links;
    redMessage.textContent = 'Nota caricata: puoi modificarla e salvarla.';
    document.querySelector('.redazione-content').scrollTop = 0;
  }
  const publish = event.target.closest('[data-publish-note]');
  const unpublish = event.target.closest('[data-unpublish-note]');
  if (publish || unpublish) {
    const id = (publish || unpublish).dataset[publish ? 'publishNote' : 'unpublishNote'];
    const action = publish ? 'publish' : 'unpublish';
    const response = await redRequest('/api/redazione/notes/' + id + '/' + action, { method:'POST' });
    if (response.ok) { redMessage.textContent = publish ? 'Contenuto pubblicato nel flusso.' : 'Contenuto ritirato dal flusso.'; await refreshRedArchive(); }
    else redMessage.textContent = 'Operazione non riuscita.';
  }
  const del = event.target.closest('[data-delete-note]');
  if (del && confirm('Vuoi eliminare definitivamente questa nota?')) {
    const response = await redRequest('/api/redazione/notes/' + del.dataset.deleteNote, { method:'DELETE' });
    if (response.ok) refreshRedArchive();
  }
});
document.getElementById('redazione-new').addEventListener('click', () => {
  redForm.reset(); rf.id.value = ''; redMessage.textContent = 'Nuova nota pronta.';
});
redForm.addEventListener('submit', async event => {
  event.preventDefault();
  const payload = { title:rf.title.value.trim(), source:rf.source.value.trim(), original_url:rf.url.value.trim(), notes:rf.notes.value, extra_links:rf.links.value };
  const id = rf.id.value;
  const response = await redRequest('/api/redazione/notes' + (id ? '/' + id : ''), { method:id ? 'PUT' : 'POST', body:JSON.stringify(payload) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { redMessage.textContent = data.error || 'Salvataggio non riuscito.'; return; }
  redMessage.textContent = 'Nota salvata nell’archivio.'; rf.id.value = ''; await refreshRedArchive();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeRedPanel(); });
