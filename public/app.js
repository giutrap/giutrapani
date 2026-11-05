const AUTO_REFRESH_MS = 60000;
const PAGE_SIZE = 50;
const headerDateEl = document.getElementById('header-date');
const headerTimeEl = document.getElementById('header-time');
function renderHeaderClock() {
  const now = new Date();
  if (headerDateEl) {
    const label = now.toLocaleDateString('it-IT', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    headerDateEl.textContent = label.charAt(0).toLocaleUpperCase('it-IT') + label.slice(1);
  }
  if (headerTimeEl) {
    headerTimeEl.textContent = now.toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
  }
}
renderHeaderClock();
setInterval(renderHeaderClock, 1000);
const state = { news: [], newsErrors: [], activeCategory: 'TUTTE', activeKeyword: '', currentPage: 1, podcast: null, media: null };
const trendEl = { list: document.getElementById('trends-list'), updated: document.getElementById('trends-updated') };
const el = {
  search: document.getElementById('search'),
  refreshBtn: document.getElementById('refresh-btn'),
  status: document.getElementById('status'),
  newsErrorsDetails: document.getElementById('news-errors-details'),
  newsErrorsList: document.getElementById('news-errors-list'),
  articles: document.getElementById('articles'),
  emptyState: document.getElementById('empty-state'),
  pagination: document.getElementById('pagination'),
};
function getInsightSessionId() {
  try {
    let id = sessionStorage.getItem('breaking-insight-session');
    if (!id) {
      id = window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return (c==='x'?r:(r&3|8)).toString(16);});
      sessionStorage.setItem('breaking-insight-session',id);
    }
    return id;
  } catch { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return (c==='x'?r:(r&3|8)).toString(16);}); }
}
const insightSessionId = getInsightSessionId();
function sendInsight(event) {
  fetch('/api/insight/collect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:insightSessionId,event}),keepalive:true}).catch(()=>{});
}
function startInsightTracking() {
  const today = new Date().toLocaleDateString('en-CA');
  try {
    if (sessionStorage.getItem('breaking-insight-visit-day') !== today) {
      sendInsight('visit');
      sessionStorage.setItem('breaking-insight-visit-day',today);
    }
  } catch { sendInsight('visit'); }
  const heartbeat = () => sendInsight('heartbeat');
  heartbeat();
  setInterval(heartbeat,30000);
}
startInsightTracking();

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function isFutureDated(item) {
  const timestamp = Date.parse(item.pubDate || '');
  // Tolleranza di due ore per piccoli disallineamenti tra server e feed RSS.
  return Number.isFinite(timestamp) && timestamp > Date.now() + 2 * 60 * 60 * 1000;
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
  if (item.isEditorial) return 'FOCUS';
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



const KEYWORD_TOPICS = [
  { label:'MIDTERM USA 2026', terms:['midterm','midterms','elezioni di meta mandato','elezioni di metà mandato','congresso usa','congresso americano','repubblicani','democratici','casa bianca','trump'], require:['midterm','midterms','elezioni di meta mandato','elezioni di metà mandato','congresso usa','congresso americano'] },
  { label:'MANOVRA ECONOMICA ITALIA', terms:['manovra','legge di bilancio','finanziaria','bilancio dello stato','conti pubblici','deficit','debito pubblico'], require:['manovra','legge di bilancio','finanziaria','bilancio dello stato','conti pubblici'] },
  { label:'GUERRA IN IRAN', terms:['iran','teheran','tehran','stretto di hormuz','missili iraniani','israele iran'], require:['iran','teheran','tehran','stretto di hormuz','missili iraniani','israele iran'] },
  { label:'GUERRA IN UCRAINA', terms:['ucraina','ucraino','ucraini','kiev','kyiv','zelensky','putin','russia'], require:['ucraina','ucraino','ucraini','kiev','kyiv','zelensky'] },
  { label:'GOVERNO MELONI', terms:['meloni','governo italiano','palazzo chigi','maggioranza','ministri'], require:['meloni','governo italiano','palazzo chigi'] },
  { label:'ELEZIONI USA', terms:['elezioni usa','elezioni americane','trump','democratici','repubblicani','congresso americano'], require:['elezioni usa','elezioni americane','presidenziali americane'] },
  { label:'UNIONE EUROPEA', terms:['unione europea','commissione europea','bruxelles','parlamento europeo','von der leyen'], require:['unione europea','commissione europea','bruxelles','parlamento europeo','von der leyen'] },
  { label:'INTELLIGENZA ARTIFICIALE', terms:['intelligenza artificiale','chatgpt','openai','ai','algoritmi'], require:['intelligenza artificiale','chatgpt','openai'] },
  { label:'SCUOLA E ISTRUZIONE', terms:['scuola','istruzione','docenti','studenti','universita','università','ministero istruzione'], require:['scuola','istruzione','docenti','studenti','universita','università'] },
  { label:'MERCATI ED ECONOMIA', terms:['borsa','spread','inflazione','tassi','economia','mercati finanziari','banche centrali'], require:['borsa','spread','inflazione','tassi','mercati finanziari','banche centrali'] },
  { label:'MEDIO ORIENTE', terms:['gaza','israele','palestina','hamas','libano','medio oriente'], require:['gaza','israele','palestina','hamas','libano'] },
  { label:'MIGRAZIONI', terms:['migranti','immigrazione','migratoria','sbarchi','ong','asilo'], require:['migranti','immigrazione','sbarchi','ong','asilo'] }
];
function normalizeForMatch(value) {
  return String(value || '').toLocaleLowerCase('it').normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
}
function itemSearchText(item) {
  return normalizeForMatch([item.title,item.summary,item.source].join(' '));
}
function topicMatches(item, topic) {
  const text = itemSearchText(item);
  return topic.require.some(term => {
    const needle = normalizeForMatch(term);
    return needle && (' ' + text + ' ').includes(' ' + needle + ' ');
  });
}
function buildTrends(items) {
  return KEYWORD_TOPICS.map(topic => {
    const matches = items.filter(item => !item.isEditorial && topicMatches(item,topic));
    const sources = new Set(matches.map(item => item.source).filter(Boolean));
    const recent = matches.filter(item => {
      const age = Date.now() - Date.parse(item.pubDate || '');
      return Number.isFinite(age) && age >= 0 && age <= 12 * 60 * 60 * 1000;
    }).length;
    return { ...topic, matches, sources:sources.size, recent };
  }).filter(topic => topic.matches.length > 0)
    .sort((a,b) => b.recent-a.recent || b.matches.length-a.matches.length || b.sources-a.sources)
    .slice(0,4);
}
function renderTrends() {
  if (!trendEl.list) return;
  const trends = buildTrends(state.news.filter(item => !isFutureDated(item)));
  trendEl.updated.textContent = 'Seleziona un tema per filtrare il flusso';
  if (!trends.length) {
    trendEl.list.innerHTML = '<p class="trends-empty">I temi appariranno qui quando saranno presenti nelle notizie raccolte.</p>';
    return;
  }
  trendEl.list.innerHTML = trends.map((topic,index) => {
    const active = state.activeKeyword === topic.label;
    return '<button type="button" class="keyword-card' + (active ? ' is-active' : '') + '" data-keyword="' + esc(topic.label) + '" aria-pressed="' + active + '"><span class="keyword-number">0' + (index+1) + '</span><span class="keyword-content"><span class="keyword-kicker">TEMA IN EVIDENZA</span><strong class="keyword-tag">' + esc(topic.label) + '</strong><span class="keyword-count">' + topic.matches.length + ' notizie · ' + topic.sources + ' fonti</span></span><span class="keyword-arrow">↗</span></button>';
  }).join('');
}

function render() {
  const query = el.search.value.trim().toLocaleLowerCase('it');
  const rows = state.news.filter(item => !isFutureDated(item))
    // Ordine editoriale: ultimo post X, ultimi due articoli del Riformista,
    // approfondimenti della Redazione e infine tutte le altre fonti in ordine cronologico.
    .sort((a, b) => {
      const priority = item => {
        const category = newsCategory(item);
        if (category === '@giutrapani') return 0;
        if (category === 'IL RIFORMISTA') return 1;
        if (category === 'FOCUS') return 2;
        return 3;
      };
      const difference = priority(a) - priority(b);
      if (difference !== 0) return difference;
      return new Date(b.pubDate || 0) - new Date(a.pubDate || 0);
    })
    .filter(item => state.activeCategory === 'TUTTE' || newsCategory(item) === state.activeCategory)
    .filter(item => !state.activeKeyword || KEYWORD_TOPICS.find(topic => topic.label === state.activeKeyword && topicMatches(item,topic)))
    .filter(item => !query || (
      String(item.title || '') + ' ' + String(item.source || '') + ' ' + String(item.summary || '')
    ).toLocaleLowerCase('it').includes(query));

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  state.currentPage = Math.min(state.currentPage, pageCount);
  const visibleRows = rows.slice((state.currentPage - 1) * PAGE_SIZE, state.currentPage * PAGE_SIZE);
  const podcastCard = state.podcast && state.podcast.enabled && state.podcast.episodeId && state.podcast.url
    ? '<aside class="feed-special-card feed-podcast-card"><a href="' + esc(state.podcast.url) + '" target="_blank" rel="noopener noreferrer"><span class="feed-special-kicker">PODCAST</span><strong>' + esc(state.podcast.title || 'Il Podcast') + '</strong>' + (state.podcast.description ? '<span class="feed-special-description">' + esc(state.podcast.description) + '</span>' : '') + '<span class="feed-special-action">ASCOLTA ORA ↗</span></a></aside>' : '';
  const memeCard = state.media && state.media.enabled && state.media.postUrl
    ? '<aside class="feed-special-card feed-meme-card"><a href="' + esc(state.media.postUrl) + '" target="_blank" rel="noopener noreferrer"><span class="feed-special-kicker">SOCIAL</span><strong>' + esc(state.media.title || 'Il Meme') + '</strong>' + (state.media.caption ? '<span class="feed-special-description">' + esc(state.media.caption) + '</span>' : '') + '<span class="feed-special-action">GUARDA ↗</span></a></aside>' : '';
  el.articles.innerHTML = visibleRows.map((item, index) => {
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
      + '<button type="button" class="news-category news-category-tag' + (category === 'FOCUS' ? ' news-category-redazione' : category === 'IL RIFORMISTA' ? ' news-category-riformista' : category === '@giutrapani' ? ' news-category-x' : '') + (state.activeCategory === category ? ' is-active' : '') + '" data-category="' + esc(category) + '" aria-pressed="' + (state.activeCategory === category ? 'true' : 'false') + '" title="Filtra per ' + esc(category) + '">' + esc(category) + '</button>'
      + '<div class="news-main">' + marker
      + '<h2 class="news-title"><a href="' + link + '" ' + (item.isEditorial ? '' : 'target="_blank" rel="noopener"') + '>'
      + esc(item.title || 'Senza titolo') + '</a></h2></div>'
      + '<div class="news-source">' + esc(item.source || '') + '</div>'
      + (item.isEditorial ? '<a class="news-link" href="' + link + '" aria-label="Apri approfondimento">APRI ↗</a>' : '<a class="news-link" href="' + link + '" target="_blank" rel="noopener" aria-label="Leggi la notizia">LEGGI ↗</a>')
      + (redazione.auth ? '<button type="button" class="redazione-open" data-title="' + esc(item.title || '') + '" data-source="' + esc(item.source || '') + '" data-url="' + link + '">REDAZIONE</button>' : '')
      + '</article>'
      + (((state.currentPage - 1) * PAGE_SIZE + index + 1) === 10 ? podcastCard : '')
      + (((state.currentPage - 1) * PAGE_SIZE + index + 1) === 20 ? memeCard : '');
  }).join('');

  el.emptyState.hidden = rows.length > 0;
  el.pagination.innerHTML = rows.length > 0
    ? '<div class="pagination-info">Pagina ' + state.currentPage + ' di ' + pageCount + ' · visualizzati ' + ((state.currentPage - 1) * PAGE_SIZE + 1) + '–' + Math.min(state.currentPage * PAGE_SIZE, rows.length) + ' di ' + rows.length + '</div>'
      + '<div class="pagination-controls">'
      + '<button type="button" data-page="prev" ' + (state.currentPage === 1 ? 'disabled' : '') + '>← PRECEDENTE</button>'
      + '<button type="button" data-page="next" ' + (state.currentPage === pageCount ? 'disabled' : '') + '>SUCCESSIVA →</button>'
      + '</div><button type="button" id="login-redazione" class="footer-redazione-button">LOGIN REDAZIONE</button>'
    : '<button type="button" id="login-redazione" class="footer-redazione-button">LOGIN REDAZIONE</button>';
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
    render();
    renderTrends();
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

document.addEventListener('click',event=>{
  const target=event.target;
  if (target.closest('.feed-special-card a,#podcast-card-link')) sendInsight('podcast_open');
  else if (target.closest('.feed-meme-card a,#media-card-link')) sendInsight('social_open');
  else if (target.closest('.news-title a,.news-link')) sendInsight('article_open');
  else if (target.closest('button[data-keyword]')) sendInsight('trend_filter');
  else if (target.closest('button[data-category]')) sendInsight('category_filter');
});

trendEl.list.addEventListener('click', event => {
  const button = event.target.closest('button[data-keyword]');
  if (!button) return;
  state.activeKeyword = state.activeKeyword === button.dataset.keyword ? '' : button.dataset.keyword;
  state.activeCategory = 'TUTTE';
  state.currentPage = 1;
  renderTrends();
  render();
  el.articles.scrollIntoView({ behavior:'smooth', block:'start' });
});
el.articles.addEventListener('click', event => {
  const button = event.target.closest('button[data-category]');
  if (!button) return;
  const selected = button.dataset.category;
  state.activeCategory = state.activeCategory === selected ? 'TUTTE' : selected;
  state.currentPage = 1;
  render();
});

el.refreshBtn.addEventListener('click', () => { sendInsight('manual_refresh'); load(); });
load();
loadLivePublic();
loadPodcastPublic();
loadMediaPublic();
setInterval(load, AUTO_REFRESH_MS);
setInterval(loadLivePublic, 60000);
setInterval(loadPodcastPublic, 60000);
setInterval(loadMediaPublic, 60000);


// Area privata: le credenziali restano nella memoria della pagina e non vengono salvate.
const redazione = { auth: '', notes: [] };
const redPanel = document.getElementById('redazione-panel');
const redForm = document.getElementById('redazione-form');
const redMessage = document.getElementById('redazione-message');
const redList = document.getElementById('redazione-notes-list');
const insightEls = {
  active:document.getElementById('insight-active'),
  visits:document.getElementById('insight-visits'),
  articles:document.getElementById('insight-articles'),
  interactions:document.getElementById('insight-interactions'),
  days:document.getElementById('insight-days'),
  breakdown:document.getElementById('insight-breakdown'),
  message:document.getElementById('insight-message')
};
const insightLabels = {
  article_open:'Aperture articoli',
  podcast_open:'Aperture Podcast',
  social_open:'Aperture Social',
  trend_filter:'Filtri Trend',
  category_filter:'Filtri categoria',
  manual_refresh:'Aggiornamenti manuali'
};
function renderInsights(data) {
  const today = data.today || {};
  const interactions = Object.entries(today).filter(([key])=>key!=='visit').reduce((sum,[,value])=>sum+Number(value||0),0);
  insightEls.active.textContent = Number(data.activeSessions||0).toLocaleString('it-IT');
  insightEls.visits.textContent = Number(today.visit||0).toLocaleString('it-IT');
  insightEls.articles.textContent = Number(today.article_open||0).toLocaleString('it-IT');
  insightEls.interactions.textContent = interactions.toLocaleString('it-IT');
  const days = data.days || [];
  const max = Math.max(1,...days.map(day=>Number(day.visits||0)));
  insightEls.days.innerHTML = days.map(day=>{
    const date = new Date(day.day+'T12:00:00');
    const label = date.toLocaleDateString('it-IT',{weekday:'short'}).replace('.','');
    const value = Number(day.visits||0);
    const height = Math.max(3,Math.round(value/max*64));
    return '<div class="insight-day"><strong>'+value+'</strong><span class="insight-day-bar" style="height:'+height+'px"></span><small>'+esc(label)+'</small></div>';
  }).join('') || '<span>Nessun dato disponibile.</span>';
  const events = (data.events||[]).filter(row=>row.event!=='visit' && insightLabels[row.event]).sort((a,b)=>b.count-a.count);
  insightEls.breakdown.innerHTML = events.length ? events.map(row=>'<div class="insight-breakdown-row"><span>'+esc(insightLabels[row.event])+'</span><strong>'+Number(row.count).toLocaleString('it-IT')+'</strong></div>').join('') : 'Nessuna interazione registrata oggi.';
  insightEls.message.textContent = 'Aggiornato alle '+new Date(data.refreshedAt||Date.now()).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
}
async function loadInsightsAdmin() {
  try {
    const response = await redRequest('/api/redazione/insights');
    const data = await response.json().catch(()=>({}));
    if (!response.ok) { insightEls.message.textContent = data.error || 'Statistiche non disponibili.'; return; }
    renderInsights(data);
  } catch { insightEls.message.textContent = 'Impossibile caricare gli Insight.'; }
}
document.getElementById('insight-refresh').addEventListener('click',loadInsightsAdmin);
setInterval(()=>{if(redazione.auth && redPanel.classList.contains('is-open')) loadInsightsAdmin();},30000);
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
  redazione.notes = data.notes || []; renderRedArchive(); await loadLiveAdmin(); await loadPodcastAdmin(); await loadMediaAdmin(); await loadInsightsAdmin(); render(); return true;
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
// L'accesso alla redazione è disponibile dal footer del flusso.
el.pagination.addEventListener('click', event => {
  const pageButton = event.target.closest('[data-page]');
  if (pageButton) {
    state.currentPage += pageButton.dataset.page === 'next' ? 1 : -1;
    render();
    document.getElementById('articles').scrollIntoView({ behavior:'smooth', block:'start' });
    return;
  }
  if (event.target.closest('#login-redazione')) openRedPanel({});
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


const liveEls = {
  section: document.getElementById('live-section'),
  player: document.getElementById('live-player'),
  title: document.getElementById('live-title'),
  description: document.getElementById('live-description'),
  url: document.getElementById('live-url'),
  adminTitle: document.getElementById('live-admin-title'),
  adminDescription: document.getElementById('live-admin-description'),
  message: document.getElementById('live-admin-message')
};
const podcastEls = {
  section: document.getElementById('podcast-section'), player: document.getElementById('podcast-player'),
  title: document.getElementById('podcast-title'), description: document.getElementById('podcast-description'),
  url: document.getElementById('podcast-url'), adminTitle: document.getElementById('podcast-admin-title'),
  adminDescription: document.getElementById('podcast-admin-description'), message: document.getElementById('podcast-admin-message')
};
function renderPodcast(data) {
  state.podcast = data || null;
  const enabled = Boolean(data && data.enabled && data.episodeId && data.url);
  podcastEls.section.hidden = !enabled;
  if (!enabled) { podcastEls.player && (podcastEls.player.src = ''); return; }
  podcastEls.section.querySelector('#podcast-card-link').href = data.url;
  podcastEls.title.textContent = data.title || 'Il Podcast';
  podcastEls.description.textContent = data.description || '';
  podcastEls.description.hidden = !data.description;
  render();
}
async function loadPodcastPublic() {
  try { const response = await fetch('/api/podcast'); if (response.ok) renderPodcast(await response.json()); }
  catch (error) { console.warn('Podcast non disponibile', error); }
}
async function loadPodcastAdmin() {
  try {
    const response = await redRequest('/api/redazione/podcast');
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { podcastEls.message.textContent = data.error || 'Impostazioni podcast non disponibili.'; return; }
    podcastEls.url.value = data.url || ''; podcastEls.adminTitle.value = data.title || '';
    podcastEls.adminDescription.value = data.description || '';
    podcastEls.message.textContent = data.enabled ? 'Podcast attualmente pubblicato.' : 'Nessun podcast pubblicato.';
  } catch { podcastEls.message.textContent = 'Impossibile caricare le impostazioni del podcast.'; }
}
document.getElementById('podcast-save').addEventListener('click', async () => {
  const payload = { url:podcastEls.url.value.trim(), title:podcastEls.adminTitle.value.trim(), description:podcastEls.adminDescription.value.trim(), enabled:true };
  podcastEls.message.textContent = 'Pubblicazione in corso…';
  try {
    const response = await redRequest('/api/redazione/podcast', { method:'PUT', body:JSON.stringify(payload) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { podcastEls.message.textContent = data.error || 'Pubblicazione non riuscita.'; return; }
    podcastEls.message.textContent = 'Podcast pubblicato nella homepage.'; renderPodcast(data);
  } catch { podcastEls.message.textContent = 'Errore di connessione durante la pubblicazione.'; }
});
document.getElementById('podcast-disable').addEventListener('click', async () => {
  podcastEls.message.textContent = 'Ritiro in corso…';
  try {
    const response = await redRequest('/api/redazione/podcast', { method:'PUT', body:JSON.stringify({ enabled:false }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { podcastEls.message.textContent = data.error || 'Ritiro non riuscito.'; return; }
    podcastEls.message.textContent = 'Podcast ritirato dalla homepage.'; renderPodcast(data);
  } catch { podcastEls.message.textContent = 'Errore di connessione durante il ritiro.'; }
});

const mediaEls = {
  section:document.getElementById('media-section'), embed:document.getElementById('media-embed'),
  title:document.getElementById('media-title'), caption:document.getElementById('media-caption'),
  url:document.getElementById('media-url'), adminTitle:document.getElementById('media-admin-title'),
  adminCaption:document.getElementById('media-admin-caption'), message:document.getElementById('media-admin-message')
};
let xWidgetsLoading = null;
function loadXWidgets() {
  if (window.twttr && window.twttr.widgets) return Promise.resolve(window.twttr);
  if (xWidgetsLoading) return xWidgetsLoading;
  xWidgetsLoading = new Promise((resolve,reject) => {
    let script = document.querySelector('script[data-breaking-x-widgets]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://platform.twitter.com/widgets.js';
      script.async = true;
      script.charset = 'utf-8';
      script.dataset.breakingXWidgets = 'true';
      document.body.appendChild(script);
    }
    script.addEventListener('load', () => resolve(window.twttr), { once:true });
    script.addEventListener('error', reject, { once:true });
    if (window.twttr && window.twttr.ready) window.twttr.ready(() => resolve(window.twttr));
  });
  return xWidgetsLoading;
}
function renderMedia(data) {
  state.media = data || null;
  const enabled = Boolean(data && data.enabled && data.postUrl);
  mediaEls.section.hidden = !enabled;
  if (!enabled) return;
  mediaEls.section.querySelector('#media-card-link').href = data.postUrl;
  mediaEls.title.textContent = data.title || 'Il meme';
  mediaEls.caption.textContent = data.caption || '';
  mediaEls.caption.hidden = !data.caption;
  render();
}
async function loadMediaPublic() {
  try { const response = await fetch('/api/media'); if (response.ok) renderMedia(await response.json()); }
  catch (error) { console.warn('Media non disponibile', error); }
}
async function loadMediaAdmin() {
  try {
    const response = await redRequest('/api/redazione/media');
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { mediaEls.message.textContent = data.error || 'Impostazioni media non disponibili.'; return; }
    mediaEls.url.value = data.url || ''; mediaEls.adminTitle.value = data.title || '';
    mediaEls.adminCaption.value = data.caption || '';
    mediaEls.message.textContent = data.enabled ? 'Contenuto attualmente pubblicato.' : 'Nessun contenuto media pubblicato.';
  } catch { mediaEls.message.textContent = 'Impossibile caricare le impostazioni media.'; }
}
document.getElementById('media-save').addEventListener('click', async () => {
  const payload = { url:mediaEls.url.value.trim(), title:mediaEls.adminTitle.value.trim(), caption:mediaEls.adminCaption.value.trim(), enabled:true };
  mediaEls.message.textContent = 'Pubblicazione in corso…';
  try {
    const response = await redRequest('/api/redazione/media', { method:'PUT', body:JSON.stringify(payload) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { mediaEls.message.textContent = data.error || 'Pubblicazione non riuscita.'; return; }
    mediaEls.message.textContent = 'Contenuto pubblicato nella homepage.'; renderMedia(data);
  } catch { mediaEls.message.textContent = 'Errore di connessione durante la pubblicazione.'; }
});
document.getElementById('media-disable').addEventListener('click', async () => {
  mediaEls.message.textContent = 'Ritiro in corso…';
  try {
    const response = await redRequest('/api/redazione/media', { method:'PUT', body:JSON.stringify({ enabled:false }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { mediaEls.message.textContent = data.error || 'Ritiro non riuscito.'; return; }
    mediaEls.message.textContent = 'Contenuto ritirato dalla homepage.'; renderMedia(data);
  } catch { mediaEls.message.textContent = 'Errore di connessione durante il ritiro.'; }
});

function youtubeWatchUrl(videoId) { return 'https://www.youtube.com/watch?v=' + encodeURIComponent(videoId); }
function renderLive(data) {
  const enabled = Boolean(data && data.enabled && data.videoId);
  liveEls.section.hidden = !enabled;
  if (!enabled) { liveEls.player.src = ''; return; }
  const embed = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(data.videoId);
  if (liveEls.player.src !== embed) liveEls.player.src = embed;
  liveEls.title.textContent = data.title || 'Diretta speciale';
  liveEls.description.textContent = data.description || '';
}
async function loadLivePublic() {
  try {
    const response = await fetch('/api/live');
    if (response.ok) renderLive(await response.json());
  } catch (error) { console.warn('Stato LIVE non disponibile', error); }
}
async function loadLiveAdmin() {
  try {
    const response = await redRequest('/api/redazione/live');
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { liveEls.message.textContent = data.error || 'Impostazioni LIVE non disponibili.'; return; }
    liveEls.url.value = data.videoId ? youtubeWatchUrl(data.videoId) : '';
    liveEls.adminTitle.value = data.title || '';
    liveEls.adminDescription.value = data.description || '';
    liveEls.message.textContent = data.enabled ? 'Diretta attualmente attiva.' : 'Nessuna diretta attiva.';
  } catch { liveEls.message.textContent = 'Impossibile caricare le impostazioni LIVE.'; }
}
document.getElementById('live-save').addEventListener('click', async () => {
  const payload = { url: liveEls.url.value.trim(), title: liveEls.adminTitle.value.trim(), description: liveEls.adminDescription.value.trim(), enabled: true };
  liveEls.message.textContent = 'Salvataggio in corso…';
  try {
    const response = await redRequest('/api/redazione/live', { method:'PUT', body:JSON.stringify(payload) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { liveEls.message.textContent = data.error || 'Salvataggio non riuscito.'; return; }
    liveEls.message.textContent = 'Diretta attivata e pubblicata nella homepage.';
    renderLive(data);
  } catch { liveEls.message.textContent = 'Errore di connessione durante il salvataggio.'; }
});
document.getElementById('live-disable').addEventListener('click', async () => {
  liveEls.message.textContent = 'Disattivazione in corso…';
  try {
    const response = await redRequest('/api/redazione/live', { method:'PUT', body:JSON.stringify({ enabled:false }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { liveEls.message.textContent = data.error || 'Disattivazione non riuscita.'; return; }
    liveEls.message.textContent = 'Diretta disattivata.';
    renderLive(data);
  } catch { liveEls.message.textContent = 'Errore di connessione durante la disattivazione.'; }
});
