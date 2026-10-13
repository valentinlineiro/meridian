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
 try{ const b=await (await fetch('/api/me/linkedin-games?date='+encodeURIComponent(q('#date').value))).json(); render(b.day); }
 catch(e){ q('#status').textContent='No se pudo cargar el día.'; }
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
loadDay();
</script></body></html>`;
