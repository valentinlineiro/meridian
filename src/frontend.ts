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
<script>
const q=s=>document.querySelector(s);
function parseCanonicalRoute(pathOrHash, hashOrSearch, searchQuery){
 let pathname = '', hash = '', search = '';
 if(searchQuery !== undefined){
  pathname = (pathOrHash || '').trim();
  hash = (hashOrSearch || '').trim();
  search = (searchQuery || '').trim();
 } else if(hashOrSearch !== undefined){
  const first = (pathOrHash || '').trim();
  const second = (hashOrSearch || '').trim();
  if(first.startsWith('#')){ hash = first; search = second; }
  else { pathname = first; if(second.startsWith('#')) hash = second; else search = second; }
 } else {
  const raw = (pathOrHash || '').trim();
  if(raw.startsWith('#')) hash = raw; else pathname = raw;
 }
 const sp = new URLSearchParams(search && search.startsWith('?') ? search.slice(1) : search || '');
 const leg = sp.get('course');
 const hasLegacyQuery = Boolean(leg);

 let target = '';
 if(hash && hash !== '#' && hash !== '#/' && hash !== '#overview') target = hash;
 else if(pathname && pathname !== '/' && pathname !== '/index.html') target = pathname;
 else if(hash) target = hash;

 let ch = target.trim();
 if(ch.startsWith('/')) ch = ch.slice(1);
 if(ch.startsWith('#')) ch = ch.slice(1);
 if(ch.startsWith('/')) ch = ch.slice(1);
 const parts = ch.split('/');
 const seg = parts[0] || '';
 const sub = parts.slice(1).join('/').trim() || null;

 if(!ch || seg === 'overview') return { tab: 'overview', courseId: null, canonicalPath: '/overview', canonicalHash: '#/overview', hasLegacyQuery };
 if(seg === 'chess') return { tab: 'chess', courseId: null, canonicalPath: '/chess', canonicalHash: '#/chess', hasLegacyQuery };
 if(seg === 'changes') return { tab: 'changes', courseId: null, canonicalPath: '/changes', canonicalHash: '#/changes', hasLegacyQuery };
 if(seg === 'trajectory') return { tab: 'trajectory', courseId: null, canonicalPath: '/trajectory', canonicalHash: '#/trajectory', hasLegacyQuery };
 if(seg === 'languages'){
  const cid = sub || leg || null;
  return { tab: 'languages', courseId: cid, canonicalPath: cid ? '/languages/' + encodeURIComponent(cid) : '/languages', canonicalHash: cid ? '#/languages/' + encodeURIComponent(cid) : '#/languages', hasLegacyQuery };
 }
 if(seg.startsWith('DUOLINGO_')){
  return { tab: 'languages', courseId: seg, canonicalPath: '/languages/' + encodeURIComponent(seg), canonicalHash: '#/languages/' + encodeURIComponent(seg), hasLegacyQuery };
 }
 return { tab: 'overview', courseId: null, canonicalPath: '/overview', canonicalHash: '#/overview', hasLegacyQuery };
}
let selectedCourseId=null, lastLangsData=null, lastAnalyticsData=null, lastLangXpData=null, lastActiveDetail=null, activeChangesInterval=null;
function showTab(name){
 const tab=(name==='languages'||name==='chess')?name:'overview';
 const activeTab=(name==='changes'||name==='trajectory')?name:tab;
 const route=parseCanonicalRoute(location.pathname, location.hash, location.search);
 const courseId=route.tab==='languages'?route.courseId:null;
 const targetPath = (activeTab==='languages' && (courseId || selectedCourseId))
  ? '/languages/' + encodeURIComponent(courseId || selectedCourseId)
  : (activeTab==='overview' ? '/overview' : '/' + activeTab);
 history.replaceState(null, '', targetPath);
 q('#overviewTab').classList.toggle('active', activeTab==='overview');
 q('#langTab').classList.toggle('active', activeTab==='languages');
 q('#chessTab').classList.toggle('active', activeTab==='chess');
 if(q('#changesTab')) q('#changesTab').classList.toggle('active', activeTab==='changes');
 if(q('#trajectoryTab')) q('#trajectoryTab').classList.toggle('active', activeTab==='trajectory');
 // native hidden attribute in addition to the CSS class: the inactive panel must be
 // unambiguously excluded from the accessibility tree, not just visually display:none.
 q('#overviewTab').hidden = tab!=='overview' || activeTab==='changes' || activeTab==='trajectory';
 q('#langTab').hidden = tab!=='languages';
 q('#chessTab').hidden = tab!=='chess';
 if(q('#changesTab')) q('#changesTab').hidden = activeTab!=='changes';
 if(q('#trajectoryTab')) q('#trajectoryTab').hidden = activeTab!=='trajectory';
 q('#tabBtnOverview').className='btn '+(activeTab==='overview'?'btn-p':'btn-g');
 q('#tabBtnLang').className='btn '+(activeTab==='languages'?'btn-p':'btn-g');
 q('#tabBtnChess').className='btn '+(activeTab==='chess'?'btn-p':'btn-g');
 if(q('#tabBtnChanges')) q('#tabBtnChanges').className='btn '+(activeTab==='changes'?'btn-p':'btn-g');
 if(q('#tabBtnTrajectory')) q('#tabBtnTrajectory').className='btn '+(activeTab==='trajectory'?'btn-p':'btn-g');
 if(activeTab==='changes') fetchWhatChanged();
 if(activeTab==='trajectory') fetchTrajectory();
}
function initTab(){
 const route = parseCanonicalRoute(location.pathname, location.hash, location.search);
 if(route.hasLegacyQuery || location.hash || (location.pathname !== '/' && location.pathname !== route.canonicalPath)){
  const url = new URL(location.href);
  url.searchParams.delete('course');
  url.hash = '';
  const targetPath = (route.tab === 'overview' && location.pathname === '/') ? '/' : route.canonicalPath;
  history.replaceState(null, '', targetPath + (url.search ? url.search : ''));
 }
 showTab(route.tab);
 if(route.tab === 'languages' && route.courseId && route.courseId !== selectedCourseId){
  if(typeof lastLangsData !== 'undefined' && lastLangsData && lastLangsData.courses){
   selectCourse(route.courseId, true);
  } else {
   selectedCourseId = route.courseId;
  }
 }
}
initTab();
// same-tab navigation (back/forward, bookmarked deep links without a full reload)
window.addEventListener('popstate', initTab);
window.addEventListener('hashchange', initTab);
function heroCard(opts){
 let pH='';
 if(opts.progress){
  const c=Number(opts.progress.current)||0, t=Number(opts.progress.total)||0;
  const l=opts.progress.label||'Progreso', u=opts.progress.unit||'unidades';
  const p=t>0?Math.min(100,Math.max(0,(c/t)*100)).toFixed(1):'0';
  pH='<div style="margin-top:12px"><div style="display:flex;justify-content:space-between;align-items:baseline;font-size:12px;margin-bottom:4px"><span class="muted">'+l+'</span><span style="font-weight:600">'+c+' / '+t+' '+u+' ('+p+'%)</span></div><div class="progress-bar"><div style="width:'+p+'%"></div></div></div>';
 }
 return '<div class="hero-card"'+(opts.id?' id="'+opts.id+'"':'')+'>'
  +'<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px"><div>'
  +(opts.title?'<div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em">'+opts.title+'</div>':'')
  +(opts.primary?'<div style="font-size:24px;font-weight:800;margin-top:2px;line-height:1.2">'+opts.primary+'</div>':'')
  +(opts.secondary?'<div class="muted" style="font-size:13px;margin-top:4px">'+opts.secondary+'</div>':'')
  +'</div>'+(opts.badge?'<div>'+opts.badge+'</div>':'')+'</div>'
  +pH+(opts.meta?'<div style="margin-top:14px;padding-top:12px;border-top:1px solid #1e2e44;font-size:12px;color:#8ea0b8">'+opts.meta+'</div>':'')+'</div>';
}
function progressBar(opts){
 const c=Number(opts.current)||0, t=Number(opts.total)||0;
 const u=opts.unit||'unidades', sp=opts.showPercent!==false;
 const p=t>0?Math.min(100,Math.max(0,(c/t)*100)).toFixed(1):'0';
 return '<div style="margin-top:6px">'
  +(opts.label?'<div style="display:flex;justify-content:space-between;align-items:baseline;font-size:12px;margin-bottom:4px"><span class="muted">'+opts.label+'</span><span style="font-weight:600">'+c+' / '+t+' '+u+(sp?' ('+p+'%)':'')+'</span></div>':'')
  +'<div class="progress-bar"><div style="width:'+p+'%"></div></div></div>';
}
function getCourseProgress(detail){
 let completed=0, total=0;
 if(detail&&detail.sections){
  for(const s of detail.sections){
   completed+=(s.completedUnits||0);
   total+=(s.totalUnits||0);
  }
 } else if(detail&&detail.totalUnits!=null){
  completed=detail.completedUnits||0;
  total=detail.totalUnits||0;
 }
 return {completed,total};
}
function relDate(iso){
 if(!iso) return '—';
 const days=Math.floor((Date.now()-new Date(iso).getTime())/864e5);
 return days<=0?'hoy':days===1?'ayer':'hace '+days+'d';
}
function distributionBar(opts){
 const w=Number(opts.wins)||0, l=Number(opts.losses)||0, d=Number(opts.draws)||0, t=w+l+d;
 const wP=t>0?(w/t*100).toFixed(1):'0', lP=t>0?(l/t*100).toFixed(1):'0', dP=t>0?Math.max(0,100-parseFloat(wP)-parseFloat(lP)).toFixed(1):'0';
 return '<div style="margin-top:6px">'
  +((opts.label||opts.meta)?'<div style="display:flex;justify-content:space-between;align-items:baseline;font-size:12px;margin-bottom:4px">'+(opts.label?'<span class="muted">'+opts.label+'</span>':'<span></span>')+(opts.meta?'<span class="muted" style="font-size:11px">'+opts.meta+'</span>':'<span></span>')+'</div>':'')
  +'<div class="distribution-bar" title="'+w+'W · '+l+'L · '+d+'D ('+t+' partidas)"><i class="bar-win" style="width:'+wP+'%" title="Victorias: '+w+'"></i><i class="bar-loss" style="width:'+lP+'%" title="Derrotas: '+l+'"></i><i class="bar-draw" style="width:'+dP+'%" title="Tablas: '+d+'"></i></div></div>';
}
function activityStrip(opts){
 const days=opts.days||[];
 const dots=days.map(d=>{
  const bg=d.active?(d.color||'#2ea043'):'#1e2e44';
  return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px" title="'+(d.tooltip||d.date||'')+'"><span class="muted" style="font-size:11px">'+(d.dayLetter||'')+'</span><div style="width:20px;height:20px;border-radius:50%;background:'+bg+';display:flex;align-items:center;justify-content:center"></div><span class="muted" style="font-size:10px">'+(d.bottomLabel||'—')+'</span></div>';
 }).join('');
 return '<div class="card"'+(opts.id?' id="'+opts.id+'"':'')+'><div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px"><h3 style="margin:0;font-size:13px;color:#c8d7ea">'+(opts.label||'')+'</h3>'+(opts.summary?'<span class="muted" style="font-size:11px">'+opts.summary+'</span>':'')+'</div><div class="activity-strip">'+dots+'</div></div>';
}
function methodologyDisclosure(opts){
 const items=(opts.items||[]).map(it=>'<p style="margin:6px 0"><b>'+it.term+':</b> '+it.desc+'</p>').join('');
 const links=(opts.links||[]).map(l=>'<a href="'+l.href+'"'+(l.target?' target="'+l.target+'"':'')+' class="pill" style="margin-right:6px">'+l.text+'</a>').join('');
 return '<details class="methodology-disclosure"'+(opts.id?' id="'+opts.id+'"':'')+' style="margin-top:16px;margin-bottom:16px"><summary style="cursor:pointer;font-weight:600;font-size:13px;color:#8ea0b8">'+(opts.title||'¿Cómo sabemos esto?')+'</summary><div style="margin-top:10px;font-size:12px;line-height:1.5;color:#8ea0b8">'+items+(links?'<div style="margin-top:10px">'+links+'</div>':'')+'</div></details>';
}
let off=0, lastRows=[], lastTotal=0;
const _fetch=window.fetch.bind(window);
window.fetch=async(...a)=>{const r=await _fetch(...a); if(r.status===401) location.href='/login?next='+encodeURIComponent(location.pathname+location.search); return r;};
const j=async u=>(await fetch(u)).json();
const SYNC_KEY='meridian.syncRun';
const syncStore={
 get(){ try{ return Number(localStorage.getItem(SYNC_KEY))||null; }catch(e){ return null; } },
 set(id){ try{ localStorage.setItem(SYNC_KEY,String(id)); }catch(e){} },
 clear(){ try{ localStorage.removeItem(SYNC_KEY); }catch(e){} }
};
function syncUi(label,busy,note){
 const b=q('#syncBtn'), n=q('#syncNote');
 if(b){ b.textContent=label; b.disabled=busy; }
 if(n) n.textContent=note||'';
}
function syncIdle(label,note,after){
 syncUi(label,false,note);
 if(after) setTimeout(()=>syncUi('Sincronizar',false,''),after);
}
async function trackSync(runId){
 const t0=Date.now();
 for(;;){
  let s;
  try{
   const r=await fetch('/api/me/sync/status?runId='+runId);
   if(!r.ok) throw new Error('status '+r.status);
   s=await r.json();
  }catch(e){ syncStore.clear(); return syncIdle('Sincronizar','No se pudo consultar el estado de la sincronización.'); }
  if(s.status==='completed'){
   syncStore.clear();
   if(s.conclusion!=='success') return syncIdle('Sincronizar','Sincronización fallida. Inténtalo de nuevo.');
   // A full reload is the one refresh known to show the new matches (partial reloads left the list stale).
   syncIdle('✓ Sincronizado','Sincronización completada.');
   setTimeout(()=>location.reload(),800);
   return;
  }
  const waiting=s.status!=='in_progress';
  const slow=Date.now()-t0>60000;
  syncUi(waiting?'En cola…':'Sincronizando…',true,
   waiting?'La sincronización está en cola.':slow?'Sigue en marcha. Puedes salir de esta página; la sincronización continuará.':'El collector está en marcha. Puede tardar unos minutos.');
  await new Promise(r=>setTimeout(r,slow?10000:3000));
 }
}
async function doSync(){
 syncUi('Iniciando…',true,'');
 let res, body;
 try{ res=await fetch('/api/me/sync',{method:'POST'}); body=await res.json().catch(()=>({})); }
 catch(e){ return syncIdle('Sincronizar','No se pudo iniciar la sincronización.'); }
 if(!(res.ok||res.status===409) || !body.runId) return syncIdle('Sincronizar','Sincronización fallida. Inténtalo de nuevo.');
 syncStore.set(body.runId); // 409: a run is already going, follow that one
 return trackSync(body.runId);
}
function resumeSync(){
 const id=syncStore.get();
 if(!id) return;
 syncUi('Sincronizando…',true,'');
 trackSync(id);
}
// updatedAt = a snapshot was applied; XP/streak may not have been in it. Say so instead of implying they are current.
function accountStaleNote(l){
 const obs=[l.totalXpObservedAt,l.streakObservedAt].filter(Boolean).sort()[0];
 if(!obs) return ' · XP y racha: sin observar';
 const day=iso=>String(iso).slice(0,10);
 return l.updatedAt && day(obs)!==day(l.updatedAt) ? ' · XP y racha observados el '+day(obs) : '';
}
const fmt=n=>n==null?'—':String(n);
const pct=(a,b)=>b? (a/b*100).toFixed(1)+'%':'—';

