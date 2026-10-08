export const SETTINGS_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Configuración · Meridian</title><style>
*{box-sizing:border-box}body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#0e141c;color:#e6edf3;line-height:1.4}
a{color:#7aa7e6;text-decoration:none}a:hover{text-decoration:underline}
header{background:#111d2e;border-bottom:1px solid #1e2e44;display:flex;justify-content:space-between;align-items:center;padding:14px 20px;gap:16px;flex-wrap:wrap}
header h1{margin:0;font-size:18px}
main{max-width:720px;margin:0 auto;padding:20px 16px 40px}
.card{background:#131f33;border:1px solid #1e2e44;border-radius:12px;padding:16px;margin-bottom:12px}
.card h2{margin:0 0 4px;font-size:13px;letter-spacing:.05em;text-transform:uppercase;color:#8ea0b8}
.muted{color:#8ea0b8;font-size:12px}
.field{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px}
input{width:130px;background:#0d1b2a;color:#c8d7ea;border:1px solid #1e2e44;border-radius:6px;padding:6px 8px;font-size:14px}
.btn{border:0;border-radius:8px;padding:8px 14px;font-weight:600;cursor:pointer;font-size:13px;background:#1f6feb;color:#fff}
.btn:hover{background:#2a7bff}
</style></head><body>
<header><h1>Configuración</h1><a href="/">← Volver al dashboard</a></header>
<main>
<section class="card">
 <h2>Objetivo diario</h2>
 <div class="muted">XP que quieres conseguir cada día. Lo defines tú: no se toma del dato que reporta Duolingo. Vacío = sin objetivo.</div>
 <div class="field">
  <label for="goalInput" class="muted">XP por día</label>
  <input id="goalInput" type="number" min="1" max="10000" step="1" inputmode="numeric" placeholder="sin objetivo">
  <button id="goalSave" type="button" class="btn" onclick="saveDailyGoal()">Guardar</button>
  <span id="goalStatus" class="muted" role="status"></span>
 </div>
</section>
</main>
<script>
const q=s=>document.querySelector(s);
const _fetch=window.fetch.bind(window);
window.fetch=async(...a)=>{const r=await _fetch(...a); if(r.status===401) location.href='/login?next='+encodeURIComponent(location.pathname); return r;};
async function loadSettings(){
 try{
  const body=await (await fetch('/api/me/settings')).json();
  q('#goalInput').value=body&&typeof body.dailyGoalXp==='number'? String(body.dailyGoalXp):'';
 }catch(e){ q('#goalStatus').textContent='No se pudo cargar la configuración.'; }
}
async function saveDailyGoal(){
 const input=q('#goalInput'), status=q('#goalStatus');
 const raw=input.value.trim();
 const value=raw===''? null : Number(raw);
 if(value!==null&&!(Number.isInteger(value)&&value>=1&&value<=10000)){ status.textContent='Introduce un entero entre 1 y 10000, o déjalo vacío.'; return; }
 status.textContent='Guardando…';
 try{
  const res=await fetch('/api/me/settings',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({dailyGoalXp:value})});
  const body=await res.json().catch(()=>({}));
  if(!res.ok||!body.ok){ status.textContent='No se pudo guardar: '+(body.error||res.status); return; }
  input.value=body.dailyGoalXp==null? '' : String(body.dailyGoalXp);
  status.textContent=body.dailyGoalXp==null? 'Objetivo eliminado.' : 'Guardado.';
 }catch(e){ status.textContent='No se pudo guardar.'; }
}
loadSettings();
</script></body></html>`;
