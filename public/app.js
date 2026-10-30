const AUTO_REFRESH_MS = 2 * 60 * 1000;
const state = { articles: [], topic: 'Tutti', kind: 'all' };
const el = {
 search: document.getElementById('search'), refreshBtn: document.getElementById('refresh-btn'),
 status: document.getElementById('status'), errorsDetails: document.getElementById('errors-details'),
 errorsList: document.getElementById('errors-list'), articles: document.getElementById('articles'),
 emptyState: document.getElementById('empty-state'), themeToggle: document.getElementById('theme-toggle'),
 topics: document.getElementById('topics'), clock: document.getElementById('clock')
};
const topicRules = {
 'Politica': /politic|governo|parlament|elezion|ministro|premier|partit|camera|senato|quirinale/i,
 'Esteri': /ester|guerra|ucrain|russia|medio oriente|israel|iran|usa|stati uniti|cina|diplomaz/i,
 'Europa': /europa|unione europea|ue |bruxelles|commissione europea|parlamento europeo|von der leyen/i,
 'Economia': /econom|borsa|mercat|inflaz|pil|lavoro|imprese|finanza|banca|industria|fisco/i,
 'Cronaca': /cronaca|incidente|omicidio|indagine|arrest|ferit|polizia|carabinieri|inchiesta|processo/i,
 'Società': /societ|sanit|salute|immigraz|giovani|lavoro|famiglia|diritti|ambiente/i,
 'Chiesa': /papa|vaticano|chiesa|vescovo|dioces|cattolic|sinodo|religion/i,
 'Scuola': /scuola|universit|istruzione|student|docent|insegnant|maturit|ministero dell'istruzione/i,
 'Cultura': /cultura|libri|libro|cinema|teatro|mostra|arte|festival|museo|musica/i
};
function applyTheme(theme){document.documentElement.setAttribute('data-theme',theme);el.themeToggle.textContent=theme==='dark'?'☀':'☾';localStorage.setItem('theme',theme)}
function initTheme(){const saved=localStorage.getItem('theme');applyTheme(saved||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'))}
el.themeToggle.addEventListener('click',()=>applyTheme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark'));
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function dateParts(iso){if(!iso)return 'ORARIO NON DISPONIBILE';const d=new Date(iso);if(Number.isNaN(d.getTime()))return 'ORARIO NON DISPONIBILE';return d.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'})+' · '+d.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}
function categoryOf(a){const text=(a.title+' '+a.summary).toLowerCase();for(const [cat,re] of Object.entries(topicRules)){if(re.test(text))return cat}if(a.category==='Economia')return 'Economia';if(a.category==='Mondo')return 'Esteri';return a.category||'Attualità'}
function urgency(title){const t=title.toLowerCase();if(/breaking|ultima ora|attentat|esplos|terremot|strage|invasione|dimission|emergenza|uccis|morto il/.test(t))return 5;if(/guerra|attacco|crisi|allarme|voto|governo|accordo|sciopero|sentenza|raid|offensiva/.test(t))return 4;if(/annuncia|approva|decisione|vertice|elezioni|riforma|condanna/.test(t))return 3;if(/presenta|incontro|convegno|iniziativa|negoziat/.test(t))return 2;return 1}
function urgencyLabel(n){return ['','ORDINARIA','RILIEVO','RILEVANTE','ALTA','FLASH'][n]}
function render(){const q=el.search.value.trim().toLocaleLowerCase('it');let list=state.articles.filter(a=>{const cat=categoryOf(a);if(state.topic!=='Tutti'&&cat!==state.topic)return false;if(q&&!(a.title+' '+a.summary+' '+a.source).toLocaleLowerCase('it').includes(q))return false;return true});list.sort((a,b)=>new Date(b.pubDate||0)-new Date(a.pubDate||0));el.articles.innerHTML=list.map(a=>{const n=urgency(a.title||'');const link=esc(a.link||'#');return '<article class="news-item"><div class="urgency">'+ '+'.repeat(n)+'<small>'+urgencyLabel(n)+'</small></div><div><div class="news-time">'+dateParts(a.pubDate)+'</div><h2 class="news-title"><a href="'+link+'" target="_blank" rel="noopener noreferrer">'+esc(a.title)+'</a></h2><div class="news-source">'+esc(a.source)+' <span class="category-tag">'+esc(categoryOf(a))+'</span> · <a href="'+link+'" target="_blank" rel="noopener noreferrer">Apri la notizia ↗</a></div></div></article>'}).join('');el.emptyState.hidden=list.length>0;if(state.kind==='social'){el.articles.innerHTML='';el.emptyState.hidden=false;el.emptyState.textContent='Il monitoraggio dei social sarà attivato in una fase successiva, con fonti pubbliche e integrazioni autorizzate.'}}
async function loadSources(){try{const r=await fetch('/api/sources');if(!r.ok)throw Error('sources')}catch(e){console.warn('Elenco fonti non disponibile',e)}}
async function loadFeeds(force=false){el.status.textContent='Aggiornamento delle fonti in corso…';el.refreshBtn.disabled=true;try{const r=await fetch('/api/feeds'+(force?'?refresh=true':''));if(!r.ok)throw Error('HTTP '+r.status);const data=await r.json();state.articles=data.articles||[];render();const updated=data.updatedAt?new Date(data.updatedAt).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):'non disponibile';el.status.textContent=(data.count||0)+' notizie · ultimo aggiornamento '+updated;if(data.errors?.length){el.errorsList.innerHTML=data.errors.map(x=>'<li>'+esc(x.source)+': '+esc(x.message)+'</li>').join('');el.errorsDetails.hidden=false}else el.errorsDetails.hidden=true}catch(e){el.status.textContent='Non riesco a raggiungere il servizio delle notizie. Riprova tra poco.';el.articles.innerHTML='';el.emptyState.hidden=false;el.emptyState.textContent='Servizio momentaneamente non disponibile. Verifica che il sito sia stato pubblicato correttamente.';console.error(e)}finally{el.refreshBtn.disabled=false}}
el.search.addEventListener('input',render);el.refreshBtn.addEventListener('click',()=>loadFeeds(true));
el.topics.addEventListener('click',e=>{const b=e.target.closest('button[data-topic]');if(!b)return;state.topic=b.dataset.topic;el.topics.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));render()});
document.querySelectorAll('.tab[data-kind]').forEach(b=>b.addEventListener('click',()=>{state.kind=b.dataset.kind;document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b));render()}));
initTheme();el.clock.textContent='ONLINE · '+new Date().toLocaleDateString('it-IT');loadSources();loadFeeds();setInterval(()=>loadFeeds(false),AUTO_REFRESH_MS);