function kpi(label,val,sub){return '<div class="kpi"><label>'+label+'</label><b>'+val+'</b><small>'+(sub||'')+'</small></div>'}

function donut(w,l,d){
 const total=w+l+d||1;
 const segs=[
  {v:w,c:'#2ea043',k:'Victorias'},
  {v:l,c:'#d15a5a',k:'Derrotas'},
  {v:d,c:'#6e7a8e',k:'Tablas'},
 ];
 let acc=0;
 let circles=segs.map(s=>{
  const dash=(s.v/total*100).toFixed(2);
  const off2=(100-acc).toFixed(2);
  acc+=parseFloat(dash);
  return '<circle r="16" cx="36" cy="36" fill="transparent" stroke="'+s.c+'" stroke-width="8" stroke-dasharray="'+dash+' '+(100-parseFloat(dash))+'" stroke-dashoffset="'+off2+'" transform="rotate(-90 36 36)"/>';
 }).join('');
 const legend=segs.map(s=>'<span><i class="dot" style="background:'+s.c+'"></i>'+s.k+' '+s.v+' · '+(s.v/total*100).toFixed(1)+'%</span>').join('');
 const score=((w+0.5*d)/total*100).toFixed(1);
 return '<div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap"><svg width="96" height="96" viewBox="0 0 72 72"><circle r="16" cx="36" cy="36" fill="transparent" stroke="#1e2e44" stroke-width="8"/>'+circles+'</svg><div><div style="font-size:24px;font-weight:800">'+score+'% <span class="muted" style="font-weight:400;font-size:13px">score</span></div><div class="legend">'+legend+'</div></div></div>';
}

function sparkline(points){
 if(!points.length) return '<div class="muted">Sin datos</div>';
 if(points.length===1){
  const d=new Date(points[0].date+'T12:00:00');
  const label=d.toLocaleDateString('es-ES',{day:'numeric',month:'short',year:'numeric'});
  return '<div style="min-height:96px;display:flex;flex-direction:column;justify-content:center"><div style="font-size:32px;font-weight:800;line-height:1">'+points[0].elo+'</div><div class="muted" style="margin-top:4px">Primer snapshot · '+label+'</div><div class="muted" style="margin-top:8px;font-style:italic">La evolución aparecerá cuando haya más días de datos.</div></div>';
 }
 const W=520,H=90,pad=10;
 const xs=points.map((_,i)=> pad + i/(points.length-1||1)*(W-pad*2));
 const elos=points.map(p=>p.elo);
 const min=Math.min(...elos),max=Math.max(...elos);
 const span=Math.max(5,max-min);
 const y=v=> H-pad - (v-min)/span*(H-pad*14);
 const d=points.map((p,i)=> (i?'L':'M')+xs[i].toFixed(1)+' '+y(p.elo).toFixed(1)).join(' ');
 const area=d+' L'+xs[xs.length-1].toFixed(1)+' '+(H-pad)+' L'+xs[0].toFixed(1)+' '+(H-pad)+' Z';
 const ticks='<text x="'+pad+'" y="12" fill="#8ea0b8" font-size="10">'+max+'</text><text x="'+pad+'" y="'+(H-2)+'" fill="#8ea0b8" font-size="10">'+min+'</text>';
 return '<svg viewBox="0 0 '+W+' '+H+'" width="100%" height="96" style="display:block"><path d="'+area+'" fill="#1f6feb18" stroke="none"/><path d="'+d+'" fill="none" stroke="#58a6ff" stroke-width="1.8" stroke-linejoin="round"/>'+ticks+'</svg><div class="muted" style="display:flex;justify-content:space-between"><span>'+points[0].date+'</span><span>'+points[points.length-1].date+'</span></div>';
}

function histBuckets(buckets,count){
 const max=Math.max(1,...Object.values(buckets));
 return Object.entries(buckets).map(([k,v])=>'<div class="hist-row"><span>'+k+'</span><div class="bar"><i style="width:'+(v/max*100).toFixed(1)+'%;background:#58a6ff"></i></div><span style="width:36px;text-align:right">'+v+'</span></div>').join('');
}
function valFor(s, m){ return m==='xp'? s.gainedXp : m==='sessions'? s.numSessions : s.totalSessionTime; }
const flag=(code)=>({es:'🇪🇸',fr:'🇫🇷',en:'🇬🇧',ja:'🇯🇵',zh:'🇨🇳',it:'🇮🇹',de:'🇩🇪',ru:'🇷🇺',pt:'🇵🇹',ko:'🇰🇷',ar:'🇸🇦',hi:'🇮🇳'}[String(code||'').toLowerCase()]||'🌐');
function renderLang(d){
 const elEmpty=q('#langEmpty'), elContent=q('#langContent');
 if(!d || d.totals.days===0){ elEmpty.style.display='block'; elContent.style.display='none'; return; }
 elEmpty.style.display='none'; elContent.style.display='block';
 const elAccountXp=q('#langAccountXp')||q('#langHeroXp'); if(elAccountXp) elAccountXp.textContent=d.totalXp!=null? d.totalXp.toLocaleString('es-ES')+' XP' : '—';
 const elAccountStreak=q('#langAccountStreak')||q('#langHeroStreak'); if(elAccountStreak) elAccountStreak.textContent=d.streak!=null? '🔥 '+d.streak+' días': '';
 const elAccountDays=q('#langAccountDays')||q('#langHeroDays'); if(elAccountDays) elAccountDays.textContent=t.activeDays+'/'+t.days+' días activos';
 const relDate=(iso)=>{ if(!iso) return '—'; const days=Math.floor((Date.now()-new Date(iso).getTime())/864e5); return days<=0?'hoy':days===1?'ayer':'hace '+days+'d'; };
 const lastActivityDay=d.summaries.length? d.summaries[d.summaries.length-1].date*1000 : null;
 const lastPathSync=(d.courseProgressIndex||[]).reduce((max,e)=> !max||e.capturedAt>max? e.capturedAt:max, null);
 const lastActivityIso=lastActivityDay? new Date(lastActivityDay).toISOString().slice(0,10) : null;
 q('#langSyncMeta').textContent= 'Sincronizado '+relDate(d.createdAt)+' · Actividad hasta '+(lastActivityIso||'—')+(lastPathSync? ' · Path '+relDate(lastPathSync) : '');
}

function showLanguagesGlobal(){
 const g=q('#langGlobalView'), d=q('#langDetailView');
 if(g&&d){ g.style.display='block'; d.style.display='none'; }
 if(location.pathname.startsWith('/languages/') || location.hash.startsWith('#/languages/')){
  history.pushState(null,'','/languages');
 }
}

async function showCourseDetail(courseId){
 try{
  selectCourse(courseId, false);
  const data=await j('/api/languages/courses/'+encodeURIComponent(courseId));
  if(!data||data.error) return;
  const g=q('#langGlobalView'), d=q('#langDetailView');
  if(g&&d){ g.style.display='none'; d.style.display='block'; }
  const c=data.course;
  q('#langDetailTitle').textContent=(c.learningLanguage? flag(c.learningLanguage)+' ':'')+(c.title||c.courseId);
  q('#langDetailSub').textContent=(c.fromLanguage? c.fromLanguage.toUpperCase()+' → ':'')+(c.learningLanguage? c.learningLanguage.toUpperCase():'')+' · ID: '+c.courseId;
  q('#langDetailXpPill').textContent=(c.xp!=null? c.xp.toLocaleString('es-ES'):0)+' XP';

  const bar=(r,color)=>'<div class="bar" style="height:8px"><i style="width:'+(r!=null?(r*100).toFixed(1):0)+'%;background:'+color+'"></i></div>';
  const sections=data.sections||[];

  const cefrMap=new Map();
  for(const s of sections){
   const lvl=s.cefrLevel||'INTRO';
   if(!cefrMap.has(lvl)) cefrMap.set(lvl, {completed:0, total:0, count:0});
   const ent=cefrMap.get(lvl);
   ent.completed+=(s.completedUnits||0);
   ent.total+=(s.totalUnits||0);
   ent.count++;
  }
  const cefrRows=[...cefrMap.entries()];
  const elCefr=q('#langCefrBody');
  if(elCefr){
   elCefr.innerHTML=cefrRows.length? cefrRows.map(([lvl,ent])=>{
    const ratio=ent.total? (ent.completed/ent.total):0;
    return '<div class="row" style="padding:6px 0"><div style="flex:1">'
     +'<div style="display:flex;justify-content:space-between;align-items:baseline"><b>Nivel '+lvl+' ('+ent.count+' sec)</b><span><b>'+ent.completed+' / '+ent.total+' unidades</b></span></div>'
     +'<div style="margin-top:4px">'+bar(ratio,'#58a6ff')+'</div>'
     +'</div></div>';
   }).join('') : '<div class="muted">Sin información de CEFR</div>';
  }

  q('#langSectionsList').innerHTML=sections.length? sections.map(s=>{
   const cefrLabel=s.cefrLevel? s.cefrLevel+(s.cefrSublevel? '.'+s.cefrSublevel:'') : (s.type||'General');
   const comp=s.completedUnits||0;
   const ratio=s.totalUnits? (comp/s.totalUnits) : 0;
   return '<div class="row" style="padding:10px 0;border-bottom:1px solid #1e2e44"><div style="flex:1">'
    +'<div style="display:flex;justify-content:space-between;align-items:baseline"><b>SECCIÓN '+s.sectionIndex+': '+esc(cefrLabel)+'</b><span><b>'+(s.completedUnits??0)+' / '+(s.totalUnits??0)+' unidades</b></span></div>'
    +'<div style="margin-top:6px">'+bar(ratio,'#2ea043')+'</div>'
    +'<details style="margin-top:6px"><summary class="muted" style="cursor:pointer;font-size:11px">Detalle de sección</summary>'
    +'<div class="muted" style="font-size:12px;margin-top:4px">Section ID: '+s.sectionId+' · Tipo: '+(s.type||'learning')+' · '+(s.lastSeenAt? 'Última observación: '+s.lastSeenAt.slice(0,10):'')+'</div>'
    +'</details>'
    +'</div></div>';
  }).join('') : '<div class="muted">Sin secciones registradas</div>';
 }catch(err){ console.error('showCourseDetail',err); }
}

function renderLanguagesLevel1(langs, xpData, activeDetail){
 q('#langEmpty').style.display='none';
 q('#langContent').style.display='block';
 showLanguagesGlobal();

 const summaries=xpData? (xpData.summaries||[]) : [];
 if(summaries.length){
  const maxXp=Math.max(...summaries.map(s=>s.gainedXp), 1);
  q('#langXpTimeline').innerHTML=summaries.map(s=>{
   const h=Math.max(3, Math.round((s.gainedXp/maxXp)*56));
   const color=s.gainedXp>=500?'#2ea043':s.gainedXp>=100?'#58a6ff':s.gainedXp>0?'#8ea0b8':'#1e2e44';
   const dStr=new Date(s.date*1000).toISOString().slice(0,10);
   return '<div title="' + dStr + ': ' + s.gainedXp + ' XP (' + s.numSessions + ' ses)" style="flex:1;height:' + h + 'px;background:' + color + ';border-radius:2px"></div>';
  }).join('');

  const totalGained=summaries.reduce((a,s)=>a+s.gainedXp,0);
  const totalSes=summaries.reduce((a,s)=>a+s.numSessions,0);
  const totalSecs=summaries.reduce((a,s)=>a+s.totalSessionTime,0);
  const hours=Math.round(totalSecs/3600);
  q('#langXpSummary').textContent=totalGained.toLocaleString('es-ES')+' XP acumulados en '+summaries.length+' días · '+totalSes+' sesiones · ~'+hours+' horas de práctica';
 } else {
  q('#langXpTimeline').innerHTML='<div class="muted">Sin actividad registrada en los últimos 90 días</div>';
  q('#langXpSummary').textContent='';
 }

 renderLanguagesView(langs, null, xpData, activeDetail);
}

