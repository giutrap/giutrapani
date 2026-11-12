(() => {
const slug=decodeURIComponent(location.pathname.split('/').filter(Boolean).pop()||'');
const root=document.getElementById('live-blog-public'),updatesEl=document.getElementById('live-blog-public-updates');
let latest='';
const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=v=>new Date(v).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
function embed(url){
 if(!url)return '';
 let u;try{u=new URL(url)}catch{return ''}
 const host=u.hostname.replace(/^www\./,'').toLowerCase();
 if(host==='x.com'||host==='twitter.com'){
  return '<blockquote class="twitter-tweet"><a href="'+esc(u.href)+'"></a></blockquote>';
 }
 if(host==='youtu.be'||host==='youtube.com'||host==='m.youtube.com'){
  const id=host==='youtu.be'?u.pathname.split('/').filter(Boolean)[0]:(u.searchParams.get('v')||u.pathname.split('/').filter(Boolean).slice(-1)[0]);
  if(/^[A-Za-z0-9_-]{11}$/.test(id||''))return '<div class="live-embed-video"><iframe src="https://www.youtube-nocookie.com/embed/'+id+'" title="Video incorporato" loading="lazy" allowfullscreen></iframe></div>';
 }
 return '<p class="live-embed-link"><a href="'+esc(u.href)+'" target="_blank" rel="noopener noreferrer">Apri il contenuto originale ↗</a></p>';
}
function render(data){
 const b=data.blog;document.title=b.title+' · Live Blog · BreakingNEWS';
 document.getElementById('live-blog-public-title').textContent=b.title;
 document.getElementById('live-blog-public-subtitle').textContent=b.subtitle||'Tutti gli aggiornamenti, minuto per minuto.';
 document.getElementById('live-blog-public-status').textContent=b.status==='live'?'DIRETTA IN CORSO':'DIRETTA CONCLUSA';
 document.getElementById('live-blog-public-status').className=b.status==='live'?'live-blog-status-active':'live-blog-status-closed';
 const cover=document.getElementById('live-blog-public-cover');if(b.coverUrl){cover.src=b.coverUrl;cover.hidden=false}else cover.hidden=true;
 const rows=data.updates||[];latest=rows[0]?.created_at||'';
 document.getElementById('live-blog-last-update').textContent=rows.length?'Ultimo aggiornamento alle '+time(rows[0].created_at):'Diretta appena aperta';
 updatesEl.innerHTML=rows.length?rows.map(x=>'<article class="live-blog-update"><time>'+time(x.created_at)+'</time><div class="live-blog-update-content">'+(x.title?'<h2>'+esc(x.title)+'</h2>':'')+(x.body?'<p>'+esc(x.body).replace(/\n/g,'<br>')+'</p>':'')+(x.source?'<div class="live-blog-source">'+esc(x.source)+(x.source_url?' · <a href="'+esc(x.source_url)+'" target="_blank" rel="noopener noreferrer">Fonte ↗</a>':'')+'</div>':'')+(x.embed_url?embed(x.embed_url):'')+'</div></article>').join(''):'<p class="live-blog-empty">La redazione sta preparando i primi aggiornamenti.</p>';
 root.hidden=false;document.getElementById('live-blog-loading').hidden=true;
 if(window.twttr?.widgets?.load)window.twttr.widgets.load(updatesEl);
 else if(rows.some(x=>/https?:\/\/(www\.)?(x\.com|twitter\.com)\//i.test(x.embed_url||''))&&!document.getElementById('twitter-widgets-script')){
  const s=document.createElement('script');s.id='twitter-widgets-script';s.src='https://platform.twitter.com/widgets.js';s.async=true;s.onload=()=>window.twttr?.widgets?.load(updatesEl);document.head.appendChild(s);
 }
}
async function load(){try{const r=await fetch('/api/live-blogs/'+encodeURIComponent(slug));const d=await r.json();if(!r.ok)throw Error(d.error||'Diretta non disponibile.');render(d);document.getElementById('live-blog-error').hidden=true;}catch(e){document.getElementById('live-blog-loading').hidden=true;const el=document.getElementById('live-blog-error');el.textContent=e.message;el.hidden=false;}}
load();setInterval(load,15000);
})();