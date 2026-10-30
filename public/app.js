const AUTO_REFRESH_MS = 60000;
const state = { news: [], newsErrors: [], launches: [], editingId: null, authorPassword: sessionStorage.getItem('breakingAuthorPassword') || '' };
const AUTHOR_AVATAR = 'data:image/webp;base64,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';
const el = {
  search: document.getElementById('search'),
  refreshBtn: document.getElementById('refresh-btn'),
  status: document.getElementById('status'),
  newsErrorsDetails: document.getElementById('news-errors-details'),
  newsErrorsList: document.getElementById('news-errors-list'),
  articles: document.getElementById('articles'),
  emptyState: document.getElementById('empty-state'),
  authorView: document.getElementById('author-launch-view'),
  authorLoginToggle: document.getElementById('author-login-toggle'),
  authorLogin: document.getElementById('author-login'),
  authorPassword: document.getElementById('author-password'),
  authorLoginBtn: document.getElementById('author-login-btn'),
  authorMessage: document.getElementById('author-message'),
  authorEditor: document.getElementById('author-editor'),
  authorLogout: document.getElementById('author-logout'),
  launchForm: document.getElementById('launch-form'),
  launchTitle: document.getElementById('launch-title'),
  launchBody: document.getElementById('launch-body'),
  launchLink: document.getElementById('launch-link'),
  launchSubmit: document.getElementById('launch-submit'),
  launchCancel: document.getElementById('launch-cancel'),
  launchManage: document.getElementById('launch-manage'),
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


function authorHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + state.authorPassword };
}
function renderLaunches() {
  const items = [...state.launches].sort((a,b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  el.authorView.hidden = items.length === 0;
  el.authorView.innerHTML = items.map(item => '<article class="author-card">'
    + '<div class="author-signature"><img src="' + AUTHOR_AVATAR + '" alt="Logo @giutrapani"><strong>@giutrapani</strong><time>' + tm(item.updatedAt || item.createdAt) + '</time></div>'
    + '<h2>' + esc(item.title) + '</h2><p>' + esc(item.body).replace(/\\n/g,'<br>') + '</p>'
    + (item.link ? '<a class="author-readmore" href="' + esc(item.link) + '" target="_blank" rel="noopener noreferrer">APPROFONDISCI ↗</a>' : '')
    + '</article>').join('');
  if (state.authorPassword) {
    el.launchManage.innerHTML = items.map(item => '<div class="launch-manage-row"><span>' + esc(item.title) + '</span><span><button type="button" data-edit="' + esc(item.id) + '">MODIFICA</button><button type="button" data-delete="' + esc(item.id) + '">ELIMINA</button></span></div>').join('');
  }
}
async function loadLaunches() {
  try { const r = await fetch('/api/launches'); if (r.ok) { const d = await r.json(); state.launches = d.launches || []; renderLaunches(); } }
  catch (e) { console.error('Lanci non disponibili', e); }
}
function showAuthorEditor() {
  el.authorLogin.hidden = true; el.authorEditor.hidden = false;
  el.authorLoginToggle.textContent = 'AREA AUTORE ATTIVA';
  renderLaunches();
}
async function authorLogin() {
  const password = el.authorPassword.value.trim();
  if (!password) { el.authorMessage.textContent = 'Inserisci la password.'; return; }
  try {
    const r = await fetch('/api/author/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password}) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Accesso non riuscito');
    state.authorPassword = password; sessionStorage.setItem('breakingAuthorPassword', password);
    el.authorMessage.textContent = ''; showAuthorEditor();
  } catch(e) { el.authorMessage.textContent = e.message; }
}
function resetLaunchForm() {
  state.editingId = null; el.launchForm.reset(); el.launchSubmit.textContent = 'PUBBLICA'; el.launchCancel.hidden = true;
}
async function saveLaunch(event) {
  event.preventDefault();
  const payload = { title: el.launchTitle.value.trim(), body: el.launchBody.value.trim(), link: el.launchLink.value.trim() };
  const editing = Boolean(state.editingId);
  try {
    const r = await fetch(editing ? '/api/launches/' + encodeURIComponent(state.editingId) : '/api/launches', {
      method: editing ? 'PUT' : 'POST', headers: authorHeaders(), body: JSON.stringify(payload)
    });
    const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Impossibile salvare il lancio');
    state.launches = d.launches || state.launches; resetLaunchForm(); renderLaunches();
  } catch(e) { el.authorMessage.textContent = e.message; }
}
async function manageLaunch(event) {
  const edit = event.target.closest('[data-edit]'); const del = event.target.closest('[data-delete]');
  if (edit) { const item = state.launches.find(x => x.id === edit.dataset.edit); if (!item) return;
    state.editingId = item.id; el.launchTitle.value = item.title; el.launchBody.value = item.body; el.launchLink.value = item.link || '';
    el.launchSubmit.textContent = 'SALVA MODIFICHE'; el.launchCancel.hidden = false; el.launchTitle.focus();
  }
  if (del && confirm('Vuoi eliminare questo lancio?')) {
    try { const r = await fetch('/api/launches/' + encodeURIComponent(del.dataset.delete), {method:'DELETE',headers:authorHeaders()});
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Eliminazione non riuscita');
      state.launches = d.launches || []; if (state.editingId === del.dataset.delete) resetLaunchForm(); renderLaunches();
    } catch(e) { el.authorMessage.textContent = e.message; }
  }
}
el.authorLoginToggle.addEventListener('click', () => { el.authorLogin.hidden = !el.authorLogin.hidden; if (!el.authorLogin.hidden) el.authorPassword.focus(); });
el.authorLoginBtn.addEventListener('click', authorLogin);
el.authorPassword.addEventListener('keydown', e => { if (e.key === 'Enter') authorLogin(); });
el.authorLogout.addEventListener('click', () => { state.authorPassword=''; sessionStorage.removeItem('breakingAuthorPassword'); el.authorEditor.hidden=true; el.authorLogin.hidden=true; el.authorLoginToggle.textContent='AREA AUTORE'; });
el.launchForm.addEventListener('submit', saveLaunch);
el.launchCancel.addEventListener('click', resetLaunchForm);
el.launchManage.addEventListener('click', manageLaunch);

function render() {
  const query = el.search.value.trim().toLocaleLowerCase('it');
  const rows = [...state.news]
    .sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0))
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
loadLaunches();
setInterval(load, AUTO_REFRESH_MS);
setInterval(loadLaunches, 60000);