function resolveSelectedCourseId(courses,requestedId){
 if(!courses||!courses.length) return null;
 // Priority 1: explicit requestedId (from URL param or hash)
 if(requestedId&&courses.find(c=>c.courseId===requestedId)) return requestedId;
 // Priority 2: localStorage persisted selection
 try{const stored=localStorage.getItem('longitudinal_selected_course');if(stored&&courses.find(c=>c.courseId===stored)) return stored;}catch(e){}
 // Priority 3: deterministic fallback - courses[0] is already sorted by XP DESC from /api/languages
 return courses[0].courseId;
}
const courseDetailCache=new Map();
async function selectCourse(courseId, skipHistory){
 if(!courseId) return;
 selectedCourseId=courseId;
 // Persist selection
 try{localStorage.setItem('longitudinal_selected_course',courseId);}catch(e){}
 // Canonical URL update (no legacy query param, path-based routing)
 const targetPath='/languages/'+encodeURIComponent(courseId);
 if(location.pathname!==targetPath || location.hash || location.search){
  if(skipHistory) history.replaceState(null,'',targetPath);
  else history.pushState(null,'',targetPath);
 }
 // Fetch course detail (use cache to avoid redundant requests)
 let detail=courseDetailCache.get(courseId)||null;
 if(!detail){
  detail=await j('/api/languages/courses/'+encodeURIComponent(courseId)).catch(()=>null);
  if(detail) courseDetailCache.set(courseId,detail);
 }
 // Re-render with updated selection (Languages, and Overview's already-rendered card too)
 if(lastLangsData) renderLanguagesView(lastLangsData, lastAnalyticsData, lastLangXpData, detail);
 renderOverviewLangCard(lastLangsData, detail);
}
let dailyGoalXp=null;
function goalColor(xp,goal){
 if(!(xp>0)) return '#1e2e44';
 if(goal==null) return '#8ea0b8';
 return xp>=goal? '#2ea043' : '#58a6ff';
}
function renderGoalSummary(days7, summaries){
 const el=q('#langGoalToday');
 if(!el) return;
 if(dailyGoalXp==null){ el.textContent='Sin objetivo diario configurado.'; return; }
 const xpOf=iso=>{ const s=summaries.find(x=>{ const xIso=typeof x.date==='string'? x.date.slice(0,10):new Date(x.date>1e11? x.date:x.date*1000).toISOString().slice(0,10); return xIso===iso; }); return s? (s.gainedXp||0):0; };
 const today=xpOf(days7[days7.length-1].date);
 const met=days7.filter(d=>xpOf(d.date)>=dailyGoalXp).length;
 el.textContent='Hoy: '+today.toLocaleString('es-ES')+' / '+dailyGoalXp.toLocaleString('es-ES')+' XP'+(today>=dailyGoalXp? ' · objetivo cumplido':'')+' · '+met+' de 7 días con objetivo cumplido';
}
function renderLanguagesView(langData, analyticsData, xpData, activeDetail){
 if(langData) lastLangsData=langData;
 if(analyticsData) lastAnalyticsData=analyticsData;
 if(xpData) lastLangXpData=xpData;
 if(activeDetail) lastActiveDetail=activeDetail;

 const langs=langData||lastLangsData;
 const analytics=analyticsData||lastAnalyticsData;
 const xp=xpData||lastLangXpData||{summaries:[]};
 const actDetail=activeDetail||lastActiveDetail;
 if(!langs) return;

 const summaries=xp.summaries||[];
 const duolingoCurrentCourseId=langs.currentCourseId;
 const courses=langs.courses||[];
 // Resolve selectedCourseId using 3-tier hierarchy (Canonical Route > localStorage > max XP)
 const route=parseCanonicalRoute(location.pathname, location.hash, location.search);
 selectedCourseId=resolveSelectedCourseId(courses, route.courseId);
 const activeCourse=courses.find(c=>c.courseId===selectedCourseId);
 const fromTo=activeCourse&&activeCourse.fromLanguage&&activeCourse.learningLanguage
  ? activeCourse.fromLanguage.toUpperCase()+' → '+activeCourse.learningLanguage.toUpperCase()
  : '';

 // 1. HeroCard (Orientación 3s) - populate course selector
 const elSelect=q('#langCourseSelect');
 if(elSelect){
  elSelect.innerHTML=courses.map(c=>'<option value="'+esc(c.courseId)+'">'+(c.learningLanguage?flag(c.learningLanguage)+' ':'')+esc(c.title||c.courseId)+' ('+Number(c.xp||0).toLocaleString('es-ES')+' XP)</option>').join('');
  elSelect.value=selectedCourseId||'';
 }
 const elFlag=q('#langCourseFlag');
 if(elFlag) elFlag.textContent=activeCourse&&activeCourse.learningLanguage?flag(activeCourse.learningLanguage):'';

 const todayIso=new Date().toISOString().slice(0,10);
 const todaySummary=summaries.find(s=>{
  const dIso=typeof s.date==='string'? s.date.slice(0,10):new Date(s.date>1e11? s.date:s.date*1000).toISOString().slice(0,10);
  return dIso===todayIso;
 });
 const todayXp=todaySummary? (todaySummary.gainedXp||0):0;
 const courseXp=activeCourse? (activeCourse.xp||0):0;
 const elHeroMeta=q('#langActiveHeroMeta');
 if(elHeroMeta){
  const xpCourseStr=Number(courseXp).toLocaleString('es-ES')+' XP acumulado en el curso';
  elHeroMeta.textContent=xpCourseStr+(fromTo?' · '+fromTo:'');
 }

 let {completed:activeCompleted, total:activeTotal}=getCourseProgress(actDetail);
 if(activeTotal===0&&analytics&&analytics.curriculum&&analytics.curriculum.courses){
  const curCourses=analytics.curriculum.courses||[];
  const activeCur=curCourses.find(c=>c.courseId===selectedCourseId);
  if(activeCur&&activeCur.totalUnits!=null&&activeCur.totalUnits>0){
   activeCompleted=activeCur.completedUnits||0;
   activeTotal=activeCur.totalUnits||0;
  }
 }
 const elProg=q('#langActiveProgress');
 const elBar=q('#langActiveProgressBar');
 if(elProg&&elBar){
  if(activeTotal>0){
   const rPct=(activeCompleted/activeTotal*100).toFixed(1);
   elProg.textContent=activeCompleted+' / '+activeTotal+' unidades ('+rPct+'%)';
   elBar.style.width=rPct+'%';
  } else {
   elProg.textContent='Sin observación aún · Path no sincronizado para este curso';
   elBar.style.width='0%';
  }
 }

 const elAccountXp=q('#langAccountXp')||q('#langHeroXp');
 if(elAccountXp) elAccountXp.textContent=langs.totalXp!=null? Number(langs.totalXp).toLocaleString('es-ES')+' XP' : '—';
 const elAccountStreak=q('#langAccountStreak')||q('#langHeroStreak');
 if(elAccountStreak) elAccountStreak.textContent=langs.streak!=null? '🔥 '+Number(langs.streak).toLocaleString('es-ES')+' días':'—';
 const activeDays=summaries.filter(s=>s.gainedXp>0).length;
 const elAccountDays=q('#langAccountDays')||q('#langHeroDays');
 if(elAccountDays) elAccountDays.textContent=summaries.length? activeDays+' / '+summaries.length+' días activos':'—';
 const elAccountCourses=q('#langAccountCourses')||q('#langHeroCourses');
 if(elAccountCourses) elAccountCourses.textContent=courses.length+' cursos';

 const lastActivityDay=summaries.length? summaries[summaries.length-1].date*1000 : null;
 const lastActivityIso=lastActivityDay? new Date(lastActivityDay).toISOString().slice(0,10) : null;
 const elSyncMeta=q('#langSyncMeta');
 if(elSyncMeta) elSyncMeta.textContent='Sincronizado '+relDate(langs.updatedAt||langs.createdAt)+(lastActivityIso?' · Actividad hasta '+lastActivityIso:'')+(duolingoCurrentCourseId?' · Último curso en Duolingo: '+duolingoCurrentCourseId:'')+accountStaleNote(langs);

 // 2. ActivityStrip (Estado 10s)
 const days7=[];
 const now=new Date();
 for(let i=6;i>=0;i--){
  const d=new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()-i));
  const iso=d.toISOString().slice(0,10);
  const dayLetter=['D','L','M','X','J','V','S'][d.getUTCDay()];
  days7.push({date:iso, dayLetter});
 }
 const elActivityStrip=q('#langActivityStrip');
 const elWeekSum=q('#langWeekSummary');
 if(elActivityStrip){
  let wXp=0, wSes=0, wSec=0;
  elActivityStrip.innerHTML=days7.map(day=>{
   const s=summaries.find(x=>{
    const xIso=typeof x.date==='string'? x.date.slice(0,10):new Date(x.date>1e11? x.date:x.date*1000).toISOString().slice(0,10);
    return xIso===day.date;
   });
   const xpVal=s? (s.gainedXp||0):0;
   const sesVal=s? (s.numSessions||0):0;
   const secVal=s? (s.totalSessionTime||0):0;
   wXp+=xpVal; wSes+=sesVal; wSec+=secVal;
   const minVal=Math.round(secVal/60);
   const c=goalColor(xpVal,dailyGoalXp);
   return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px" title="'+day.date+': '+xpVal+' XP · '+sesVal+' ses · '+minVal+' min">'
    +'<span class="muted" style="font-size:11px">'+day.dayLetter+'</span>'
    +'<div style="width:22px;height:22px;border-radius:50%;background:'+c+';display:flex;align-items:center;justify-content:center"></div>'
    +'<span class="muted" style="font-size:10px">'+(xpVal>0?xpVal:'—')+'</span>'
    +'</div>';
  }).join('');
  if(elWeekSum){
   const wMin=Math.round(wSec/60);
   elWeekSum.textContent=wXp.toLocaleString('es-ES')+' XP · '+wSes+' ses'+(wMin>0?' · '+wMin+' min':'');
  }
 }
 renderGoalSummary(days7, summaries);

 // 3. Tus Cursos (Comprensión 1m) - Orden canónico del catálogo (/api/languages: xp DESC)
 const deterministicCourses=courses;
 const elCoursesList=q('#langCoursesList');
 const elCoursesCount=q('#langCoursesCount');
 if(elCoursesCount) elCoursesCount.textContent=courses.length+' cursos registrados';

 if(elCoursesList){
  const curCourses=(analytics&&analytics.curriculum&&analytics.curriculum.courses)||[];
  elCoursesList.innerHTML=deterministicCourses.length? deterministicCourses.map(c=>{
   const isSelected=c.courseId===selectedCourseId;
   const cFromTo=(c.fromLanguage? c.fromLanguage.toUpperCase()+' → ':'')+(c.learningLanguage? c.learningLanguage.toUpperCase():'');
   const cXp=(c.xp!=null? c.xp.toLocaleString('es-ES'):'0')+' XP';

   let sectionsHtml='';
   let unitsPill='';
   if(isSelected&&actDetail&&actDetail.sections&&actDetail.sections.length){
    unitsPill='<span class="pill" style="border-color:#2ea043;color:#8fd19e">'+activeCompleted+' / '+activeTotal+' unidades</span>';
    sectionsHtml='<div style="margin-top:8px">'
     +'<div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Desglose de secciones</div>'
     +actDetail.sections.map(s=>{
       const cefrLabel=s.cefrLevel? s.cefrLevel+(s.cefrSublevel? '.'+s.cefrSublevel:'') : (s.type||'General');
       const comp=s.completedUnits||0;
       const ratio=s.totalUnits? (comp/s.totalUnits) : 0;
       const pct=(ratio*100).toFixed(1);
       return '<div class="row" style="padding:6px 0;border-bottom:1px solid #1e2e44"><div style="flex:1">'
        +'<div style="display:flex;justify-content:space-between;align-items:baseline;font-size:12px"><b>SECCIÓN '+s.sectionIndex+': '+esc(cefrLabel)+'</b><span><b>'+comp+' / '+(s.totalUnits??0)+' unidades</b> ('+pct+'%)</span></div>'
        +'<div class="progress-bar" style="height:6px;margin-top:4px"><div style="width:'+pct+'%;background:#2ea043"></div></div>'
        +'</div></div>';
     }).join('')
     +'</div>';
   } else {
    const curMatch=curCourses.find(x=>x.courseId===c.courseId);
    if(curMatch&&curMatch.totalUnits>0){
     const rPct=(curMatch.ratio*100).toFixed(1);
     unitsPill='<span class="pill">'+curMatch.completedUnits+' / '+curMatch.totalUnits+' unidades</span>';
     sectionsHtml='<div style="margin-top:6px;font-size:12px">'
      +'<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span class="muted">Progreso: '+curMatch.completedUnits+' / '+curMatch.totalUnits+' unidades</span><span>'+rPct+'%</span></div>'
      +'<div class="progress-bar" style="height:6px"><div style="width:'+rPct+'%;background:#58a6ff"></div></div>'
      +'</div>';
    }
   }

   return '<details class="card" style="margin:0 0 8px 0;padding:12px;background:#0e1724" '+(isSelected?'open':'')+'>'
    +'<summary style="cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px" onclick="selectCourse('+esc(JSON.stringify(c.courseId))+')">'
    +'<div style="display:flex;align-items:center;gap:8px">'
    +'<span style="font-size:18px">'+flag(c.learningLanguage)+'</span>'
    +'<div><b>'+esc(c.title||c.courseId)+'</b>'+(isSelected?' <span class="pill pill-selected" style="font-size:10px">Seleccionado</span>':'')+'<div class="muted" style="font-size:11px">'+esc(cFromTo)+'</div></div>'
    +'</div>'
    +'<div style="display:flex;align-items:center;gap:8px">'
    +'<span class="pill" style="font-weight:700">'+cXp+'</span>'
    +unitsPill
    +'<span class="muted" style="font-size:12px">▾</span>'
    +'</div>'
    +'</summary>'
    +'<div style="margin-top:10px;padding-top:8px;border-top:1px solid #1e2e44">'
    +sectionsHtml
    +'<div style="margin-top:8px;display:flex;justify-content:flex-end">'
    +'<button class="btn btn-g" style="padding:4px 8px;font-size:11px" onclick="showCourseDetail('+esc(JSON.stringify(c.courseId))+')">Ver detalle curricular completo</button>'
    +'</div>'
    +'</div>'
    +'</details>';
  }).join('') : '<div class="muted">Sin cursos de idiomas</div>';
 }

 // 4. Cambios Observados (Longitudinal #16.9)
 const totalCoursesCount=(analytics&&analytics.curriculum&&analytics.curriculum.totalCourses)||courses.length;
 const deltas=(analytics&&analytics.curriculum&&analytics.curriculum.recentDeltas)||[];
 // insufficient_observation means "no second snapshot yet" — unknown, NOT confirmed stable.
 // Never collapse it into a "stable" count: comparable/structural_change/insufficient_observation
 // must stay visually and numerically distinct, matching what the Comparabilidad card shows below.
 const comparableCount=deltas.filter(d=>d.status==='comparable').length;
 const structuralCount=deltas.filter(d=>d.status==='structural_change').length;
 const insufficientCount=deltas.filter(d=>d.status==='insufficient_observation').length;
 const elSyn=q('#langObservedSynthesis');
 if(elSyn){
  if(comparableCount||structuralCount||insufficientCount){
   let txt=comparableCount+' de '+totalCoursesCount+' cursos comparables sin cambio estructural';
   if(insufficientCount) txt+=' · '+insufficientCount+' con observación insuficiente';
   if(structuralCount) txt+=' · '+structuralCount+' con cambio estructural';
   elSyn.textContent=txt;
  } else {
   elSyn.textContent='Sin observaciones curriculares registradas';
  }
 }

 const elDet=q('#langObservedDetail');
 if(elDet){
  const compDelta=deltas.find(d=>d.status==='comparable'&&d.deltaCompletedUnits!=null&&d.deltaCompletedUnits>0);
  if(compDelta){
   const compCourse=courses.find(c=>c.courseId===compDelta.courseId);
   const cName=compCourse?(compCourse.title||compCourse.courseId):compDelta.courseId;
   elDet.textContent='Cambio curricular observado: +'+compDelta.deltaCompletedUnits+' unidades en '+cName;
  } else if(todayXp>0&&activeCourse){
   const activeName=(activeCourse.title||activeCourse.courseId);
   const fTo=activeCourse.fromLanguage&&activeCourse.learningLanguage? ' ('+activeCourse.fromLanguage.toUpperCase()+' → '+activeCourse.learningLanguage.toUpperCase()+')':'';
   elDet.textContent='Actividad reciente (cuenta): +'+todayXp.toLocaleString('es-ES')+' XP · Curso en foco: '+activeName+fTo;
  } else if(todayXp>0){
   elDet.textContent='Actividad reciente (cuenta): +'+todayXp.toLocaleString('es-ES')+' XP';
  } else {
   elDet.textContent='No se detectaron reestructuraciones de árbol curricular en las sincronizaciones observadas.';
  }
 }
}

