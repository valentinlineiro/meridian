import CLIENT_JS from "./dashboard.client.js";

// A wrangler config without the Text rule for *.client.js bundles it as a module and this import is not a string:
// fail at startup (the deploy is rejected) instead of serving a page whose script is "undefined".
if (typeof CLIENT_JS !== "string") throw new Error("dashboard.client.js must be imported as text: add the wrangler rule {type:'Text', globs:['**/*.client.js'], fallthrough:false}");

export const DASHBOARD_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Meridian</title><style>
*{box-sizing:border-box}body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#0e141c;color:#e6edf3;line-height:1.4}
a{color:#7aa7e6;text-decoration:none}a:hover{text-decoration:underline}
header{position:sticky;top:0;z-index:10;background:#111d2e;border-bottom:1px solid #1e2e44;display:flex;justify-content:space-between;align-items:center;padding:14px 20px;gap:16px;flex-wrap:wrap}
.h-left h1{margin:0;font-size:18px;letter-spacing:.02em;display:flex;gap:8px;align-items:center}
.h-left small{color:#8ea0b8;font-size:12px;display:block;margin-top:2px}
.h-right{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.btn{border:0;border-radius:8px;padding:8px 14px;font-weight:600;cursor:pointer;font-size:13px}
.btn-p{background:#1f6feb;color:#fff}.btn-p:hover{background:#2a7bff}
.btn-g{background:#1e2e44;color:#c8d7ea;border:1px solid #2a3d56}.btn-g:disabled{opacity:.5;cursor:default}
main{max-width:1120px;margin:0 auto;padding:20px 16px 40px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}
@media(max-width:760px){.kpis{grid-template-columns:repeat(2,1fr)}}
.kpi{background:#142236;border:1px solid #1e2e44;border-radius:12px;padding:14px 16px}
.kpi label{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#8ea0b8}
.kpi b{font-size:26px;display:block;margin-top:4px}
.kpi small{color:#8ea0b8;font-size:12px}
.kpi-sub{grid-column:1/-1;color:#8ea0b8;font-size:12px;margin-top:-4px}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:860px){.grid2{grid-template-columns:1fr}}
.card{background:#131f33;border:1px solid #1e2e44;border-radius:12px;padding:16px}
.card h2{margin:0 0 12px;font-size:13px;letter-spacing:.05em;text-transform:uppercase;color:#8ea0b8}
.card h3{margin:0 0 8px;font-size:13px;color:#c8d7ea}
.muted{color:#8ea0b8;font-size:12px}
.row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:6px 0;border-bottom:1px solid #1e2e44}
.row:last-child{border:0}
.pill{font-size:11px;padding:2px 7px;border-radius:999px;border:1px solid #2a3d56;color:#c8d7ea;white-space:nowrap}
.pill-win{background:#12291e;border-color:#1f6b3a;color:#7ee2a0}
.pill-loss{background:#2a1616;border-color:#7a2e2e;color:#e89a9a}
.pill-draw{background:#1e2430;border-color:#3a4558;color:#b9c2d0}
.pill-warn{background:#2b2210;border-color:#7a5a1e;color:#f0c674}
.pill-selected{background:#1c2d42;border-color:#38577a;color:#9cc8ff}
.pill-scope{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:2px 6px;border-radius:999px;border:1px solid #2a3d56;color:#8ea0b8;background:#101a27}
.bar{height:8px;background:#1e2e44;border-radius:999px;overflow:hidden}
.bar>i{display:block;height:100%;border-radius:999px}
.bar-win{background:#2ea043}.bar-loss{background:#d15a5a}.bar-draw{background:#6e7a8e}
.legend{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;margin-top:8px}
.dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:4px;vertical-align:middle}
.hist{margin-top:8px}
.hist-row{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:12px}
.hist-row span:first-child{width:76px;color:#8ea0b8;text-align:right}
.hist-row .bar{flex:1}
.filters{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
.filters input,.filters select{background:#0e1a2b;color:#e6edf3;border:1px solid #2a3d56;border-radius:8px;padding:7px 9px;font-size:13px}
.filters input{width:108px}.filters select{min-width:118px}
#q{width:160px}
.tbl{width:100%;border-collapse:collapse;font-size:13px}
.tbl th{font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#8ea0b8;text-align:left;padding:8px 6px;border-bottom:1px solid #1e2e44}
.tbl td{padding:9px 6px;border-bottom:1px solid #162236}
.pager{display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:13px}
.empty{padding:28px;text-align:center;color:#8ea0b8;border:1px dashed #2a3d56;border-radius:10px;margin-top:8px}
.tabs{display:flex;gap:8px;margin-bottom:16px}
.tab-panel{display:none}
.tab-panel.active{display:block}
.hero-card{background:#142236;border:1px solid #1e2e44;border-radius:12px;padding:20px;margin-bottom:16px}
.activity-strip{display:flex;gap:8px;justify-content:space-between;margin:12px 0}
.progress-bar{height:10px;background:#1e2e44;border-radius:999px;overflow:hidden}
.progress-bar > div{height:100%;background:#2ea043;border-radius:999px}
.distribution-bar{display:flex;height:10px;border-radius:999px;overflow:hidden;background:#1e2e44}
.methodology-disclosure{border:1px solid #1e2e44;border-radius:10px;padding:12px;margin-top:24px;background:#0e1724;font-size:13px}
svg text{font-family:system-ui,sans-serif}
@media(max-width:700px){
 .tbl thead{display:none}
 .tbl tr{display:block;border:1px solid #1e2e44;border-radius:10px;margin-bottom:8px;padding:8px}
 .tbl td{display:flex;justify-content:space-between;border:0;padding:4px 0}
 .tbl td::before{content:attr(data-l) / "";color:#8ea0b8;font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-right:12px}
}
@media(max-width:480px){
 header{padding:10px 14px;gap:8px}
 .kpis{gap:8px;margin:10px 0}
 .kpi{padding:10px 12px;border-radius:10px}
 .kpi b{font-size:20px;margin-top:2px}
 .kpi label{font-size:10px}
 .card{padding:12px;border-radius:10px}
 main{padding:12px 10px 32px}
 select,input{max-width:100%}
}
</style></head><body>
<header>
  <div class="h-left"><h1>Meridian</h1><small id="syncMeta">—</small></div>
  <div class="h-right">
    <button id="syncBtn" class="btn btn-p" onclick="doSync()">Sincronizar</button>
    <small id="syncNote" class="muted" style="max-width:260px"></small>
    <a class="btn btn-g" href="/settings" style="text-decoration:none">Configuración</a>
    <form method="post" action="/logout" style="margin:0"><button class="btn btn-g" type="submit">Salir</button></form>
  </div>
</header>
<main>
<div class="tabs"><button class="btn btn-p" id="tabBtnOverview" onclick="showTab('overview')">Overview</button><button class="btn btn-g" id="tabBtnLang" onclick="showTab('languages')">Languages</button><button class="btn btn-g" id="tabBtnChess" onclick="showTab('chess')">Chess</button><button class="btn btn-g" id="tabBtnChanges" onclick="showTab('changes')">What Changed?</button><button class="btn btn-g" id="tabBtnTrajectory" onclick="showTab('trajectory')">Trayectoria</button></div>
<section id="overviewTab" class="tab-panel active">
 <div class="hero-card" id="overviewHero">
  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
   <div>
    <h2 style="margin:0;font-size:18px">Tu actividad</h2>
    <div class="muted" style="font-size:12px;margin-top:2px" id="overviewSyncMeta">Pulso unificado y verificado por dominio</div>
   </div>
   <span style="display:flex;align-items:center;gap:6px"><span id="overviewStreak" class="pill pill-win" style="font-size:13px;font-weight:700">🔥 —</span><span class="pill pill-scope">CUENTA</span></span>
  </div>
 </div>

 <h2 style="margin:18px 0 10px;font-size:14px;letter-spacing:.05em;text-transform:uppercase;color:#8ea0b8">Estado por dominio</h2>
 <div class="grid2">
  <div class="card" id="overviewLangCard">
   <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
    <h3 style="margin:0;font-size:15px;color:#e6edf3">Languages</h3>
    <button class="btn btn-g" onclick="showTab('languages')" style="font-size:12px;padding:4px 10px">Ver Idiomas →</button>
   </div>
   <div>
    <div style="display:flex;justify-content:space-between;align-items:center"><div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em">Curso seleccionado</div><span class="pill pill-scope">CURSO</span></div>
    <div id="overviewLangActiveCourse" style="font-size:18px;font-weight:700;margin-top:2px">—</div>
    <div id="overviewLangSourceCourse" class="muted" style="font-size:11px;margin-top:2px"></div>
   </div>
   <div style="margin-top:10px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:12px;margin-bottom:4px">
     <span class="muted">Progreso curricular</span>
     <span id="overviewLangUnits" style="font-weight:600">—</span>
    </div>
    <div class="progress-bar"><div id="overviewLangProgressBar" style="width:0%"></div></div>
   </div>
   <div style="margin-top:12px;padding-top:10px;border-top:1px solid #1e2e44;display:flex;justify-content:space-between;align-items:center">
    <span class="muted" style="font-size:12px">Todos los cursos <span class="pill pill-scope">CUENTA</span></span>
    <span id="overviewLangCatalogXp" class="pill" style="font-weight:700">—</span>
   </div>
  </div>

  <div class="card" id="overviewChessCard">
   <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
    <h3 style="margin:0;font-size:15px;color:#e6edf3">Chess</h3>
    <button class="btn btn-g" onclick="showTab('chess')" style="font-size:12px;padding:4px 10px">Ver Ajedrez →</button>
   </div>
   <div>
    <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em">ELO observado</div>
    <div id="overviewChessElo" style="font-size:24px;font-weight:800;line-height:1.2">—</div>
    <div id="overviewChessEloMeta" class="muted" style="font-size:11px;margin-top:2px"></div>
   </div>
   <div style="margin-top:10px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:12px;margin-bottom:4px">
     <span class="muted" id="overviewChessWrLabel">Win rate (últimas 50 partidas, todos los rivales)</span>
     <span id="overviewChessWrMeta" class="muted" style="font-size:11px">—</span>
    </div>
    <div class="distribution-bar" id="overviewChessDist">
     <i class="bar-win" style="width:0%"></i>
     <i class="bar-loss" style="width:0%"></i>
     <i class="bar-draw" style="width:0%"></i>
    </div>
   </div>
   <div style="margin-top:12px;padding-top:10px;border-top:1px solid #1e2e44;display:flex;justify-content:space-between;align-items:center">
    <span class="muted" style="font-size:12px">Histórico</span>
    <span id="overviewChessHistorical" class="muted" style="font-size:12px">—</span>
   </div>
  </div>
 </div>

 <h2 style="margin:18px 0 10px;font-size:14px;letter-spacing:.05em;text-transform:uppercase;color:#8ea0b8">Tu semana</h2>
 <div class="grid2">
  <div class="card" id="overviewLangWeekCard">
   <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
    <div>
     <h3 style="margin:0;font-size:13px;color:#c8d7ea">Cuenta · últimos 7 días <span class="pill pill-scope">CUENTA</span></h3>
     <div class="muted" style="font-size:11px;margin-top:2px">Actividad global registrada en la cuenta</div>
    </div>
    <span id="overviewLangWeekSummary" class="muted" style="font-size:11px;white-space:nowrap">—</span>
   </div>
   <div class="activity-strip" id="overviewLangWeek"></div>
  </div>
  <div class="card" id="overviewChessWeekCard">
   <div style="display:flex;justify-content:space-between;align-items:baseline">
    <h3 style="margin:0;font-size:13px;color:#c8d7ea">Ajedrez · últimos 7 días</h3>
    <span id="overviewChessWeekSummary" class="muted" style="font-size:11px">—</span>
   </div>
   <div class="activity-strip" id="overviewChessWeek"></div>
  </div>
 </div>
</section>
<section id="chessTab" class="tab-panel">
 <div class="hero-card" id="chessHero">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
   <div>
    <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em">Ajedrez · Nivel actual</div>
    <div style="display:flex;align-items:baseline;gap:8px;margin-top:2px">
     <span id="chessHeroElo" style="font-size:28px;font-weight:800;line-height:1">—</span>
     <span id="chessHeroEloSub" class="muted" style="font-size:12px">ELO</span>
    </div>
    <div id="chessHeroMeta" class="muted" style="font-size:12px;margin-top:4px">—</div>
   </div>
   <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
    <span id="chessHeroStreak" class="pill" style="font-size:12px;font-weight:600">—</span>
    <span id="chessHeroGames" class="muted" style="font-size:12px">—</span>
   </div>
  </div>
  <div style="margin-top:14px">
   <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:12px;margin-bottom:6px">
    <span id="chessHeroWrLabel" style="font-weight:600">Win rate (últimas 50 partidas, todos los rivales)</span>
    <span id="chessHeroDistMeta" class="muted" style="font-size:11px">—</span>
   </div>
   <div class="distribution-bar" id="chessHeroDist">
    <i class="bar-win" style="width:0%"></i>
    <i class="bar-loss" style="width:0%"></i>
    <i class="bar-draw" style="width:0%"></i>
   </div>
  </div>
 </div>
  <section class="kpis" id="kpis"></section>
 <div class="card" id="formCard" style="margin-top:12px"><h2>Forma actual</h2>
  <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:10px"><span class="muted">Últimas</span>
   <button class="btn" id="b20" onclick="setRecent(20)">20</button><button class="btn" id="b50" onclick="setRecent(50)">50</button><button class="btn" id="b100" onclick="setRecent(100)">100</button>
   <span class="muted" id="formMeta" style="margin-left:6px"></span></div>
  <div id="form"></div>
  <div class="muted" id="streak" style="margin-top:10px"></div></div>

 <h2 style="margin:18px 0 10px;font-size:14px;letter-spacing:.05em;text-transform:uppercase;color:#8ea0b8">Comparativa por color y oponente</h2>
 <div class="grid2">
  <div class="card" id="colCard"><h2>Rendimiento por color</h2><div id="colDiff" class="muted" style="margin-bottom:8px"></div><div id="col"></div></div>
  <div class="card" id="oppCard"><h2>Oponentes por familia</h2><div class="muted" style="font-size:11px;margin-bottom:6px">Las diferencias por familia de oponente no aíslan la dificultad del rival.</div><div id="oppMacro" class="muted" style="margin-bottom:8px"></div><div id="opp"></div></div>
 </div>

 <h2 style="margin:18px 0 10px;font-size:14px;letter-spacing:.05em;text-transform:uppercase;color:#8ea0b8">Repertorio de aperturas &amp; fases</h2>
 <div class="grid2">
  <div class="card" id="openingsCard"><h2>Repertorio de aperturas</h2><div id="openingsTabs" style="display:flex;gap:6px;margin-bottom:12px"><button class="btn btn-p" id="tabBtnBlancas" onclick="showOpeningTab('white')">Blancas</button><button class="btn btn-g" id="tabBtnNegras" onclick="showOpeningTab('black')">Negras</button></div><div id="openingsWhite"></div><div id="openingsBlack" style="display:none"></div><div class="muted" id="openingsPop" style="margin-top:8px"></div></div>
  <div class="card" id="phasesCard"><h2>Fases de partida</h2><div id="phasesBody"></div><div class="muted" id="phasesMeta" style="margin-top:8px"></div></div>
 </div>

 <h2 style="margin:18px 0 10px;font-size:14px;letter-spacing:.05em;text-transform:uppercase;color:#8ea0b8">Evolución & detalle</h2>
 <div class="grid2">
  <div class="card" id="evoCard"><h2>Evolución · ELO</h2><div class="muted" style="font-size:11px">ELO observado en sincronizaciones</div><div id="evo"></div><div class="muted" id="evoNote" style="margin-top:6px"></div></div>
  <div class="card" id="resCard"><h2>Resultados</h2><div id="res"></div><div class="muted" id="lossContext" style="margin-top:8px"></div><div class="muted" id="drawContext" style="margin-top:4px"></div></div>
 </div>
 <details id="eloDetails" class="card" style="margin-top:12px">
  <summary style="cursor:pointer;font-weight:600;font-size:13px;letter-spacing:.05em;text-transform:uppercase;color:#8ea0b8">ELO del rival <span id="eloSummaryMeta" class="muted" style="font-weight:400;text-transform:none"></span></summary>
  <div style="margin-top:12px" id="eloCard"><div id="elo"></div><div class="muted" id="eloNote" style="margin-top:6px"></div></div>
 </details>

 <div class="card" style="margin-top:14px" id="allMatchesCard">
  <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px"><h2>Partidas</h2><span class="muted" style="font-size:12px" id="chessMatchesSubtitle">Partidas recientes</span></div>
  <div class="filters" id="matchChips">
   <button class="btn btn-p" data-chip="type:" onclick="setChip('type','')">Todos</button><button class="btn btn-g" data-chip="type:bot" onclick="setChip('type','bot')">Bots</button><button class="btn btn-g" data-chip="type:pvp" onclick="setChip('type','pvp')">PvP</button>
   <button class="btn btn-p" data-chip="result:" onclick="setChip('result','')">Todos</button><button class="btn btn-g" data-chip="result:win" onclick="setChip('result','win')">Victorias</button><button class="btn btn-g" data-chip="result:loss" onclick="setChip('result','loss')">Derrotas</button><button class="btn btn-g" data-chip="result:draw" onclick="setChip('result','draw')">Tablas</button>
   <button class="btn btn-p" data-chip="color:" onclick="setChip('color','')">Todos</button><button class="btn btn-g" data-chip="color:white" onclick="setChip('color','white')">Blancas</button><button class="btn btn-g" data-chip="color:black" onclick="setChip('color','black')">Negras</button>
  </div>
  <div class="filters" id="matchFilters" style="display:none">
   <input id="q" placeholder="Buscar rival" oninput="onSearch()">
   <select id="fOpp" onchange="loadM(0)"><option value="">Rival: Todos</option><option value="bot">Bots: Todos</option><option value="seg:noisy_neural">Noisy Neural</option><option value="seg:neural">Neural</option><option value="seg:blended">Blended</option><option value="seg:stockfish">Stockfish</option><option value="seg:pvp">PvP</option></select>
   <input id="fMin" placeholder="ELO mín" inputmode="numeric" size="6"><input id="fMax" placeholder="ELO máx" inputmode="numeric" size="6">
   <select id="fEnd" onchange="loadM(0)"><option value="">Fin: Todos</option><option value="checkmate">Mate</option><option value="disconnection">Desconexión</option><option value="stalemate">Ahogado</option><option value="repetition">Repetición</option><option value="resignation">Rendición</option></select>
   <select id="fPhase" onchange="loadM(0)"><option value="">Fase: Todas</option><option value="opening">Apertura</option><option value="middlegame">Medio juego</option><option value="endgame">Final</option></select>
   <select id="fOpening" onchange="loadM(0)"><option value="">Apertura: Todas</option></select>
   <button class="btn btn-p" onclick="loadM(0)">Filtrar</button>
   <button class="btn btn-g" onclick="clearF()">Limpiar</button>
  </div>
  <table class="tbl"><thead><tr><th>Fecha</th><th>Rival</th><th>Tipo</th><th>ELO</th><th>Color</th><th>Resultado</th><th>Fin</th><th>Rev.</th></tr></thead><tbody id="mb"></tbody></table>
  <div id="empty" class="empty" style="display:none"></div>
  <div class="pager" id="matchPager" style="display:none"><button class="btn btn-g" id="prev" onclick="prevPage()">‹ Anterior</button><span class="muted" id="mc"></span><button class="btn btn-g" id="next" onclick="nextPage()">Siguiente ›</button></div>
  <button class="btn btn-g" id="btnAllMatches" onclick="showAllMatches()" style="margin-top:10px">Ver todas las partidas</button>
 </div>

 <details class="methodology-disclosure" id="chessMethodology" style="margin-top:16px;margin-bottom:16px">
  <summary style="cursor:pointer;font-weight:600;font-size:13px;color:#8ea0b8">¿Cómo sabemos esto? <span class="muted" style="font-weight:400">· Integridad epistemológica y taxonomía canónica</span></summary>
  <div style="margin-top:10px;font-size:12px;line-height:1.5;color:#8ea0b8">
   <p style="margin:6px 0"><b>1. Modelo Result/Outcome hermético:</b> Cada partida clasifica su resultado en la tríada canónica (victoria, derrota o tablas) reconciliando <code>result</code> y <code>outcome</code> reportados por Duolingo. La causa de fin se asigna con taxonomía canónica exhaustiva (checkmate, resignation, timeout, stalemate, repetition, insufficient material, fifty moves) sin estados ambiguos ni inventados.</p>
   <p style="margin:6px 0"><b>2. Segmentación de oponentes (Bot vs PvP):</b> Los rivales se clasifican deterministamente según su identificador y tipología (bots por motor: Noisy Neural, Neural, Blended, Stockfish vs jugadores humanos en PvP). Cuando una muestra es pequeña (ej. PvP o muestras n &lt; 50), se reporta explícitamente el tamaño muestral evitando inferencias apresuradas.</p>
   <p style="margin:6px 0"><b>3. Observación de ELO y marcas temporales:</b> El ELO registrado corresponde a observaciones de sincronización contra el perfil de la fuente. Las fechas reflejan la marca canónica <code>played_at</code> (o primera observación en <code>first_seen_at</code>).</p>
  </div>
 </details>
</section>

   <section id="langTab" class="tab-panel">
    <div id="langEmpty" class="empty" style="display:none">Sin datos de Languages — sincroniza con la extensión.</div>
    <div id="langContent" style="display:none">
     <!-- Nivel 1: Vista Global -->
     <div id="langGlobalView">
      <div class="card hero-card" id="langCourseHero" style="margin-bottom:12px">
        <div id="langHeroCard">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
            <div>
              <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em">Curso seleccionado</div>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span id="langCourseFlag" style="font-size:18px"></span>
                <select id="langCourseSelect" onchange="selectCourse(this.value)" style="background:#0d1b2a;color:#c8d7ea;border:1px solid #1e2e44;border-radius:6px;padding:4px 8px;font-size:16px;font-weight:700"></select>
              </div>
              <div id="langActiveHeroMeta" class="muted" style="font-size:12px;margin-top:2px">—</div>
            </div>
            <span class="pill pill-scope">CURSO</span>
          </div>
          <div style="margin-top:14px">
            <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:12px;margin-bottom:4px">
              <span class="muted">Progreso curricular</span>
              <span id="langActiveProgress" style="font-weight:600">—</span>
            </div>
            <div class="progress-bar"><div id="langActiveProgressBar" style="width:0%"></div></div>
          </div>
        </div>
      </div>

      <div class="card" id="langAccountCard" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div>
            <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em">Estado de la cuenta</div>
          </div>
          <span class="pill pill-scope">CUENTA</span>
        </div>
        <div class="kpis" style="margin:14px 0 0">
          <div class="kpi"><label>Total XP</label><b id="langAccountXp">—</b></div>
          <div class="kpi"><label>Racha</label><b id="langAccountStreak">—</b></div>
          <div class="kpi"><label>Días con Actividad</label><b id="langAccountDays">—</b></div>
          <div class="kpi"><label>Catálogo</label><b id="langAccountCourses">—</b></div>
        </div>
        <div class="muted" id="langSyncMeta" style="font-size:12px;margin-top:10px"></div>
      </div>

      <!-- Tira semanal (Estado 10s) -->
      <div class="card" id="langWeekCard" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div>
            <div style="display:flex;align-items:center;gap:8px">
              <h2 style="margin:0;font-size:13px;letter-spacing:.05em;text-transform:uppercase;color:#8ea0b8">Actividad de cuenta · últimos 7 días</h2>
              <span class="pill pill-scope">CUENTA</span>
            </div>
            <div class="muted" style="font-size:11px;margin-top:2px">Incluye actividad de todos los cursos y actividades registradas en la fuente.</div>
          </div>
          <span id="langWeekSummary" class="muted" style="font-size:11px;white-space:nowrap">—</span>
        </div>
        <div class="activity-strip" id="langActivityStrip" style="margin-top:10px"></div>
        <div id="langGoalRow" style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:10px;font-size:12px">
          <span id="langGoalToday" class="muted"></span>
          <a href="/settings">Configurar</a>
        </div>
      </div>

      <!-- Tus Cursos (Comprensión 1m) -->
      <div class="card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h2 style="margin:0;font-size:13px;letter-spacing:.05em;text-transform:uppercase;color:#8ea0b8">Tus Cursos</h2>
          <span id="langCoursesCount" class="muted" style="font-size:12px"></span>
        </div>
        <div id="langCoursesList"></div>
      </div>

      <!-- Cambios Observados (Longitudinal #16.9) -->
      <div class="card" id="langObservedChangesCard" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <h2 style="margin:0;font-size:13px;letter-spacing:.05em;text-transform:uppercase;color:#8ea0b8">Cambios observados</h2>
        </div>
        <div id="langObservedChangesBody">
          <div id="langObservedSynthesis" style="font-weight:700;font-size:14px;color:#c8d7ea">—</div>
          <div id="langObservedDetail" class="muted" style="font-size:12px;margin-top:4px">No se detectaron reestructuraciones de árbol curricular en las sincronizaciones observadas.</div>
        </div>
      </div>

      <div class="card" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <h2 style="margin:0">Actividad de cuenta — últimos 90 días</h2>
          <span class="pill pill-scope">CUENTA</span>
        </div>
        <div id="langXpTimeline" style="height:60px;display:flex;align-items:flex-end;gap:2px;padding:8px 0"></div>
        <div class="muted" id="langXpSummary" style="font-size:12px;margin-top:8px"></div>
      </div>

      <!-- Bloques A y B: Intensidad y Perfil Semanal -->
      <div class="grid2" style="margin-bottom:12px">
        <div class="card" id="langIntensityCard">
          <h2>Intensidad descriptiva · cuenta</h2>
          <div id="langIntensityBody"></div>
        </div>
        <div class="card" id="langWeeklyCard">
          <h2>Perfil por día de la semana · cuenta</h2>
          <div id="langWeeklyBody"></div>
        </div>
      </div>

      <!-- Bloque D: Concentración Histórica de Cursos -->
      <div class="card" id="langConcentrationCard" style="margin-bottom:12px">
        <h2>Concentración histórica · catálogo</h2>
        <div id="langConcentrationBody"></div>
      </div>

      <!-- Bloque E: Comparabilidad Curricular Longitudinal -->
      <div class="card" id="langComparabilityCard" style="margin-bottom:12px">
        <h2>Comparabilidad curricular longitudinal · cursos</h2>
        <div id="langComparabilityBody"></div>
      </div>

      <!-- ¿Cómo sabemos esto? (MethodologyDisclosure) -->
      <details class="methodology-disclosure" id="langMethodology" style="margin-top:16px;margin-bottom:16px">
        <summary style="cursor:pointer;font-weight:600;font-size:13px;color:#8ea0b8">¿Cómo sabemos esto? <span class="muted" style="font-weight:400">· Marco metodológico e integridad de datos</span></summary>
        <div style="margin-top:10px;font-size:12px;line-height:1.5;color:#8ea0b8">
          <p style="margin:6px 0"><b>1. Fuente canónica:</b> Registros inmutables en Cloudflare D1 capturados vía snapshots periódicos de la fuente (actividad de cuenta y progreso curricular).</p>
          <p style="margin:6px 0"><b>2. Regla de comparabilidad curricular:</b> Se exige estrictamente <code>ΔtotalUnits = 0</code> (mismo denominador de unidades totales) entre dos observaciones temporales para computar un avance real. Si Duolingo reorganiza las secciones o añade unidades al árbol, la observación se clasifica como <i>cambio estructural</i> en lugar de progreso sintético.</p>
          <p style="margin:6px 0"><b>3. Aislamiento de métricas de actividad:</b> Las series temporales de XP proceden de <code>xp_summaries</code> a nivel de cuenta. No se realiza atribución heurística de XP a cursos individuales para preservar la exactitud epistemológica.</p>
        </div>
      </details>
     </div>

     <!-- Nivel 2: Detalle de Curso -->
     <div id="langDetailView" style="display:none">
      <div style="margin-bottom:12px">
        <button class="btn btn-g" id="btnBackToLanguages" onclick="showLanguagesGlobal()">← Volver a todos los cursos</button>
      </div>
      <div class="card" id="langCourseDetailCard" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:gap:8px">
          <div>
            <h1 id="langDetailTitle" style="margin:0;font-size:22px"></h1>
            <div class="muted" id="langDetailSub" style="font-size:12px;margin-top:2px"></div>
          </div>
          <span id="langDetailXpPill" class="pill" style="font-size:14px;font-weight:700"></span>
        </div>
      </div>
      <div class="card" id="langCefrCard" style="margin-bottom:12px">
        <h2>Desglose por nivel CEFR</h2>
        <div id="langCefrBody"></div>
      </div>
      <div class="card">
        <h2>Estructura curricular (secciones)</h2>
        <div id="langSectionsList"></div>
      </div>
     </div>
    </div>
   </section>
   <section id="changesTab" class="tab-panel" hidden>
    <div id="changesHeader" style="margin-bottom:16px"></div>
    <div id="changesEmpty" class="empty" style="display:none"></div>
    <div id="changesFindings" style="margin-bottom:16px"></div>
    <div id="changesActivity"></div>
   </section>
   <section id="trajectoryTab" class="tab-panel" hidden>
    <div id="trajectoryHeader" style="margin-bottom:16px">
     <h2 style="margin:0 0 4px 0">Tu trayectoria</h2>
     <p class="muted" style="margin:0" id="trajectorySubtitle">Síntesis de patrones estables a lo largo de tu historial completo</p>
    </div>
    <div id="trajectoryEmpty" class="empty" style="display:none">No hay patrones longitudinales suficientemente estables registrados en tu historial.</div>
    <div id="trajectoryFindings"></div>
   </section>

  <p class="muted" style="margin-top:16px"><a href="/raw">Datos técnicos</a></p>
</main>
<script>${CLIENT_JS}</script></body></html>`;

export const RAW_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Raw · Meridian</title><style>body{font-family:monospace;background:#0e141c;color:#e6edf3;padding:24px}pre{background:#131f33;padding:12px;border-radius:8px;overflow:auto;border:1px solid #1e2e44}a{color:#7aa7e6}</style></head><body>
<p><a href="/">← Volver al dashboard</a></p><h1>Raw snapshots · debug</h1><div id="l"></div><pre id="d">selecciona un snapshot…</pre><script>
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
async function init(){const d=await (await fetch('/api/snapshots')).json();
document.querySelector('#l').innerHTML=d.snapshots.map(s=>{const countLabel=s.games_count!=null?(s.games_count+' games'):(s.source==='duolingo-lang'?'languages':s.source); return '<div><button onclick="show('+esc(JSON.stringify(s.id))+')" style="background:#1e2e44;color:#e6edf3;border:1px solid #2a3d56;border-radius:6px;padding:4px 8px;cursor:pointer;margin:2px">'+esc(s.created_at.slice(0,19))+' · '+esc(countLabel)+' · '+esc(s.checksum.slice(0,12))+'</button> '+esc(s.source)+'</div>';}).join('');}
async function show(id){const d=await (await fetch('/api/snapshots/'+encodeURIComponent(id)+'?raw=1')).json();document.querySelector('#d').textContent=JSON.stringify(JSON.parse(d.raw_json),null,1).slice(0,20000);}
init();</script></body></html>`;
