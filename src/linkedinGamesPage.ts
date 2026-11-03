export const LINKEDIN_GAMES_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>LinkedIn Games · Meridian</title><style>
*{box-sizing:border-box}body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#0e141c;color:#e6edf3;line-height:1.4}
a{color:#7aa7e6;text-decoration:none}
header{background:#111d2e;border-bottom:1px solid #1e2e44;display:flex;justify-content:space-between;align-items:center;padding:14px 20px;gap:16px;flex-wrap:wrap}
header h1{margin:0;font-size:18px}
main{max-width:520px;margin:0 auto;padding:20px 16px 40px}
.card{background:#131f33;border:1px solid #1e2e44;border-radius:12px;padding:16px;margin-bottom:12px}
.card h2{margin:0 0 4px;font-size:13px;letter-spacing:.05em;text-transform:uppercase;color:#8ea0b8}
.muted{color:#8ea0b8;font-size:12px}
label{display:block;margin-top:12px;font-size:12px;color:#8ea0b8}
select,input{width:100%;background:#0d1b2a;color:#c8d7ea;border:1px solid #1e2e44;border-radius:6px;padding:10px;font-size:16px}
.btn{width:100%;margin-top:16px;border:0;border-radius:8px;padding:12px;font-weight:600;cursor:pointer;font-size:15px;background:#1f6feb;color:#fff}
ul{list-style:none;margin:8px 0 0;padding:0}li{padding:4px 0;border-top:1px solid #1e2e44;font-size:14px}
.cgroup{margin-top:18px}.cgroup>summary{cursor:pointer;list-style:none;font-size:14px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#8ea0b8;margin-bottom:10px}
.cgroup>summary::before{content:"▸";margin-right:8px}.cgroup[open]>summary::before{content:"▾"}
.gcard.reg{border-color:#b9553f}.gcard h3{margin:0 0 6px;font-size:15px}.badge{font-size:11px;color:#f0b4a6;border:1px solid #b9553f;border-radius:10px;padding:1px 8px;margin-left:8px;font-weight:400}
.gcard p{margin:2px 0;font-size:14px}.spark{width:100%;height:36px;margin-top:6px}
</style></head><body>
<header><h1>LinkedIn Games</h1><a href="/">← Dashboard</a></header>
<main>
<section class="card">
 <h2>Registrar resultado</h2>
 <div class="muted">Lo introduces tú; no se lee nada de LinkedIn. Tiempos como M:SS.</div>
 <label for="game">Juego</label>
 <select id="game">
  <option value="zip">Zip</option><option value="tango">Tango</option><option value="queens">Queens</option>
  <option value="mini_sudoku">Mini Sudoku</option><option value="patches">Patches</option><option value="wend">Wend</option>
 </select>
 <label for="date">Fecha de la partida</label>
 <input id="date" type="date" onchange="loadDay()">
 <label for="score">Tu tiempo (M:SS)</label>
 <input id="score" type="text" inputmode="numeric" placeholder="0:08" autocomplete="off">
 <label for="avg">Promedio de hoy (opcional)</label>
 <input id="avg" type="text" inputmode="numeric" placeholder="0:17" autocomplete="off">
 <label for="number">Nº de puzzle (opcional)</label>
 <input id="number" type="number" min="1" step="1" inputmode="numeric">
 <button id="save" type="button" class="btn" onclick="saveResult()">Guardar</button>
 <div id="status" class="muted" role="status" style="margin-top:8px"></div>
</section>
<section class="card"><h2>Registrado ese día</h2><ul id="day"></ul></section>
<details class="cgroup" id="summaryBlock" open><summary>Resumen</summary>
 <div id="sumStatus" class="muted" role="status"></div>
 <div id="sumGlobal" class="muted"></div>
 <div id="sumGames"></div>
</details>
</main>
<script>
const q=s=>document.querySelector(s);
const _fetch=window.fetch.bind(window);
window.fetch=async(...a)=>{const r=await _fetch(...a); if(r.status===401) location.href='/login?next='+encodeURIComponent(location.pathname); return r;};
const today=()=>new Date().toLocaleDateString('sv-SE');
q('#date').value=today();
function render(day){
 const ul=q('#day'); ul.textContent='';
 const g=(day&&day.games)||{}, keys=Object.keys(g);
 if(!keys.length){ const li=document.createElement('li'); li.className='muted'; li.textContent='Nada todavía.'; ul.appendChild(li); return; }
 keys.forEach(k=>{ const e=g[k]||{}; const li=document.createElement('li');
  li.textContent=k.replace('_',' ')+': '+(e.score??'?')+(e.avg?'  (media '+e.avg+')':'')+(e.number?'  #'+e.number:''); ul.appendChild(li); });
}
async function loadDay(){
 try{
  const res=await fetch('/api/me/linkedin-games?date='+encodeURIComponent(q('#date').value));
  if(!res.ok) throw new Error('http '+res.status);
  render((await res.json()).day);
 }catch(e){ q('#day').textContent=''; q('#status').textContent='No se pudo cargar el día.'; }
}
async function saveResult(){
 const status=q('#status');
 const num=q('#number').value.trim();
 const payload={date:q('#date').value,game:q('#game').value,score:q('#score').value.trim(),avg:q('#avg').value.trim()||null,number:num===''?null:Number(num),tz:Intl.DateTimeFormat().resolvedOptions().timeZone};
 status.textContent='Guardando…';
 try{
  const res=await fetch('/api/me/linkedin-games',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
  const body=await res.json().catch(()=>({}));
  if(!res.ok||!body.ok){ status.textContent='No se pudo guardar: '+(body.error||res.status); return; }
  status.textContent='Guardado.'; q('#score').value=''; q('#avg').value=''; q('#number').value=''; render(body.day);
 }catch(e){ status.textContent='No se pudo guardar.'; }
}
const GAME_NAMES={zip:'Zip',tango:'Tango',queens:'Queens',mini_sudoku:'Mini Sudoku',patches:'Patches',wend:'Wend'};
const nf=(v,d)=>v==null?'—':v.toLocaleString('es-ES',{maximumFractionDigits:d});
const mmss=s=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
const days=n=>n+(n===1?' día':' días');
function spark(series){
 const v=series.map(p=>p.roll); if(v.length<2) return '';
 const lo=Math.min(...v), hi=Math.max(...v), r=(hi-lo)||1;
 const pts=v.map((y,i)=>(i/(v.length-1)*100).toFixed(1)+','+(22-(y-lo)/r*20).toFixed(1)).join(' ');
 return '<svg class="spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><polyline points="'+pts+'" fill="none" stroke="#7aa7e6" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>';
}
function line(card,text){ const p=document.createElement('p'); p.textContent=text; card.appendChild(p); }
function renderSummary(s){
 const g=q('#sumGames'); g.textContent='';
 q('#sumStatus').textContent='';
 const keys=Object.keys(s.games);
 if(!keys.length){ q('#sumGlobal').textContent='Aún no hay datos.'; return; }
 q('#sumGlobal').textContent=days(s.days)+' registrados · racha de días jugados: '+days(s.playStreak.current)+' (máx '+s.playStreak.max+')';
 keys.sort((a,b)=>Number(s.games[b].regression)-Number(s.games[a].regression)).forEach(k=>{
  const x=s.games[k], e=x.efficiency, card=document.createElement('section');
  card.className='card gcard'+(x.regression?' reg':'');
  const h=document.createElement('h3'); h.textContent=GAME_NAMES[k]||k; card.appendChild(h);
  if(x.regression){ const b=document.createElement('span'); b.className='badge'; b.textContent='regresión'; h.appendChild(b); }
  const ch=e.change==null?'sin ventana previa':(e.change>0?'+':'')+Math.round(e.change*100)+' % vs 28 d previos';
  line(card,'Eficiencia 28 d: '+(e.last28==null?'—':'×'+nf(e.last28,2)+' ('+ch+')'));
  line(card,'Gana a la media: '+(x.beatAvgRate==null?'—':Math.round(x.beatAvgRate*100)+' % ('+x.nWithAvg+' con media)'));
  line(card,'Mejor marca: '+mmss(x.best.seconds)+' ('+x.best.date+')');
  line(card,'Racha ganando a la media: '+days(x.beatStreak.current)+' (máx '+x.beatStreak.max+')');
  const sp=document.createElement('div'); sp.innerHTML=spark(x.series); card.appendChild(sp);
  g.appendChild(card);
 });
}
async function loadSummary(){
 try{
  const res=await fetch('/api/me/linkedin-games/summary?today='+encodeURIComponent(today()));
  if(!res.ok) throw new Error('http '+res.status);
  renderSummary((await res.json()).summary);
 }catch(e){ q('#sumGames').textContent=''; q('#sumGlobal').textContent=''; q('#sumStatus').textContent='No se pudo cargar el resumen.'; }
}
loadDay();
loadSummary();
</script></body></html>`;