function renderLanguagesAnalytics(a){
 if(!a || !a.activity) return;
 const g=a.intensity.global;
 const d=a.intensity.dailyDistribution;
 const timePerSes=g.secondsPerSession? Math.round(g.secondsPerSession)+' s':'—';
 const elInt=q('#langIntensityBody');
 if(elInt){
  elInt.innerHTML='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;text-align:center;margin-bottom:12px">'
   +'<div><div class="muted" style="font-size:11px;letter-spacing:.04em;text-transform:uppercase">XP / sesión</div><div style="font-size:20px;font-weight:700">'+(g.xpPerSession!=null?g.xpPerSession.toFixed(1):'—')+'</div><div class="muted" style="font-size:11px">global · med: '+(d.xpPerSessionMedian!=null?d.xpPerSessionMedian.toFixed(1):'—')+'</div></div>'
   +'<div style="border-left:1px solid #1e2e44;padding-left:8px"><div class="muted" style="font-size:11px;letter-spacing:.04em;text-transform:uppercase">Tiempo / sesión</div><div style="font-size:20px;font-weight:700">'+timePerSes+'</div><div class="muted" style="font-size:11px">global · med: '+(d.secondsPerSessionMedian!=null?Math.round(d.secondsPerSessionMedian)+' s':'—')+'</div></div>'
   +'</div>'
   +'<div class="muted" style="font-size:11px;line-height:1.4;border-top:1px solid #1e2e44;padding-top:8px">Ratios descriptivos observados entre XP y tiempo reportado. No representan eficiencia cognitiva ni velocidad de aprendizaje.</div>';
 }

 const days=a.weekdayProfile||[];
 const maxDayXp=Math.max(...days.map(x=>x.medianXp),1);
 const elWk=q('#langWeeklyBody');
 if(elWk){
  elWk.innerHTML=days.length? days.map(w=>{
   const barW=Math.round((w.medianXp/maxDayXp)*100);
   const timeMin=Math.round(w.medianSeconds/60);
   return '<div class="hist-row"><span>'+w.dayName.slice(0,3)+'</span><div class="bar"><i style="width:'+barW+'%;background:#58a6ff"></i></div><span style="min-width:120px;text-align:right" class="muted">'+w.medianXp+' XP · '+w.medianSessions+' ses · '+timeMin+' m</span></div>';
  }).join('')+'<div class="muted" style="font-size:11px;margin-top:8px">Medianas observadas por día de la semana en la ventana de '+(a.period?a.period.calendarDays:0)+' días.</div>'
  : '<div class="muted">Sin datos suficientes</div>';
 }

 const hc=a.historicalConcentration;
 const elConc=q('#langConcentrationBody');
 if(hc&&elConc){
  const cList=(hc.courses||[]).slice(0,5);
  elConc.innerHTML='<div class="hist">'
   +cList.map(c=>{
     const barW=(c.sharePercentage||0).toFixed(1);
     return '<div class="hist-row"><span style="width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(c.title||c.courseId)+'</span><div class="bar"><i style="width:'+barW+'%;background:#2ea043"></i></div><span style="min-width:70px;text-align:right">'+barW+'%</span></div>';
   }).join('')
   +'</div>'
   +'<div class="muted" style="font-size:11px;margin-top:8px">Total vitalicio lingüístico: '+(hc.totalLinguisticXp||0).toLocaleString('es-ES')+' XP en '+(hc.courses||[]).length+' cursos.</div>';
 }

 const deltas=(a.curriculum&&a.curriculum.recentDeltas)||[];
 const elComp=q('#langComparabilityBody');
 if(elComp){
  // Every catalogued course must show up here, not just the ones recentDeltas already
  // covers — a course silently missing reads as "broken", not as "not enough data yet".
  const allCourses=(lastLangsData&&lastLangsData.courses)||[];
  const deltaByCourse=new Map(deltas.map(d=>[d.courseId,d]));
  const waiting=allCourses.filter(c=>!deltaByCourse.has(c.id));
  if(!deltas.length&&!waiting.length){
   elComp.innerHTML='<div class="muted">No se registran múltiples observaciones curriculares para comparar.</div>';
  } else {
   const rows=deltas.map(d=>{
    const isComp=d.status==='comparable';
    const isStruct=d.status==='structural_change';
    const statusPill=isComp?'<span class="pill pill-win">COMPARABLE</span>':isStruct?'<span class="pill pill-loss">CAMBIO ESTRUCTURAL</span>':'<span class="pill pill-draw">INSUFICIENTE</span>';
    const deltaText=isComp?'Δ +'+(d.deltaCompletedUnits??0)+' unidades completadas':isStruct?'Reestructuración de árbol por la fuente ('+d.previousTotalUnits+' → '+d.latestTotalUnits+' unidades totales)':'Intervalo de observación único';
    const prevDate=d.previousObservedAt?d.previousObservedAt.slice(0,10):'—';
    const latestDate=d.latestObservedAt?d.latestObservedAt.slice(0,10):'—';
    return '<div class="row" style="padding:8px 0"><div style="flex:1">'
     +'<div style="display:flex;justify-content:space-between;align-items:center"><b>'+esc(d.courseId)+'</b>'+statusPill+'</div>'
     +'<div style="font-size:12px;margin-top:4px">'+deltaText+'</div>'
     +'<div class="muted" style="font-size:11px;margin-top:2px">Observado: '+prevDate+' → '+latestDate+'</div>'
     +'</div></div>';
   });
   const waitingRows=waiting.map(c=>
    '<div class="row" style="padding:8px 0"><div style="flex:1">'
    +'<div style="display:flex;justify-content:space-between;align-items:center"><b>'+esc(c.title||c.id)+'</b><span class="pill pill-draw">ESPERANDO 2ª OBSERVACIÓN</span></div>'
    +'<div class="muted" style="font-size:11px;margin-top:2px">Aún no hay una segunda captura del Path de este curso para poder comparar.</div>'
    +'</div></div>'
   );
   elComp.innerHTML=rows.concat(waitingRows).join('')+'<div class="muted" style="font-size:11px;margin-top:8px">Criterio estricto: cuando la fuente reestructura el árbol (cambio en el denominador total de unidades), no se calcula un progreso numérico para evitar atribuciones artificiales.</div>';
  }
 }
}

function renderOverviewLangCard(langs, activeDetail){
 if(!langs) return;
 const activeCourse = (langs.courses || []).find(c => c.courseId === selectedCourseId);
 const elActiveCourse = q('#overviewLangActiveCourse');
 if(elActiveCourse){
  const flagStr = activeCourse && activeCourse.learningLanguage ? flag(activeCourse.learningLanguage) + ' ' : '';
  const arrowStr = activeCourse && activeCourse.fromLanguage && activeCourse.learningLanguage
   ? ' <span class="muted" style="font-size:12px;font-weight:400">(' + esc(activeCourse.fromLanguage.toUpperCase()) + ' → ' + esc(activeCourse.learningLanguage.toUpperCase()) + ')</span>'
   : '';
  elActiveCourse.innerHTML = flagStr + esc(activeCourse ? (activeCourse.title || activeCourse.courseId) : (selectedCourseId || 'Ninguno')) + arrowStr;
 }
 // The selected course is a choice made in this dashboard (URL, saved selection or most XP), not what Duolingo reports: when they differ, say both.
 const elSourceCourse = q('#overviewLangSourceCourse');
 if(elSourceCourse){
  const src = langs.currentCourseId;
  const srcCourse = src ? (langs.courses || []).find(c => c.courseId === src) : null;
  elSourceCourse.textContent = src && src !== selectedCourseId ? 'Último curso en Duolingo: ' + (srcCourse ? (srcCourse.title || src) : src) : '';
 }

 const {completed: completedUnits, total: totalUnits} = getCourseProgress(activeDetail);
 const elLangUnits = q('#overviewLangUnits');
 const elLangProgress = q('#overviewLangProgressBar');
 if(elLangUnits && elLangProgress){
  if(totalUnits > 0){
   const rPct = (completedUnits / totalUnits * 100).toFixed(1);
   elLangUnits.textContent = completedUnits + ' / ' + totalUnits + ' unidades (' + rPct + '%)';
   elLangProgress.style.width = rPct + '%';
  } else {
   // Explicit system state, not a bare dash: the Path is only captured for whichever
   // course was open in the source at the last sync — silence here is not a bug.
   elLangUnits.textContent = 'Sin observación aún · Path no sincronizado para este curso';
   elLangProgress.style.width = '0%';
  }
 }

 const elCatalog = q('#overviewLangCatalogXp');
 if(elCatalog){
  const numCourses = (langs.courses || []).length;
  const totalCatXp = langs.totalXp ?? (langs.courses || []).reduce((a, c) => a + (c.xp || 0), 0);
  elCatalog.textContent = numCourses + ' cursos · ' + Number(totalCatXp).toLocaleString('es-ES') + ' XP';
 }
}
function renderOverview(data){
 if(!data) return;

 // 1. Tu actividad (HeroCard verificado)
 const streakVal = data.userState?.streak ?? data.langs?.streak ?? data.streak;
 const elStreak = q('#overviewStreak');
 if(elStreak){
  elStreak.className = 'pill' + (streakVal ? ' pill-win' : '');
  elStreak.textContent = streakVal != null ? '🔥 ' + Number(streakVal).toLocaleString('es-ES') + ' días de racha' : '🔥 —';
 }
 const elSyncMeta = q('#overviewSyncMeta');
 if(elSyncMeta){
  const langSync = data.langs?.updatedAt ? 'Idiomas: sincronizado ' + relDate(data.langs.updatedAt) : 'Idiomas: sin sincronizar';
  const chessSync = data.lastChessSyncedAt ? 'Ajedrez: sincronizado ' + relDate(data.lastChessSyncedAt) : 'Ajedrez: sin sincronizar';
  elSyncMeta.textContent = langSync + ' · ' + chessSync;
 }

 const summaries = data.xp_summaries || data.xpData?.summaries || data.summaries || [];
 const matches = data.matches || [];
 const langs = data.langs || (data.courses ? data : null);
 const activeCourse = (langs?.courses || []).find(c => c.courseId === selectedCourseId);

 // 2. Estado por Dominio
 renderOverviewLangCard(langs, data.activeDetail);

 const stats = data.stats || {};
 const elElo = q('#overviewChessElo');
 if(elElo){
  const elo = stats.currentElo ?? stats.latestElo ?? null;
  elElo.textContent = elo != null ? elo + ' ELO' : '—';
 }
 // The ELO comes from the last Chess snapshot, so its age is the age of that sync.
 const elEloMeta = q('#overviewChessEloMeta');
 if(elEloMeta) elEloMeta.textContent = (stats.currentElo ?? stats.latestElo ?? null) != null && data.lastChessSyncedAt ? 'último snapshot de Chess: ' + relDate(data.lastChessSyncedAt) : '';

 const recent = data.recent || {};
 const wins = recent.wins || 0, losses = recent.losses || 0, draws = recent.draws || 0;
 const rTotal = wins + losses + draws || (recent.games || 0);
 const wrVal = recent.winRate != null ? (recent.winRate * 100).toFixed(0) : (rTotal ? (wins / rTotal * 100).toFixed(0) : '—');
 const elWrLabel = q('#overviewChessWrLabel');
 const elWrMeta = q('#overviewChessWrMeta');
 const elDist = q('#overviewChessDist');
 if(elWrLabel){
  elWrLabel.textContent = wrVal !== '—' ? wrVal + '% victorias (últimas ' + (recent.limit || 50) + ' partidas, todos los rivales)' : 'Win rate (últimas 50 partidas, todos los rivales)';
 }
 if(elWrMeta){
  elWrMeta.textContent = wins + ' W · ' + losses + ' L · ' + draws + ' D';
 }
 if(elDist){
  const sumR = wins + losses + draws || 1;
  const wP = (wins / sumR * 100).toFixed(1);
  const lP = (losses / sumR * 100).toFixed(1);
  const dP = Math.max(0, 100 - parseFloat(wP) - parseFloat(lP)).toFixed(1);
  elDist.innerHTML = '<i class="bar-win" style="width:' + wP + '%" title="Victorias: ' + wins + '"></i><i class="bar-loss" style="width:' + lP + '%" title="Derrotas: ' + losses + '"></i><i class="bar-draw" style="width:' + dP + '%" title="Tablas: ' + draws + '"></i>';
 }
 const elHist = q('#overviewChessHistorical');
 if(elHist && stats.games){
  elHist.textContent = stats.games.toLocaleString('es-ES') + ' partidas disputadas';
 }

 // 3. Tu Semana
 const days7 = [];
 const now = new Date();
 for(let i = 6; i >= 0; i--){
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
  const iso = d.toISOString().slice(0, 10);
  const dayLetter = ['D', 'L', 'M', 'X', 'J', 'V', 'S'][d.getUTCDay()];
  days7.push({ date: iso, dayLetter });
 }

 const elLangWeek = q('#overviewLangWeek');
 const elLangWeekSum = q('#overviewLangWeekSummary');
 if(elLangWeek){
  let wXp = 0, wSes = 0;
  elLangWeek.innerHTML = days7.map(day => {
   const s = summaries.find(x => {
    const xIso = typeof x.date === 'string' ? x.date.slice(0, 10) : new Date(x.date > 1e11 ? x.date : x.date * 1000).toISOString().slice(0, 10);
    return xIso === day.date;
   });
   const xp = s ? (s.gainedXp || 0) : 0;
   const ses = s ? (s.numSessions || 0) : 0;
   wXp += xp; wSes += ses;
   const c = xp >= 500 ? '#2ea043' : xp >= 100 ? '#58a6ff' : xp > 0 ? '#8ea0b8' : '#1e2e44';
   return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px" title="' + day.date + ': ' + xp + ' XP · ' + ses + ' ses">'
    + '<span class="muted" style="font-size:11px">' + day.dayLetter + '</span>'
    + '<div style="width:20px;height:20px;border-radius:50%;background:' + c + ';display:flex;align-items:center;justify-content:center"></div>'
    + '<span class="muted" style="font-size:10px">' + (xp > 0 ? xp : '—') + '</span>'
    + '</div>';
  }).join('');
  if(elLangWeekSum){
   elLangWeekSum.textContent = wXp.toLocaleString('es-ES') + ' XP · ' + wSes + ' ses';
  }
 }

 const elChessWeek = q('#overviewChessWeek');
 const elChessWeekSum = q('#overviewChessWeekSummary');
 if(elChessWeek){
  let wGames = 0;
  elChessWeek.innerHTML = days7.map(day => {
   const mList = matches.filter(m => {
    if (m.played_at) return new Date(m.played_at > 1e11 ? m.played_at : m.played_at * 1000).toISOString().slice(0, 10) === day.date;
    if (m.first_seen_at) return m.first_seen_at.slice(0, 10) === day.date;
    return false;
   });
   const cnt = mList.length;
   wGames += cnt;
   const c = cnt >= 5 ? '#2ea043' : cnt > 0 ? '#58a6ff' : '#1e2e44';
   return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px" title="' + day.date + ': ' + cnt + ' partidas">'
    + '<span class="muted" style="font-size:11px">' + day.dayLetter + '</span>'
    + '<div style="width:20px;height:20px;border-radius:50%;background:' + c + ';display:flex;align-items:center;justify-content:center"></div>'
    + '<span class="muted" style="font-size:10px">' + (cnt > 0 ? cnt : '—') + '</span>'
    + '</div>';
  }).join('');
  if(elChessWeekSum){
   elChessWeekSum.textContent = wGames + (wGames === 1 ? ' partida en 7 días' : ' partidas en 7 días');
  }
 }
}

