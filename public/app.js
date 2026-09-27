const AUTO_REFRESH_MS = 5 * 60 * 1000;

const state = {
  articles: [],
  soundEnabled: false,
  loaded: false,
};

const el = {
  search: document.getElementById('search'),
  categoryFilter: document.getElementById('category-filter'),
  sourceFilter: document.getElementById('source-filter'),
  priorityFilter: document.getElementById('priority-filter'),
  soundToggle: document.getElementById('sound-toggle'),
  refreshBtn: document.getElementById('refresh-btn'),
  status: document.getElementById('status'),
  errorsDetails: document.getElementById('errors-details'),
  errorsList: document.getElementById('errors-list'),
  articles: document.getElementById('articles'),
  emptyState: document.getElementById('empty-state'),
  themeToggle: document.getElementById('theme-toggle'),
};

function initSound() {
  state.soundEnabled = localStorage.getItem('soundEnabled') === 'true';
  el.soundToggle.checked = state.soundEnabled;
}

el.soundToggle.addEventListener('change', () => {
  state.soundEnabled = el.soundToggle.checked;
  localStorage.setItem('soundEnabled', String(state.soundEnabled));
});

function playBreakingAlert() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const beep = (startAt) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, ctx.currentTime + startAt);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + startAt);
      osc.stop(ctx.currentTime + startAt + 0.22);
    };
    beep(0);
    beep(0.28);
  } catch (err) {
    console.warn('Segnale acustico non disponibile', err);
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  el.themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('theme', theme);
}

function initTheme() {
  const saved = localStorage.getItem('theme');
  const preferred = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(preferred);
}

el.themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

function formatDate(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderArticles() {
  const query = el.search.value.trim().toLowerCase();
  const category = el.categoryFilter.value;
  const source = el.sourceFilter.value;
  const priorityMin = el.priorityFilter.value ? Number(el.priorityFilter.value) : null;

  const filtered = state.articles.filter((a) => {
    if (category && a.category !== category) return false;
    if (source && a.source !== source) return false;
    if (priorityMin !== null && a.priority < priorityMin) return false;
    if (query) {
      const haystack = `${a.title} ${a.summary}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  el.articles.innerHTML = filtered
    .map((a) => {
      const priorityClass = a.priority > 0 ? `priority-${a.priority}` : '';
      const badge = a.priority > 0
        ? `<span class="priority-badge level-${a.priority}" title="${escapeHtml(a.priorityLabel)}">${a.priorityCrosses} ${escapeHtml(a.priorityLabel)}</span>`
        : '';
      return `
      <article class="card ${priorityClass}">
        ${badge}
        <div class="card-meta">
          <span class="card-source">${escapeHtml(a.source)}</span>
          <span>${formatDate(a.pubDate)}</span>
        </div>
        <h2><a href="${escapeHtml(a.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(a.title)}</a></h2>
        ${a.summary ? `<p>${escapeHtml(a.summary)}</p>` : ''}
        <span class="category-tag">${escapeHtml(a.category)}</span>
      </article>`;
    })
    .join('');

  el.emptyState.hidden = filtered.length > 0;
}

function populateFilterOptions(select, values, placeholder) {
  const current = select.value;
  select.innerHTML = `<option value="">${placeholder}</option>` +
    values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  if (values.includes(current)) select.value = current;
}

async function loadSources() {
  try {
    const res = await fetch('/api/sources');
    const data = await res.json();
    populateFilterOptions(el.categoryFilter, data.categories, 'Tutte le categorie');
    populateFilterOptions(el.sourceFilter, data.sources, 'Tutte le fonti');
  } catch (err) {
    console.error('Errore nel caricamento delle fonti', err);
  }
}

async function loadFeeds(forceRefresh = false) {
  el.status.textContent = 'Aggiornamento in corso...';
  el.refreshBtn.disabled = true;
  try {
    const res = await fetch(`/api/feeds${forceRefresh ? '?refresh=true' : ''}`);
    const data = await res.json();
    const newArticles = data.articles || [];

    if (state.loaded && state.soundEnabled) {
      const previousLinks = new Set(state.articles.map((a) => a.link));
      const newBreaking = newArticles.filter((a) => a.priority === 3 && !previousLinks.has(a.link));
      if (newBreaking.length > 0) playBreakingAlert();
    }

    state.articles = newArticles;
    state.loaded = true;
    renderArticles();

    const updated = data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString('it-IT') : '';
    let statusText = `${data.count} articoli · ultimo aggiornamento ${updated}`;
    if (data.errors && data.errors.length > 0) {
      statusText += ` · ${data.errors.length} fonte/i non raggiungibile/i`;
      el.errorsList.innerHTML = data.errors
        .map((e) => `<li>${escapeHtml(e.source)}: ${escapeHtml(e.message)}</li>`)
        .join('');
      el.errorsDetails.hidden = false;
    } else {
      el.errorsDetails.hidden = true;
    }
    el.status.textContent = statusText;
  } catch (err) {
    el.status.textContent = 'Errore nel recupero dei feed. Riprova più tardi.';
    console.error(err);
  } finally {
    el.refreshBtn.disabled = false;
  }
}

el.search.addEventListener('input', renderArticles);
el.categoryFilter.addEventListener('change', renderArticles);
el.sourceFilter.addEventListener('change', renderArticles);
el.priorityFilter.addEventListener('change', renderArticles);
el.refreshBtn.addEventListener('click', () => loadFeeds(true));

initTheme();
initSound();
loadSources();
loadFeeds();
setInterval(() => loadFeeds(false), AUTO_REFRESH_MS);