let lastChessStats=null, lastChessMatches=null, lastRecent=null;
function renderChessView(stats, matches){
 if(stats) lastChessStats = Object.assign(lastChessStats || {}, stats);
 if(matches) lastChessMatches=matches;
 const st=lastChessStats||stats||{};
 const mList=matches||lastChessMatches||lastRows||[];

 const s=st.summary||(st.games!=null?st:hist)||{};
 const r=st.results||{};
 const c=st.color||(st.groups?st:null)||{};
 const o=st.opponents||{};
 const ph=st.phases||{};
 const op=st.openings||{};
 const recent=st.recent||lastRecent||{};

 // 1. HeroCard (Orientación 3s)
 const elo=s.currentElo??s.latestElo??null;
 const delta=(elo!=null&&s.firstElo!=null)? elo - s.firstElo : null;
 const elHeroElo=q('#chessHeroElo');
 if(elHeroElo) elHeroElo.textContent=elo!=null? elo : '—';
 const elHeroEloSub=q('#chessHeroEloSub');
 if(elHeroEloSub) elHeroEloSub.textContent='ELO'+(delta!=null? ' · '+(delta>0?'+':'')+delta+' vs primer snapshot':'');
 
 const elHeroMeta=q('#chessHeroMeta');
 if(elHeroMeta){
  elHeroMeta.textContent=s.games ? s.games.toLocaleString('es-ES')+' partidas disputadas · ELO observado en sincronizaciones' : 'Sin partidas registradas';
 }
 
 const elHeroStreak=q('#chessHeroStreak');
 if(elHeroStreak){
  elHeroStreak.className = 'pill' + (s.currentStreak ? (s.currentStreakKind === 'loss' ? ' pill-loss' : ' pill-win') : '');
  const sk=s.currentStreakKind==='win'?'victorias':s.currentStreakKind==='loss'?'derrotas':s.currentStreakKind||'—';
  elHeroStreak.textContent=s.currentStreak ? '🔥 '+s.currentStreak+' '+sk+' consecutivas' : '🔥 Sin racha activa';
 }
 const elHeroGames=q('#chessHeroGames');
 if(elHeroGames&&s.games){
  elHeroGames.textContent=(s.winRate!=null? (s.winRate*100).toFixed(1)+'% WR histórico':'');
 }

 // DistributionBar in HeroCard (last 50 matches or recent)
 const rWins=recent.wins||0, rLosses=recent.losses||0, rDraws=recent.draws||0;
 const rTotal=rWins+rLosses+rDraws||(recent.games||0);
 const rWr=recent.winRate!=null? (recent.winRate*100).toFixed(0) : (rTotal? (rWins/rTotal*100).toFixed(0):'—');
 
 const elHeroWrLabel=q('#chessHeroWrLabel');
 if(elHeroWrLabel){
  elHeroWrLabel.textContent=rWr!=='—'? rWr+'% victorias (últimas '+(recent.limit||50)+' partidas, todos los rivales)' : 'Win rate (últimas 50 partidas, todos los rivales)';
 }
 const elHeroDistMeta=q('#chessHeroDistMeta');
 if(elHeroDistMeta){
  elHeroDistMeta.textContent=rWins+'W · '+rLosses+'L · '+rDraws+'D';
 }
 const elHeroDist=q('#chessHeroDist');
 if(elHeroDist && rTotal>0){
  const sumR=rWins+rLosses+rDraws||1;
  const wP=(rWins/sumR*100).toFixed(1);
  const lP=(rLosses/sumR*100).toFixed(1);
  const dP=Math.max(0, 100-parseFloat(wP)-parseFloat(lP)).toFixed(1);
  elHeroDist.innerHTML='<i class="bar-win" style="width:'+wP+'%" title="Victorias: '+rWins+'"></i><i class="bar-loss" style="width:'+lP+'%" title="Derrotas: '+rLosses+'"></i><i class="bar-draw" style="width:'+dP+'%" title="Tablas: '+rDraws+'"></i>';
 }

 // 2. Rendimiento por Color (Estado 10s)
 const colorGroups=c.groups||(hist&&hist.groups)||[];
 const totalGames=s.games||1;
 if(colorGroups.length&&q('#col')){
  q('#col').innerHTML=renderCompare(colorGroups, totalGames);
  setColDiff({groups:colorGroups,difference:c.difference});
 }

 // 3. Partidas Recientes (subtitle / count update)
 const elRecentMeta=q('#chessMatchesSubtitle');
 if(elRecentMeta&&mList.length){
  elRecentMeta.textContent = compact 
    ? 'Partidas recientes (' + Math.min(10, mList.length) + ' mostradas)' 
    : 'Todas las partidas (50 por página)';
 }

 // 4. Análisis: Fases y taxonomía canónica
 if(ph&&ph.phases&&q('#phasesCard')&&q('#phasesBody')){
  q('#phasesBody').innerHTML=renderCompare(ph.phases, totalGames);
  if(q('#phasesMeta')){
   q('#phasesMeta').textContent='Mediana: '+(ph.medianPlies||0)+' plies · Hidratadas: '+((ph.population&&ph.population.hydrated)||0)+' partidas';
  }
 }
}

async function loadOverviewDashboard(){
 try {
  const [langs, xpData, stats, recent, matches, timeline] = await Promise.all([
   j('/api/languages').catch(()=>null),
   j('/api/languages/xp?days=30').catch(()=>({summaries:[]})),
   j('/api/stats/summary').catch(()=>null),
   j('/api/stats/recent?limit=50').catch(()=>null),
   j('/api/matches?limit=100').catch(()=>({rows:[],total:0})),
   j('/api/stats/timeline').catch(()=>null)
  ]);
  let activeDetail = null;
  if(langs && langs.courses && langs.courses.length){
   const route=parseCanonicalRoute(location.pathname, location.hash, location.search);
   selectedCourseId=resolveSelectedCourseId(langs.courses, route.courseId);
   activeDetail = await j('/api/languages/courses/' + encodeURIComponent(selectedCourseId)).catch(()=>null);
  }
  const lastSnap = timeline?.snapshots?.[timeline.snapshots.length - 1];
  renderOverview({
   userState: langs,
   langs,
   xp_summaries: xpData?.summaries || [],
   xpData,
   activeDetail,
   stats,
   recent,
   matches: matches?.rows || [],
   lastChessSyncedAt: lastSnap?.createdAt || null
  });
 } catch(err){
  console.error('loadOverviewDashboard', err);
 }
}

async function loadLanguagesDashboard(){
 try{
  const langs=await j('/api/languages');
  if(!langs||langs.error||!langs.courses||!langs.courses.length){
   const legacy=await j('/api/stats/lang').catch(()=>null);
   if(legacy&&!legacy.error){ renderLang(legacy); return; }
   q('#langEmpty').style.display='block';
   q('#langContent').style.display='none';
   return;
  }
  const [xpData, analytics, settings]=await Promise.all([
   j('/api/languages/xp?days=90').catch(()=>({summaries:[]})),
   j('/api/languages/analytics').catch(()=>null),
   j('/api/me/settings').catch(()=>null),
  ]);
  dailyGoalXp=settings&&typeof settings.dailyGoalXp==='number'? settings.dailyGoalXp : null;
  // Resolve selectedCourseId (Canonical Route > localStorage > max XP); duolingoCurrentCourseId is purely observational
  const route=parseCanonicalRoute(location.pathname, location.hash, location.search);
  selectedCourseId=resolveSelectedCourseId(langs.courses, route.courseId);
  let activeDetail=null;
  if(selectedCourseId){
   activeDetail=await j('/api/languages/courses/'+encodeURIComponent(selectedCourseId)).catch(()=>null);
  }
  renderLanguagesLevel1(langs, xpData, activeDetail);
  if(analytics&&!analytics.error){
   renderLanguagesAnalytics(analytics);
  }
  renderLanguagesView(langs, analytics, xpData, activeDetail);
 }catch(err){
  console.error('loadLanguagesDashboard',err);
  const legacy=await j('/api/stats/lang').catch(()=>null);
  if(legacy&&!legacy.error) renderLang(legacy);
  else{ q('#langEmpty').style.display='block'; q('#langContent').style.display='none'; }
 }
}

let compact=true, hist=null, recentN=50;
function pageSize(){ return compact?10:50; }
function prevPage(){ loadM(off-pageSize()); }
function nextPage(){ loadM(off+pageSize()); }
function showAllMatches(){ compact=false; q('#matchFilters').style.display='flex'; q('#matchPager').style.display='flex'; q('#btnAllMatches').style.display='none'; const sub=q('#chessMatchesSubtitle'); if(sub) sub.textContent='Todas las partidas (50 por página)'; loadM(0); }
function showOpeningTab(tab){q('#openingsWhite').style.display=tab==='white'?'block':'none';q('#openingsBlack').style.display=tab==='black'?'block':'none';q('#tabBtnBlancas').className='btn '+(tab==='white'?'btn-p':'btn-g');q('#tabBtnNegras').className='btn '+(tab==='black'?'btn-p':'btn-g');}
function populateOpeningFilter(op){
 const select=q('#fOpening'); if(!select) return;
 select.innerHTML='<option value="">Apertura: Todas</option>';
 for(const [group,items] of [['Blancas',op.white||[]],['Negras',op.black||[]]]){
  const optgroup=document.createElement('optgroup'); optgroup.label=group;
  for(const item of items){ const option=document.createElement('option'); option.value=item.key; option.textContent=item.label||item.name||item.key; optgroup.appendChild(option); }
  if(optgroup.children.length) select.appendChild(optgroup);
 }
}
function fmtDelta(a,b){ if(a==null||b==null) return '—'; const d=a-b; return (d>0?'+':'')+d; }
function arrow(a,b){ if(a==null||b==null) return ''; return a>b?' ↑':a<b?' ↓':' ·'; }
async function setRecent(n){ recentN=n; for(const k of [20,50,100]){ const el=q('#b'+k); if(el){ el.className=n===k?'btn btn-p':'btn btn-g'; } } const r=await j('/api/stats/recent?limit='+n); lastRecent=r; renderForm(r); renderChessView({ recent: r }, lastRows); }
function fmtDelta(d){ // d in percentage points: {diff,lower,upper}. Never shown without its interval.
 if(!d) return '—';
 const sg=(v,dec,raw)=>{ const t=Math.abs(v).toFixed(dec); return v===0||(!raw&&Number(t)===0)?t:(v>0?'+':'−')+t; }; // raw: a limit keeps its true sign even when it rounds to 0, so [+0, …] reads as "excludes 0"
 return sg(d.diff,1)+' pp · IC95 ['+sg(d.lower,0,1)+', '+sg(d.upper,0,1)+']'+(d.lower<=0&&d.upper>=0?' · sin evidencia suficiente':'');
}
function scaleDelta(d,k){ return d?{diff:d.diff*k,lower:d.lower*k,upper:d.upper*k}:null; }
function setColDiff(c){ // the single renderer of the white-vs-black line
 const g=c.groups||[], wh=g.find(x=>x.key==='white'), bl=g.find(x=>x.key==='black');
 if(!(wh&&bl&&wh.winRate!=null&&bl.winRate!=null&&q('#colDiff'))) return;
 q('#colDiff').textContent='Blancas '+(wh.winRate*100).toFixed(1)+'% · Negras '+(bl.winRate*100).toFixed(1)+'% → '+fmtDelta(scaleDelta(c.difference,100));
}
function pctCi(rate,ci){ return rate!=null?(rate*100).toFixed(1)+'%'+(ci?' ['+Math.round(ci.lower*100)+'–'+Math.round(ci.upper*100)+']':''):'—'; }
function renderForm(r){
 if(!r.before) return;
 const hr=r.before; // games before the window: the window is never part of its own baseline
 const pctR=v=>v!=null?(v*100).toFixed(1)+'%':'—';

 q('#form').innerHTML='<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;text-align:center">'
  +'<div><div class="muted" style="font-size:11px;letter-spacing:.04em;text-transform:uppercase">Últimas '+r.games+'</div><div style="font-weight:700">'+pctCi(r.winRate,r.winRateCi)+' WR</div><div class="muted">'+pctR(r.scoreRate)+' score · '+r.wins+'W '+r.losses+'L '+r.draws+'D</div>'+(r.delta?'<div class="muted" style="margin-top:4px;font-size:11px">'+fmtDelta(scaleDelta(r.delta,100))+' vs anteriores</div>':'')+'</div>'
  +'<div style="border-left:1px solid #1e2e44;padding-left:8px"><div class="muted" style="font-size:11px;letter-spacing:.04em;text-transform:uppercase">Anteriores · '+hr.games+'</div><div style="font-weight:700">'+pctCi(hr.winRate,hr.winRateCi)+' WR</div><div class="muted">'+pctR(hr.scoreRate)+' score · '+hr.wins+'W '+hr.losses+'L '+hr.draws+'D</div></div>'
  +'</div>';

 if(r.colorGroups && r.colorGroups.length){
  const cg=r.colorGroups;
  const wh=cg.find(g=>g.key==='white'), bl=cg.find(g=>g.key==='black');
  if(wh && bl && wh.games > 0 && bl.games > 0){
   q('#form').innerHTML+='<div class="muted" style="margin-top:10px;display:flex;gap:12px;flex-wrap:wrap">'
    +'<span>♔ Blancas '+pctR(wh.winRate)+' ('+wh.games+')</span>'
    +'<span>♚ Negras '+pctR(bl.winRate)+' ('+bl.games+')</span>'
    +'</div>';
  }
 }
}

function pillResult(r){
 r=(r||'').toLowerCase();
 if(r.includes('win')||r==='won') return '<span class="pill pill-win">Victoria</span>';
 if(r.includes('los')||r.includes('defeat')) return '<span class="pill pill-loss">Derrota</span>';
 if(r.includes('draw')||r.includes('tie')) return '<span class="pill pill-draw">Tablas</span>';
 return '<span class="pill">'+esc(r||'—')+'</span>';
}
function pillType(t){
 t=String(t||'').toLowerCase();
 if(t==='bot') return '<span class="pill">Bot</span>';
 if(t==='pvp') return '<span class="pill" style="border-color:#58a6ff;color:#a8c8ff">PvP</span>';
 return '<span class="pill">'+esc(t||'—')+'</span>';
}
function pillEnd(c){
 if(!c||c==='unknown') return '<span class="pill" style="opacity:.4">—</span>';
 const labels={checkmate:'Mate',disconnection:'Desconexión',stalemate:'Ahogado',repetition:'Repetición',resignation:'Rendición',insufficient_material:'Material',timeout:'Tiempo',fifty_moves:'50 jugadas'};
 return '<span class="pill">'+esc(labels[c]||c)+'</span>';
}
function pillSegment(s){
 if(!s||s==='unknown') return '';
 const labels={noisy_neural:'Noisy Neural',neural:'Neural',blended:'Blended',stockfish:'Stockfish',pvp:'PvP'};
 const label=labels[s]||s;
 return ' <span class="pill" style="font-size:10px;margin-left:4px;opacity:.85">'+esc(label)+'</span>';
}

function formatMatchDate(playedAt, firstSeenAt) {
  if (playedAt && Number.isFinite(playedAt)) {
    const d = new Date(playedAt * 1000);
    const day = d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    const time = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    return day + " · " + time;
  }
  if (firstSeenAt) {
    const d = new Date(firstSeenAt);
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  }
  return "—";
}

function renderCompare(groups, totalGames){
 // groups: [{key,games,wins,losses,draws,winRate,scoreRate}]
 const segLabels={noisy_neural:'Noisy Neural',neural:'Neural',blended:'Blended',stockfish:'Stockfish',pvp:'PvP',bot:'Bots',white:'Blancas',black:'Negras'};
 return groups.map(g=>{
  const dec=g.decided||0, w=dec?Math.round(g.wins/dec*100):0, l=dec?Math.round(g.losses/dec*100):0, d=dec?100-w-l:0; // bars are shares of decided games; unknowns are reported apart
  const pctGames=totalGames? (g.games/totalGames*100).toFixed(1):'0';
  const label=g.label||segLabels[g.key]||g.key;
  return '<div class="row"><div style="flex:1"><div style="display:flex;justify-content:space-between;align-items:baseline"><b>'+esc(label)+'</b><span class="muted">'+g.games+' · '+pctGames+'%</span></div><div class="bar" style="margin-top:6px;display:flex"><i class="bar-win" style="width:'+w+'%"></i><i class="bar-loss" style="width:'+l+'%"></i><i class="bar-draw" style="width:'+d+'%"></i></div><div class="muted" style="margin-top:4px;display:flex;gap:10px;flex-wrap:wrap"><span>Win '+pctCi(g.winRate,g.winRateCi)+'</span><span>Score '+(g.scoreRate!=null?(g.scoreRate*100).toFixed(1)+'%':'—')+'</span>'+'<span>· barra sobre '+dec+' decididas'+(g.unknown?' · '+g.unknown+' sin resultado':'')+'</span>'+'</div></div></div>';
 }).join('') || '<div class="muted">Sin datos</div>';
}

let chip={type:'',result:'',color:''};
function setChip(group,value,silent){ if(group==='type'&&q('#fOpp')) q('#fOpp').value=''; chip[group]=value; document.querySelectorAll('#matchChips [data-chip]').forEach(b=>{ const [g,v]=b.getAttribute('data-chip').split(':'); b.className='btn '+(chip[g]===v?'btn-p':'btn-g'); }); if(!silent) loadM(0); }
let searchTimer=null;
function onSearch(){ clearTimeout(searchTimer); searchTimer=setTimeout(()=>loadM(0),300); }
function clearF(){ q('#q').value='';q('#fOpp').value='';q('#fMin').value='';q('#fMax').value='';q('#fEnd').value='';q('#fPhase').value='';q('#fOpening').value='';setChip('type','',true);setChip('result','',true);setChip('color',''); }

function renderRows(){
 const rows= lastRows;
 if(!rows.length){
  q('#mb').innerHTML=''; q('#empty').style.display='block';
  q('#empty').textContent= compact ? 'Sin partidas todavía' : 'Sin partidas con esos filtros';
 } else {
  q('#empty').style.display='none';
  q('#mb').innerHTML=rows.map(m=>{
   var fullDate = m.played_at ? new Date(m.played_at * 1000).toLocaleString('es-ES') : (m.first_seen_at ? new Date(m.first_seen_at).toLocaleString('es-ES') : '');
   return '<tr><td data-l="Fecha"' + (fullDate ? ' title="' + fullDate + '"' : '') + '>' + formatMatchDate(m.played_at, m.first_seen_at) + '</td><td data-l="Rival">'+esc(m.opponent_name||'—')+pillSegment(m.opponent_segment)+'</td><td data-l="Tipo">'+pillType(m.opponent_type)+(m.opening_key&&m.opening_key!=='unclassified'?'<span class="pill" style="font-size:10px;margin-left:4px;opacity:.75">'+esc(m.opening_key)+'</span>':'')+(m.phase_key&&m.phase_key!=='unknown'?'<span class="pill" style="font-size:10px;margin-left:4px;opacity:.8">'+({opening:'Aper.',middlegame:'Medio',endgame:'Final'}[m.phase_key]||esc(m.phase_key))+'</span>':'')+'</td><td data-l="ELO">'+fmt(m.opponent_elo)+'</td><td data-l="Color">'+esc(m.user_color||'—')+'</td><td data-l="Resultado">'+pillResult(m.result||m.outcome)+'</td><td data-l="Fin">'+pillEnd(m.end_condition)+'</td><td data-l="Rev.">'+(m.reviewed?'✓':'')+'</td></tr>';
  }).join('');
 }
}

async function init(){
 const overviewPromise=loadOverviewDashboard();
 const langPromise=loadLanguagesDashboard();
 await loadChessDashboard();
 try{
  await langPromise;
 }catch(e){ console.error('lang',e); q('#langEmpty').style.display='block'; q('#langEmpty').textContent='Error cargando datos de idiomas — reintenta más tarde.'; }
 try{
  await overviewPromise;
 }catch(e){ console.error('overview',e); }
 loadM(0);
}

async function loadChessDashboard(){
 try{
  const [s,r,c,o,e,t,op,ph]=await Promise.all([j('/api/stats/summary'),j('/api/stats/results'),j('/api/stats/color'),j('/api/stats/opponents'),j('/api/stats/opponent-elo'),j('/api/stats/timeline'),j('/api/stats/openings'),j('/api/stats/phases')]);
  const rec50=await j('/api/stats/recent?limit=50').catch(()=>null);
  if(rec50) lastRecent=rec50;
  hist=s; hist.groups=c.groups;

  // header
  const elo=s.currentElo??s.latestElo??null;
  const delta=(elo!=null && s.firstElo!=null)? elo - s.firstElo : null;
  const deltaLabel = delta!=null ? (delta>0?'▲ +'+delta:delta<0?'▼ '+Math.abs(delta):'0')+' vs primer snapshot' : '';
  const lastSnap=t.snapshots?.[t.snapshots.length-1];
  const lastDate= lastSnap?.createdAt ? lastSnap.createdAt.slice(0,10) : null;
  q('#syncMeta').textContent= lastDate ? 'Actualizado '+lastDate+' · '+s.games.toLocaleString('es-ES')+' partidas' : s.games.toLocaleString('es-ES')+' partidas';

  // kpis
  q('#kpis').innerHTML= kpi('Partidas', s.games.toLocaleString('es-ES'), '') 
    + kpi('Win rate', s.winRate!=null?(s.winRate*100).toFixed(1)+'%':'—', '') 
    + kpi('Score', s.scoreRate!=null?(s.scoreRate*100).toFixed(1)+'%':'—', 'victoria 1 · tablas 0,5') 
    + kpi('ELO actual', fmt(elo), deltaLabel);
  // racha
  const sk=s.currentStreakKind==='win'?'victorias':s.currentStreakKind==='loss'?'derrotas':s.currentStreakKind||'—';
  q('#streak').innerHTML= (s.currentStreak? '<b>Racha actual: '+s.currentStreak+' '+sk+'</b> · ':'') + 'Mejor racha: '+ (s.longestWin||0)+'W' + (s.longestLoss? ' · Peor: '+s.longestLoss+'L':'');
  // forma actual default 50
  for(const k of [20,50,100]){ const el=q('#b'+k); if(el) el.className='btn '+(k===50?'btn-p':'btn-g'); }
  setRecent(50).catch(()=>{});

  // evolution - dedup by day keep last elo
  const byDay=new Map();
  for(const snap of (t.snapshots||[])){
   if(snap.elo==null) continue;
   const d=snap.createdAt.slice(0,10);
   byDay.set(d, snap.elo);
  }
  const points=[...byDay.entries()].map(([date,elo])=>({date,elo})).sort((a,b)=>a.date.localeCompare(b.date));
  q('#evo').innerHTML=sparkline(points);
  if(!points.length) q('#evoNote').textContent='Sin snapshots';
  else if(points.length===1) q('#evoNote').textContent='';
  else {
   const elos=points.map(p=>p.elo); const mx=Math.max(...elos), mn=Math.min(...elos);
   const dlt=elos[elos.length-1]-elos[0];
   q('#evoNote').textContent= points.length+' días · '+mn+'–'+mx+' · '+(dlt>0?'+':'')+dlt+' desde inicio · ELO observado en sincronizaciones';
  }

  // results
  q('#res').innerHTML=donut(s.wins,s.losses,s.draws);
  if(r.endConditions){
   const ec = r.endConditions;
   const discon = ec.disconnection?.loss || 0;
   const mates = ec.checkmate?.loss || 0;
   const pctDiscon = s.losses ? (discon / s.losses * 100).toFixed(0) : 0;
   const lp = [];
   if(mates) lp.push(mates + ' mates');
   if(discon) lp.push(discon + ' desconexiones (' + pctDiscon + '%)');
   for(const [k, v] of Object.entries(ec)){
    if(k !== 'checkmate' && k !== 'disconnection' && k !== 'unknown' && v && v.loss > 0){
     const label = k === 'resignation' ? 'rendiciones' : (k === 'timeout' ? 'por tiempo' : k);
     lp.push(v.loss + ' ' + label);
    }
   }
   if(lp.length && q('#lossContext')) q('#lossContext').textContent = 'Derrotas: ' + lp.join(' · ');

   const dp = [];
   if(ec.stalemate?.draw) dp.push(ec.stalemate.draw + ' ahogados');
   if(ec.repetition?.draw) dp.push(ec.repetition.draw + ' repetición');
   const mat = (ec.insufficient_material?.draw || 0) + (ec.material?.draw || 0);
   if(mat) dp.push(mat + ' material');
   if(ec.fifty_moves?.draw) dp.push(ec.fifty_moves.draw + ' 50 jugadas');
   for(const [k, v] of Object.entries(ec)){
    if(!['stalemate', 'repetition', 'insufficient_material', 'material', 'fifty_moves', 'unknown'].includes(k) && v && v.draw > 0){
     dp.push(v.draw + ' ' + k);
    }
   }
   if(dp.length && q('#drawContext')) q('#drawContext').textContent = 'Tablas: ' + dp.join(' · ');
  }

  // color / bots
  const totalGames=s.games||1;
   q('#col').innerHTML=renderCompare(c.groups, totalGames);
   setColDiff(c);
  if(o.macro && o.macro.length && q('#oppMacro')){
   const b=o.macro.find(m=>m.key==='bot'), p=o.macro.find(m=>m.key==='pvp');
   if(b && p){
    const fWr=v=>v!=null?(v*100).toFixed(1).replace('.',',')+' %':'—';
    q('#oppMacro').textContent='Bots: '+b.games.toLocaleString('es-ES')+' ('+fWr(b.winRate)+') · PvP: '+p.games.toLocaleString('es-ES')+' ('+fWr(p.winRate)+')';
   }
  }
  q('#opp').innerHTML=renderCompare(o.segments || o.groups || [], totalGames);

  // openings
  if(op&&!op.error&&q('#openingsCard')){
   var opTotal=s.games||1;
   q('#openingsWhite').innerHTML=renderCompare(op.white||[],opTotal);
   q('#openingsBlack').innerHTML=renderCompare(op.black||[],opTotal);
   populateOpeningFilter(op);
   if(op.population&&q('#openingsPop')) q('#openingsPop').textContent='Hidratadas: '+op.population.hydrated+' / '+op.population.totalMatches+' partidas';
  }

  // phases
  if(ph&&!ph.error&&q('#phasesCard')){
   var phTotal=s.games||1;
   q('#phasesBody').innerHTML=renderCompare(ph.phases||[],phTotal);
   if(q('#phasesMeta')) q('#phasesMeta').textContent='Mediana: '+(ph.medianPlies||0)+' plies · Hidratadas: '+((ph.population&&ph.population.hydrated)||0)+' partidas';
  }

  // elo
  const known=e.count, total=s.games;
  q('#elo').innerHTML='<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:baseline"><span style="font-size:22px;font-weight:700">'+known+' <span class="muted" style="font-size:13px;font-weight:400">con ELO</span></span><span class="muted">'+(total? (known/total*100).toFixed(1):'0')+'% de '+total.toLocaleString('es-ES')+' · media '+(e.average?.toFixed(0)??'—')+' · '+fmt(e.min)+' – '+fmt(e.max)+'</span></div><div class="hist">'+histBuckets(e.buckets,known)+'</div>';
  q('#eloNote').textContent=e.note || (known+' / '+total+' partidas con ELO rival conocido — la mayoría son bots sin ELO');
  const eloSummaryMeta=q('#eloSummaryMeta');
  if(eloSummaryMeta && total){
    eloSummaryMeta.textContent = '· muestra conocida: '+known+' ('+(known/total*100).toFixed(1)+'%)';
  }
  renderChessView({ summary: s, results: r, color: c, opponents: o, elo: e, timeline: t, openings: op, phases: ph, recent: rec50 }, lastRows);
 }catch(err){ console.error(err); q('#kpis').innerHTML='<div class="muted">Error cargando estadísticas</div>'; }
}

async function loadM(o){
 off=Math.max(0,o);
 const lim=pageSize();
 const p=new URLSearchParams({limit:lim,offset:off});
 const qv=q('#q').value.trim(); if(qv) p.set('q',qv);
 const fOpp=q('#fOpp');
 if(fOpp&&fOpp.value){
  if(fOpp.value.startsWith('seg:')) p.set('opponentSegment',fOpp.value.slice(4));
  else p.set('opponentType',fOpp.value);
 } else if(chip.type) p.set('opponentType',chip.type);
  if(chip.result) p.set('result',chip.result);
  if(chip.color) p.set('color',chip.color);
 if(q('#fMin').value) p.set('minOpponentElo',q('#fMin').value);
 if(q('#fMax').value) p.set('maxOpponentElo',q('#fMax').value);
 const fEnd=q('#fEnd');
 if(fEnd&&fEnd.value) p.set('endCondition',fEnd.value);
 const fPhase=q('#fPhase');
 if(fPhase&&fPhase.value) p.set('phase',fPhase.value);
 const fOpening=q('#fOpening');
 if(fOpening&&fOpening.value) p.set('opening',fOpening.value);
 const d=await j('/api/matches?'+p);
 lastRows=d.rows||[]; lastTotal=d.total||0;
 renderRows();
 renderChessView(null, lastRows);
 q('#mc').textContent= d.total ? (off+1)+'–'+(off+lastRows.length)+' de '+d.total.toLocaleString('es-ES') : '0 partidas';
 q('#prev').disabled= off===0;
 q('#next').disabled= off+pageSize() >= d.total;
}
function esc(s){
 return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
const COURSE_LANG_NAMES={AR:'Árabe',CA:'Catalán',CS:'Checo',DE:'Alemán',EL:'Griego',EN:'Inglés',ES:'Español',FR:'Francés',HI:'Hindi',HU:'Húngaro',ID:'Indonesio',IT:'Italiano',JA:'Japonés',KO:'Coreano',NL:'Neerlandés',PL:'Polaco',PT:'Portugués',RO:'Rumano',RU:'Ruso',SV:'Sueco',TR:'Turco',UK:'Ucraniano',VI:'Vietnamita',ZH:'Chino'};
function trajectoryCourseName(id){
 const m = /^DUOLINGO_([A-Z]+)_[A-Z]+$/.exec(id || '');
 return (m && COURSE_LANG_NAMES[m[1]]) || id;
}
function trajectoryCopy(f){
 const m = f.metrics;
 if(f.type === 'CHESS_COLOR_ASYMMETRY_LONGITUDINAL'){
  const w = m.dominantColor === 'white';
  return { title: 'Asimetría por color',
   claim: 'Tu rendimiento con ' + (w ? 'blancas' : 'negras') + ' ha sido consistentemente superior al de ' + (w ? 'negras' : 'blancas') + '.',
   evidence: f.sample.gamesCount + ' partidas · ' + Math.round(m.globalWhiteWinRate) + '% blancas · ' + Math.round(m.globalBlackWinRate) + '% negras · patrón consistente en ambas mitades' };
 }
 if(f.type === 'LANG_FOCUS_SHIFT_LONGITUDINAL'){
  return { title: 'Desplazamiento de foco',
   claim: 'Tu foco principal de aprendizaje se ha desplazado de ' + trajectoryCourseName(m.previousCourseId) + ' a ' + trajectoryCourseName(m.newCourseId) + '.',
   evidence: Math.round(m.h1PreviousCourseShare) + '% de tu XP en la primera mitad (' + m.h1PreviousCourseXp + ' XP) → ' + Math.round(m.h2NewCourseShare) + '% en la segunda (' + m.h2NewCourseXp + ' XP)' };
 }
 return null;
}
async function fetchTrajectory(){
 const elEmpty = q('#trajectoryEmpty');
 const elFindings = q('#trajectoryFindings');
 try{
  const res = await fetch('/api/trajectory');
  if(!res.ok) throw new Error('http ' + res.status);
  const data = await res.json();
  const evals = data.evaluations || [];
  const evalIds = new Set(evals.map(e => e.id));
  const copies = (data.findings || []).map(f => ({type: f.type, c: trajectoryCopy(f)})).filter(x => x.c);
  const span = data.temporalSpan;
  const win = span && span.startedAt && span.endedAt ? String(span.startedAt).slice(0, 10) + ' → ' + String(span.endedAt).slice(0, 10) : 'sin fechas';
  // a pattern with an evaluation is shown with its epistemic status; one without (language focus shift has no contract yet) keeps its plain card
  const cards = evaluationCards(evals, e => (copies.find(x => x.type === e.id) || {}).c, win);
  const plain = copies.filter(x => !evalIds.has(x.type)).map(x => '<div class="card" style="margin-bottom:10px">'
   + '<h3 style="margin:0 0 6px;font-size:14px;color:#e6edf3">' + esc(x.c.title) + '</h3>'
   + '<div style="font-size:13px;font-weight:600;color:#c8d7ea;margin-bottom:6px">' + esc(x.c.claim) + '</div>'
   + '<div class="muted" style="font-size:12px"><strong>Evidencia:</strong> ' + esc(x.c.evidence) + '</div></div>');
  elEmpty.style.display = cards.length || plain.length ? 'none' : 'block';
  elFindings.innerHTML = cards.concat(plain).join('');
 } catch(err){
  elFindings.innerHTML = '';
  elEmpty.style.display = 'block';
  elEmpty.textContent = 'Error al cargar tu trayectoria.';
 }
}
function fmtWhen(iso){ const t = new Date(iso); return isNaN(t.getTime()) ? String(iso) : t.toISOString().slice(0, 10) + ' ' + t.toISOString().slice(11, 16) + ' UTC'; }
async function fetchWhatChanged(sinceOverride){
 const now = new Date();
 let since = sinceOverride;
 if(!since){
  since = localStorage.getItem('lastVisitedAt');
  if(!since){
   since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }
 }
 let until = now.toISOString();
 if(new Date(since).getTime() >= new Date(until).getTime()){
  until = new Date(new Date(since).getTime() + 1000).toISOString();
 }

 const elHeader = q('#changesHeader');
 const elEmpty = q('#changesEmpty');

 if(elHeader){
  const is7d = activeChangesInterval === 7;
  const is30d = activeChangesInterval === 30;
  const isVisit = activeChangesInterval === 0 || (!sinceOverride && Boolean(localStorage.getItem('lastVisitedAt')));

  elHeader.innerHTML = '<div class="hero-card" style="margin-bottom:12px">'
   + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">'
   + '<div>'
   + '<h2 style="margin:0;font-size:18px">¿Qué ha cambiado?</h2>'
   + '<div class="muted" style="font-size:12px;margin-top:2px">Mostrando cambios entre ' + esc(fmtWhen(since)) + ' y ' + esc(fmtWhen(until)) + '</div>'
   + '</div>'
   + '<button class="btn btn-p" id="btnMarkSeen" onclick="markChangesAsSeenNow()">Marcar como visto ahora</button>'
   + '</div>'
   + '<div class="filters" style="margin-top:12px;margin-bottom:0">'
   + '<button class="btn ' + (is7d ? 'btn-p' : 'btn-g') + '" onclick="setChangesInterval(7)">Últimos 7 días</button>'
   + '<button class="btn ' + (is30d ? 'btn-p' : 'btn-g') + '" onclick="setChangesInterval(30)">Últimos 30 días</button>'
   + '<button class="btn ' + (isVisit ? 'btn-p' : 'btn-g') + '" onclick="setChangesInterval(0)">Desde última visita</button>'
   + '</div>'
   + '</div>';
 }

 try {
  const res = await fetch('/api/what-changed?since=' + encodeURIComponent(since) + '&until=' + encodeURIComponent(until));
  if(!res.ok){
   if(elEmpty){
    elEmpty.style.display = 'block';
    elEmpty.textContent = 'Error al cargar cambios (/api/what-changed).';
   }
   return;
  }
  const data = await res.json();
  renderWhatChanged(data);
 } catch(err){
  if(elEmpty){
   elEmpty.style.display = 'block';
   elEmpty.textContent = 'Error de conexión al cargar cambios.';
  }
 }
}

function markChangesAsSeenNow(){
 localStorage.setItem('lastVisitedAt', new Date().toISOString());
 activeChangesInterval = 0;
 fetchWhatChanged();
}

function setChangesInterval(days){
 activeChangesInterval = days;
 if(days === 0){
  fetchWhatChanged();
 } else {
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  fetchWhatChanged(sinceIso);
 }
}

// Epistemic status of one evaluation, derived from the evaluation alone. AFIRMADO and INDICIO follow salience() in
// src/domain/whatChanged.ts; unlike it, any limit on the evidence (sample, span, missing data) makes the evaluation INSUFICIENTE
// even if the effect is also below the criterion: "SIN INDICIO" must never read as "checked, nothing changed".
function evalState(e){
 if(e.status === 'emitted') return 'AFIRMADO';
 const rs = e.reasons || [];
 if(rs.length && rs.every(r => r === 'insufficient_sample' || r === 'interval_includes_zero')) return 'INDICIO';
 return rs.some(r => r === 'data_unavailable' || r === 'span_too_short' || r === 'insufficient_sample') ? 'INSUFICIENTE' : 'SIN INDICIO';
}
const EVAL_STATE_ORDER = ['AFIRMADO', 'INDICIO', 'INSUFICIENTE', 'SIN INDICIO'];
const EVAL_STATE_PILL = {'AFIRMADO':'pill pill-win', 'INDICIO':'pill pill-warn', 'INSUFICIENTE':'pill pill-draw', 'SIN INDICIO':'pill'};
const EVAL_STATE_MSG = {
 'INDICIO': 'Vemos una señal, pero con la evidencia actual no podemos afirmarla.',
 'INSUFICIENTE': 'No hay evidencia suficiente para responder en esta ventana.',
 'SIN INDICIO': 'No se observa evidencia suficiente de un cambio bajo este criterio; no equivale a demostrar que no hubo cambio.'
};
const EVAL_META = {
 CHESS_COLOR_ASYMMETRY: {title: 'Asimetría por color', scope: 'Ajedrez · partidas decididas'},
 CHESS_RATING_JUMP: {title: 'Salto de ELO', scope: 'Ajedrez · ELO observado'},
 LANG_XP_ACCELERATION: {title: 'Mayor XP diario', scope: 'Cuenta · XP'},
 CHESS_COLOR_ASYMMETRY_LONGITUDINAL: {title: 'Asimetría por color · todo el historial', scope: 'Ajedrez · historial'}
};
// The criteria come from the evaluation itself (e.criteria): the rule's own thresholds, never copied here.
function evalReasonText(e, r){
 const id = e.id, m = e.metrics || {}, k = e.criteria || {};
 const f = (v, d) => v == null ? '—' : Number(v).toFixed(d == null ? 1 : d);
 const need = (v, unit) => v == null ? 'no se alcanza el criterio' : 'el criterio exige al menos ' + String(v).replace('.', ',') + unit;
 if(id === 'CHESS_COLOR_ASYMMETRY'){
  if(r === 'insufficient_sample') return f(m.decidedCount, 0) + ' partidas decididas observadas; ' + need(k.minDecided, '') + '.';
  if(r === 'effect_below_threshold') return 'Diferencia observada entre colores: ' + f(m.diffPp) + ' pp; ' + need(k.minDiffPp, ' pp') + '.';
  if(r === 'interval_includes_zero') return 'El intervalo de confianza 95% de la diferencia [' + f(m.diffCiLower, 0) + ', ' + f(m.diffCiUpper, 0) + '] pp incluye 0.';
  if(r === 'data_unavailable') return 'Falta al menos un color con partidas decididas en la ventana.';
 }
 if(id === 'CHESS_COLOR_ASYMMETRY_LONGITUDINAL'){
  const sg = v => v == null ? '—' : (v > 0 ? '+' : '') + f(v, 0);
  if(r === 'insufficient_sample') return 'Decididas: blancas ' + f(m.whiteDecided, 0) + ', negras ' + f(m.blackDecided, 0) + '; días con actividad: ' + f(m.activeDays, 0) + '. ' + (k.minDecidedPerColor != null && k.minActiveDays != null ? 'El criterio exige al menos ' + k.minDecidedPerColor + ' decididas por color y ' + k.minActiveDays + ' días con actividad.' : 'No se alcanza el criterio.');
  if(r === 'span_too_short') return 'El historial de ajedrez cubre ' + f(m.totalDays, 0) + ' días; ' + need(k.minSpanDays, '') + '.';
  if(r === 'effect_below_threshold') return 'Diferencia observada entre colores: ' + f(m.diffPp) + ' pp; ' + need(k.minDiffPp, ' pp') + '.';
  if(r === 'interval_includes_zero') return 'El intervalo de confianza 95% de la diferencia global [' + f(m.diffCiLower, 0) + ', ' + f(m.diffCiUpper, 0) + '] pp incluye 0.';
  if(r === 'persistence_not_met') return 'La diferencia no se mantiene con el mismo signo en las dos mitades del historial: ' + sg(m.h1DiffSigned) + ' pp en la primera y ' + sg(m.h2DiffSigned) + ' pp en la segunda (blancas − negras); ' + need(k.minEraDiffPp, ' pp') + ' en ambas.';
  if(r === 'data_unavailable') return 'Falta información en el historial: fechas, o algún color sin partidas decididas en alguna de las dos mitades.';
 }
 if(id === 'CHESS_RATING_JUMP'){
  if(r === 'effect_below_threshold') return 'Cambio de ELO observado: ' + f(m.ratingDelta, 0) + ' puntos; ' + need(k.minAbsDelta, '') + '.';
  if(r === 'data_unavailable') return 'No hay ELO observado al inicio o dentro de la ventana (ninguna partida con ELO).';
 }
 if(id === 'LANG_XP_ACCELERATION'){
  if(r === 'span_too_short') return 'La ventana cubre ' + f(m.intervalDays, 0) + ' días; ' + need(k.minDays, '') + '.';
  if(r === 'insufficient_sample') return f(m.xpGained, 0) + ' XP ganados en la ventana; ' + need(k.minXp, '') + '.';
  if(r === 'effect_below_threshold') return 'XP diario observado: ' + f(m.ratio) + '× la media histórica; ' + need(k.minRatio, '×') + '.';
  if(r === 'data_unavailable') return 'No hay media histórica de referencia.';
 }
 return {insufficient_sample:'Muestra insuficiente.', effect_below_threshold:'El efecto observado no alcanza el criterio.', interval_includes_zero:'El intervalo de confianza incluye 0.', persistence_not_met:'El efecto no se mantiene en ambas mitades del historial.', span_too_short:'La ventana es demasiado corta.', data_unavailable:'Faltan datos necesarios.'}[r] || r;
}
function evalObserved(id, m){
 const f = (v, d) => Number(v).toFixed(d == null ? 1 : d);
 if(id === 'CHESS_COLOR_ASYMMETRY' && m.whiteWinRate != null && m.blackWinRate != null) return 'Blancas ' + f(m.whiteWinRate) + '% · Negras ' + f(m.blackWinRate) + '% (' + m.decidedCount + ' partidas decididas)';
 if(id === 'CHESS_COLOR_ASYMMETRY_LONGITUDINAL' && m.whiteWinRate != null && m.blackWinRate != null) return 'Blancas ' + f(m.whiteWinRate) + '% · Negras ' + f(m.blackWinRate) + '% (' + m.whiteDecided + ' y ' + m.blackDecided + ' decididas' + (m.totalDays != null ? ', ' + m.totalDays + ' días' : '') + ')';
 if(id === 'CHESS_RATING_JUMP' && m.baselineRating != null && m.currentRating != null) return 'ELO ' + m.baselineRating + ' → ' + m.currentRating + ' (' + m.gamesCount + ' partidas)';
 if(id === 'LANG_XP_ACCELERATION' && m.dailyRate != null){
  // a historical rate of 0 means "no reference" (data_unavailable), not an observed 0 XP/day
  const ref = m.historicalRate > 0 ? ' vs ' + f(m.historicalRate, 0) + ' XP/día histórico' : '; no hay referencia histórica disponible';
  return f(m.dailyRate, 0) + ' XP/día en la ventana' + ref + ' (+' + m.xpGained + ' XP)';
 }
 return '';
}
function renderEvaluationCard(e, state, finding, win){
 const meta = EVAL_META[e.id] || {title: e.id, scope: ''};
 const m = e.metrics || {};
 if(m.startedAt && m.endedAt) win = String(m.startedAt).slice(0, 10) + ' → ' + String(m.endedAt).slice(0, 10); // the evaluation's own window wins over the response's
 let body;
 if(state === 'AFIRMADO' && finding){
  body = '<div style="font-size:13px;font-weight:600;color:#c8d7ea;margin-bottom:6px">' + esc(finding.claim) + '</div>'
   + '<div class="muted" style="font-size:12px"><strong>Evidencia:</strong> ' + esc(finding.evidence) + '</div>';
 } else {
  const obs = evalObserved(e.id, m);
  body = (obs ? '<div style="font-size:13px;color:#c8d7ea;margin-bottom:4px"><strong>Observado:</strong> ' + esc(obs) + '</div>' : '')
   + '<div style="font-size:13px;font-weight:600;color:#c8d7ea;margin-bottom:4px">' + esc(EVAL_STATE_MSG[state]) + '</div>'
   + '<ul class="muted" style="font-size:12px;margin:0;padding-left:18px">' + (e.reasons || []).map(r => '<li>' + esc(evalReasonText(e, r)) + '</li>').join('') + '</ul>';
 }
 const basis = e.kind === 'statistical' ? 'con intervalo de confianza 95%' : 'umbral fijo, sin intervalo de confianza';
 return '<div class="card" style="margin-bottom:10px">'
  + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px">'
  + '<h3 style="margin:0;font-size:14px;color:#e6edf3">' + esc(meta.title) + '</h3>'
  + '<span><span class="' + EVAL_STATE_PILL[state] + '">' + state + '</span> <span class="pill pill-scope">' + esc(meta.scope) + '</span></span></div>'
  + body
  + '<div class="muted" style="font-size:11px;margin-top:6px">Ventana: ' + esc(win) + ' · ' + basis + '</div></div>';
}
// AFIRMADO first, then INDICIO, INSUFICIENTE, SIN INDICIO; findingFor(e) gives the claim/evidence of an emitted evaluation.
function evaluationCards(evals, findingFor, win){
 return evals.map(e => ({state: evalState(e), e})).sort((a, b) => EVAL_STATE_ORDER.indexOf(a.state) - EVAL_STATE_ORDER.indexOf(b.state))
  .map(x => renderEvaluationCard(x.e, x.state, findingFor(x.e), win));
}
function renderEvaluations(data){
 const findings = data.findings || [];
 const evals = data.evaluations || [];
 const win = data.interval ? String(data.interval.since).slice(0, 10) + ' → ' + String(data.interval.until).slice(0, 10) : '';
 const evalIds = new Set(evals.map(e => e.id));
 const cards = evaluationCards(evals, e => findings.find(f => f.id === e.id), win);
 // events (course switch, streak) are facts, not evaluations: they keep the finding card
 const events = findings.filter(f => !evalIds.has(f.id)).map(f => '<div class="card" style="margin-bottom:10px">'
  + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'
  + '<h3 style="margin:0;font-size:14px;color:#e6edf3">' + esc(f.title) + '</h3>'
  + '<span><span class="pill pill-win">EVENTO</span> <span class="pill pill-scope">' + esc(f.category.toUpperCase()) + '</span></span></div>'
  + '<div style="font-size:13px;font-weight:600;color:#c8d7ea;margin-bottom:6px">' + esc(f.claim) + '</div>'
  + '<div class="muted" style="font-size:12px"><strong>Evidencia:</strong> ' + esc(f.evidence) + '</div></div>');
 if(!cards.length && !events.length) return '';
 const head = evals.length ? 'Evaluaciones' : '🔎 Descubrimientos';
 const legend = evals.length ? '<div class="muted" style="font-size:12px;margin-bottom:10px">Qué se observó, con qué criterio y qué no se puede afirmar todavía.</div>' : '';
 return '<h2 style="margin:18px 0 10px;font-size:14px;letter-spacing:.05em;text-transform:uppercase;color:#8ea0b8">' + head + '</h2>' + legend + cards.concat(events).join('');
}

function renderWhatChanged(data){
 const elEmpty = q('#changesEmpty');
 const elFindings = q('#changesFindings');
 const elActivity = q('#changesActivity');

 if(!data || !data.chess || !data.languages || !data.streak){
  return;
 }

 const isEmpty = (!data.findings || data.findings.length === 0)
  && data.chess.gamesCount === 0
  && data.languages.xpGained === 0
  && data.languages.sessionsCount === 0;

 if(isEmpty){
  if(elEmpty){
   elEmpty.style.display = 'block';
   elEmpty.textContent = 'No hay actividad registrada entre ' + data.interval.since + ' y ' + data.interval.until + '.';
  }
  if(elFindings) elFindings.innerHTML = '';
  if(elActivity) elActivity.innerHTML = '';
  return;
 }

 if(elEmpty) elEmpty.style.display = 'none';

 if(elFindings) elFindings.innerHTML = renderEvaluations(data);

 if(elActivity){
  // Context for the evaluations above, not more insights: whatever an evaluation already states (rating change, colour split) is not repeated here.
  const c = data.chess, l = data.languages, s = data.streak;
  const row = (label, value) => '<div class="row"><span class="muted">' + label + '</span><b>' + value + '</b></div>';
  const block = (title, rows) => '<div><div class="muted" style="font-size:11px;letter-spacing:.05em;text-transform:uppercase;margin-bottom:4px">' + title + '</div>' + rows.join('') + '</div>';
  const xpText = l.xpGained > 0 ? '+' + l.xpGained.toLocaleString('es-ES') : String(l.xpGained);
  const courseText = l.courseChanged
   ? (esc(l.baselineCourseId || '—') + ' → ' + esc(l.currentCourseId || '—'))
   : esc(l.currentCourseId || '—');
  const streakDeltaText = s.streakDelta !== null ? (s.streakDelta > 0 ? '+' + s.streakDelta : String(s.streakDelta)) : '—';
  elActivity.innerHTML = '<div class="card">'
   + '<h2>Actividad en la ventana</h2>'
   + '<div class="muted" style="font-size:12px;margin-bottom:10px">Datos que contextualizan las evaluaciones.</div>'
   + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px">'
   + block('Ajedrez', [
      row('Partidas jugadas', c.gamesCount),
      row('Win rate en intervalo', c.intervalWinRate !== null ? c.intervalWinRate.toFixed(1) + '%' : '—'),
      row('Delta WR histórico', fmtDelta(c.historicalDelta))])
   + block('Idiomas', [
      row('XP ganado', xpText),
      row('Sesiones completadas', l.sessionsCount),
      row('Tiempo invertido', l.totalSessionMinutes + ' min'),
      row('Curso activo', courseText)])
   + block('Racha', [
      row('Racha actual', '🔥 ' + (s.currentStreak ?? '—')),
      row('Racha anterior', s.baselineStreak ?? '—'),
      row('Delta racha', streakDeltaText),
      '<div class="row"><span class="muted">Estado</span><span class="pill ' + (s.status === 'active' ? 'pill-win' : 'pill-loss') + '">' + s.status + '</span></div>'])
   + '</div></div>';
 }
}
init();
resumeSync();
</script></body></html>`;

export const RAW_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Raw · Meridian</title><style>body{font-family:monospace;background:#0e141c;color:#e6edf3;padding:24px}pre{background:#131f33;padding:12px;border-radius:8px;overflow:auto;border:1px solid #1e2e44}a{color:#7aa7e6}</style></head><body>
<p><a href="/">← Volver al dashboard</a></p><h1>Raw snapshots · debug</h1><div id="l"></div><pre id="d">selecciona un snapshot…</pre><script>
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
async function init(){const d=await (await fetch('/api/snapshots')).json();
document.querySelector('#l').innerHTML=d.snapshots.map(s=>{const countLabel=s.games_count!=null?(s.games_count+' games'):(s.source==='duolingo-lang'?'languages':s.source); return '<div><button onclick="show('+esc(JSON.stringify(s.id))+')" style="background:#1e2e44;color:#e6edf3;border:1px solid #2a3d56;border-radius:6px;padding:4px 8px;cursor:pointer;margin:2px">'+esc(s.created_at.slice(0,19))+' · '+esc(countLabel)+' · '+esc(s.checksum.slice(0,12))+'</button> '+esc(s.source)+'</div>';}).join('');}
async function show(id){const d=await (await fetch('/api/snapshots/'+encodeURIComponent(id)+'?raw=1')).json();document.querySelector('#d').textContent=JSON.stringify(JSON.parse(d.raw_json),null,1).slice(0,20000);}
init();</script></body></html>`;

export function escapeHtml(str: string | null | undefined): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface HeroCardOptions {
  id?: string;
  title?: string;
  badge?: string;
  primary?: string;
  secondary?: string;
  progress?: { current: number; total: number; label?: string; unit?: string } | null;
  meta?: string;
}

export function renderHeroCard(opts: HeroCardOptions): string {
  let progressHtml = '';
  if (opts.progress) {
    const { current, total, label = 'Progreso', unit = 'unidades' } = opts.progress;
    const pct = total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)).toFixed(1) : '0';
    progressHtml = `
    <div style="margin-top:12px">
     <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:12px;margin-bottom:4px">
      <span class="muted">${escapeHtml(label)}</span>
      <span style="font-weight:600">${escapeHtml(String(current))} / ${escapeHtml(String(total))} ${escapeHtml(unit)} (${pct}%)</span>
     </div>
     <div class="progress-bar"><div style="width:${pct}%"></div></div>
    </div>`;
  }
  return `<div class="hero-card"${opts.id ? ` id="${escapeHtml(opts.id)}"` : ''}>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
   <div>
    ${opts.title ? `<div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em">${escapeHtml(opts.title)}</div>` : ''}
    ${opts.primary ? `<div style="font-size:24px;font-weight:800;margin-top:2px;line-height:1.2">${opts.primary}</div>` : ''}
    ${opts.secondary ? `<div class="muted" style="font-size:13px;margin-top:4px">${opts.secondary}</div>` : ''}
   </div>
   ${opts.badge ? `<div>${opts.badge}</div>` : ''}
  </div>
  ${progressHtml}
  ${opts.meta ? `<div style="margin-top:14px;padding-top:12px;border-top:1px solid #1e2e44;font-size:12px;color:#8ea0b8">${opts.meta}</div>` : ''}
 </div>`;
}

export function renderProgressBar(opts: {
  current?: number;
  total?: number;
  label?: string;
  unit?: string;
  showPercent?: boolean;
}): string {
  const current = Number(opts.current) || 0;
  const total = Number(opts.total) || 0;
  const unit = opts.unit || 'unidades';
  const showPercent = opts.showPercent !== false;
  const pct = total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)).toFixed(1) : '0';
  return `<div style="margin-top:6px">
  ${opts.label ? `<div style="display:flex;justify-content:space-between;align-items:baseline;font-size:12px;margin-bottom:4px">
   <span class="muted">${escapeHtml(opts.label)}</span>
   <span style="font-weight:600">${current} / ${total} ${escapeHtml(unit)}${showPercent ? ` (${pct}%)` : ''}</span>
  </div>` : ''}
  <div class="progress-bar"><div style="width:${pct}%"></div></div>
 </div>`;
}

export function renderDistributionBar(opts: {
  wins?: number;
  losses?: number;
  draws?: number;
  label?: string;
  meta?: string;
}): string {
  const wins = Number(opts.wins) || 0;
  const losses = Number(opts.losses) || 0;
  const draws = Number(opts.draws) || 0;
  const total = wins + losses + draws;
  const wP = total > 0 ? (wins / total * 100).toFixed(1) : '0';
  const lP = total > 0 ? (losses / total * 100).toFixed(1) : '0';
  const dP = total > 0 ? Math.max(0, 100 - parseFloat(wP) - parseFloat(lP)).toFixed(1) : '0';
  return `<div style="margin-top:6px">
  ${(opts.label || opts.meta) ? `<div style="display:flex;justify-content:space-between;align-items:baseline;font-size:12px;margin-bottom:4px">
   ${opts.label ? `<span class="muted">${escapeHtml(opts.label)}</span>` : '<span></span>'}
   ${opts.meta ? `<span class="muted" style="font-size:11px">${escapeHtml(opts.meta)}</span>` : '<span></span>'}
  </div>` : ''}
  <div class="distribution-bar" title="${wins}W · ${losses}L · ${draws}D (${total} partidas)">
   <i class="bar-win" style="width:${wP}%" title="Victorias: ${wins}"></i>
   <i class="bar-loss" style="width:${lP}%" title="Derrotas: ${losses}"></i>
   <i class="bar-draw" style="width:${dP}%" title="Tablas: ${draws}"></i>
  </div>
 </div>`;
}

export function renderActivityStrip(opts: {
  id?: string;
  label?: string;
  summary?: string;
  days?: Array<{
    date: string;
    dayLetter?: string;
    bottomLabel?: string;
    active?: boolean;
    color?: string;
    tooltip?: string;
  }>;
}): string {
  const days = opts.days || [];
  const dotsHtml = days.map(d => {
    const bg = d.active ? (d.color || '#2ea043') : '#1e2e44';
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px" title="${escapeHtml(d.tooltip || d.date)}">
     <span class="muted" style="font-size:11px">${escapeHtml(d.dayLetter || '')}</span>
     <div style="width:20px;height:20px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center"></div>
     <span class="muted" style="font-size:10px">${escapeHtml(d.bottomLabel || '—')}</span>
    </div>`;
  }).join('');
  return `<div class="card"${opts.id ? ` id="${escapeHtml(opts.id)}"` : ''}>
  <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
   <h3 style="margin:0;font-size:13px;color:#c8d7ea">${escapeHtml(opts.label || '')}</h3>
   ${opts.summary ? `<span class="muted" style="font-size:11px">${escapeHtml(opts.summary)}</span>` : ''}
  </div>
  <div class="activity-strip">${dotsHtml}</div>
 </div>`;
}

export function renderMethodologyDisclosure(opts: {
  id?: string;
  title?: string;
  items?: Array<{ term: string; desc: string }>;
  links?: Array<{ href: string; text: string; target?: string }>;
}): string {
  const items = opts.items || [];
  const links = opts.links || [];
  const itemsHtml = items.map(it => `<p style="margin:6px 0"><b>${escapeHtml(it.term)}:</b> ${escapeHtml(it.desc)}</p>`).join('');
  const linksHtml = links.map(l => `<a href="${escapeHtml(l.href)}"${l.target ? ` target="${escapeHtml(l.target)}"` : ''} class="pill" style="margin-right:6px">${escapeHtml(l.text)}</a>`).join('');
  return `<details class="methodology-disclosure"${opts.id ? ` id="${escapeHtml(opts.id)}"` : ''} style="margin-top:16px;margin-bottom:16px">
  <summary style="cursor:pointer;font-weight:600;font-size:13px;color:#8ea0b8">${escapeHtml(opts.title || '¿Cómo sabemos esto?')}</summary>
  <div style="margin-top:10px;font-size:12px;line-height:1.5;color:#8ea0b8">
   ${itemsHtml}
   ${links.length ? `<div style="margin-top:10px">${linksHtml}</div>` : ''}
  </div>
 </details>`;
}

export function formatMatchDate(playedAt?: number | null, firstSeenAt?: string | null): string {
  if (playedAt && Number.isFinite(playedAt)) {
    const d = new Date(playedAt * 1000);
    const day = d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    const time = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    return `${day} · ${time}`;
  }
  if (firstSeenAt) {
    const d = new Date(firstSeenAt);
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  }
  return "—";
}

export interface CanonicalRoute {
  tab: "overview" | "languages" | "chess" | "changes" | "trajectory";
  courseId: string | null;
  canonicalPath: string;
  canonicalHash: string;
  hasLegacyQuery: boolean;
}

export type ParsedRoute = CanonicalRoute;

export function parseCanonicalRoute(
  pathOrHash?: string | null,
  hashOrSearch?: string | null,
  searchQuery?: string | null
): CanonicalRoute {
  let pathname = "";
  let hash = "";
  let search = "";

  if (searchQuery !== undefined) {
    pathname = (pathOrHash || "").trim();
    hash = (hashOrSearch || "").trim();
    search = (searchQuery || "").trim();
  } else if (hashOrSearch !== undefined) {
    const first = (pathOrHash || "").trim();
    const second = (hashOrSearch || "").trim();
    if (first.startsWith("#")) {
      hash = first;
      search = second;
    } else {
      pathname = first;
      if (second.startsWith("#")) {
        hash = second;
      } else {
        search = second;
      }
    }
  } else {
    const raw = (pathOrHash || "").trim();
    if (raw.startsWith("#")) {
      hash = raw;
    } else {
      pathname = raw;
    }
  }

  const sp = new URLSearchParams(search && search.startsWith("?") ? search.slice(1) : search || "");
  const leg = sp.get("course")?.trim() || null;
  const hasLegacyQuery = Boolean(leg);

  let target = "";
  if (hash && hash !== "#" && hash !== "#/" && hash !== "#overview") {
    target = hash;
  } else if (pathname && pathname !== "/" && pathname !== "/index.html") {
    target = pathname;
  } else if (hash) {
    target = hash;
  }

  let ch = target.trim();
  while (ch.startsWith("/") || ch.startsWith("#")) {
    ch = ch.slice(1);
  }
  const parts = ch.split("/");
  const seg = parts[0] || "";
  const sub = parts.slice(1).join("/").trim() || null;

  if (!ch || seg === "overview") {
    return { tab: "overview", courseId: null, canonicalPath: "/overview", canonicalHash: "#/overview", hasLegacyQuery };
  }
  if (seg === "chess") {
    return { tab: "chess", courseId: null, canonicalPath: "/chess", canonicalHash: "#/chess", hasLegacyQuery };
  }
  if (seg === "changes") {
    return { tab: "changes", courseId: null, canonicalPath: "/changes", canonicalHash: "#/changes", hasLegacyQuery };
  }
  if (seg === "trajectory") {
    return { tab: "trajectory", courseId: null, canonicalPath: "/trajectory", canonicalHash: "#/trajectory", hasLegacyQuery };
  }
  if (seg === "languages") {
    const cid = sub || leg || null;
    return {
      tab: "languages",
      courseId: cid,
      canonicalPath: cid ? `/languages/${encodeURIComponent(cid)}` : "/languages",
      canonicalHash: cid ? `#/languages/${encodeURIComponent(cid)}` : "#/languages",
      hasLegacyQuery,
    };
  }
  if (seg.startsWith("DUOLINGO_")) {
    return {
      tab: "languages",
      courseId: seg,
      canonicalPath: `/languages/${encodeURIComponent(seg)}`,
      canonicalHash: `#/languages/${encodeURIComponent(seg)}`,
      hasLegacyQuery,
    };
  }
  return { tab: "overview", courseId: null, canonicalPath: "/overview", canonicalHash: "#/overview", hasLegacyQuery };
}

export const parseRoute = parseCanonicalRoute;


