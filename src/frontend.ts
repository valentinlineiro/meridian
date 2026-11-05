import CLIENT_JS from "./dashboard.client.js";
import CLIENT_CSS from "./dashboard.client.css";

// A wrangler config without the Text rule for *.client.js bundles it as a module and this import is not a string:
// fail at startup (the deploy is rejected) instead of serving a page whose script is "undefined".
if (typeof CLIENT_JS !== "string" || typeof CLIENT_CSS !== "string") throw new Error("dashboard.client.js and .css must be imported as text: add the wrangler rule {type:'Text', globs:['**/*.client.js', '**/*.client.css'], fallthrough:false}");

export const DASHBOARD_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Meridian</title><style>${CLIENT_CSS}</style></head><body>
<header>
  <div class="h-left"><h1>Meridian</h1><small id="syncMeta">—</small></div>
</header>
<main class="shell">
<nav class="side" aria-label="Secciones">
<button class="side-toggle" id="sideToggle" type="button" onclick="toggleSideNav()" aria-expanded="false" aria-controls="sideMenu"><span id="sideCurrent">Hoy</span><span aria-hidden="true">▾</span></button>
<div class="side-menu" id="sideMenu">
<div class="side-group">Resumen</div>
<button class="side-item active" id="tabBtnOverview" onclick="showTab('overview')">Hoy</button>
<button class="side-item" id="tabBtnChanges" onclick="showTab('changes')">Qué cambió</button>
<button class="side-item" id="tabBtnTrajectory" onclick="showTab('trajectory')">Trayectoria</button>
<div class="side-group">Dominios</div>
<button class="side-item" id="tabBtnChess" onclick="showTab('chess')">Ajedrez</button>
<button class="side-item" id="tabBtnLang" onclick="showTab('languages')">Idiomas</button>
<button class="side-item" id="tabBtnGames" onclick="showTab('games')">LinkedIn Games</button>
<div class="side-group">Cuenta</div>
<button id="syncBtn" class="btn btn-p side-sync" onclick="doSync()" aria-describedby="syncScopeHint" title="Sincroniza cuentas conectadas (Duolingo). LinkedIn Games es registro manual.">Sincronizar</button>
<div class="muted side-note" id="syncScopeHint" style="font-size:11px;margin-top:2px;line-height:1.3">Fuentes conectadas (Duolingo) · Games manual</div>
<small id="syncNote" class="muted side-note"></small>
<a class="side-item" href="/settings">Configuración</a>
<form method="post" action="/logout" style="margin:0"><button class="side-item" type="submit">Salir</button></form>
</div>
</nav>
<div class="content">
<section id="overviewTab" class="tab-panel active">
 <div class="hero-card" id="overviewHero">
  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
   <div>
    <h2 style="margin:0;font-size:18px">Tu actividad</h2>
    <div class="muted" style="font-size:12px;margin-top:2px" id="overviewSyncMeta">Pulso unificado y verificado por dominio</div>
   </div>
   <span style="display:flex;align-items:center;gap:6px;max-width:100%"><span id="overviewStreak" class="pill pill-win" style="font-size:13px;font-weight:700;white-space:normal;max-width:100%">Duolingo · 🔥 —</span></span>
  </div>
 </div>

 <h2 style="margin:18px 0 10px;font-size:14px;letter-spacing:.05em;text-transform:uppercase;color:#8ea0b8">Estado por dominio</h2>
 <div class="grid3" id="overviewDomainsGrid">
  <div class="card" id="overviewLangCard">
   <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
    <h3 style="margin:0;font-size:15px;color:#e6edf3">Idiomas</h3>
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
    <h3 style="margin:0;font-size:15px;color:#e6edf3">Ajedrez</h3>
    <button class="btn btn-g" onclick="showTab('chess')" style="font-size:12px;padding:4px 10px">Ver Ajedrez →</button>
   </div>
   <div>
    <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em">ELO observado</div>
    <div id="overviewChessElo" style="font-size:24px;font-weight:800;line-height:1.2">—</div>
    <div id="overviewChessEloMeta" class="muted" style="font-size:11px;margin-top:2px"></div>
   </div>
   <div style="margin-top:10px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:12px;margin-bottom:4px">
     <span class="muted" id="overviewChessWrLabel">% de victorias (historial completo, todos los rivales)</span>
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

  <div class="card" id="overviewGamesCard">
   <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
    <h3 style="margin:0;font-size:15px;color:#e6edf3">LinkedIn Games</h3>
    <button class="btn btn-g" onclick="showTab('games')" style="font-size:12px;padding:4px 10px">Ver LinkedIn Games →</button>
   </div>
   <div>
    <div id="overviewGamesStreakLabel" class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em">Racha actual</div>
    <div id="overviewGamesStreak" style="font-size:24px;font-weight:800;line-height:1.2">—</div>
    <div id="overviewGamesMeta" class="muted" style="font-size:11px;margin-top:2px"></div>
   </div>
   <div style="margin-top:12px;padding-top:10px;border-top:1px solid #1e2e44;display:flex;justify-content:space-between;align-items:center">
    <span class="muted" style="font-size:12px">Registro <span class="pill pill-scope">MANUAL</span></span>
    <span id="overviewGamesHistorical" class="muted" style="font-size:12px">—</span>
   </div>
  </div>
 </div>

 <h2 style="margin:18px 0 10px;font-size:14px;letter-spacing:.05em;text-transform:uppercase;color:#8ea0b8">Tu semana</h2>
 <div class="grid3">
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
  <div class="card" id="overviewGamesWeekCard">
   <div style="display:flex;justify-content:space-between;align-items:baseline">
    <h3 style="margin:0;font-size:13px;color:#c8d7ea">Games · últimos 7 días <span class="pill pill-scope">MANUAL</span></h3>
    <span id="overviewGamesWeekSummary" class="muted" style="font-size:11px">—</span>
   </div>
   <div class="activity-strip" id="overviewGamesWeek"></div>
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
    <span id="chessHeroWrLabel" style="font-weight:600">% de victorias (historial completo, todos los rivales)</span>
    <span id="chessHeroDistMeta" class="muted" style="font-size:11px">—</span>
   </div>
   <div class="distribution-bar" id="chessHeroDist">
    <i class="bar-win" style="width:0%"></i>
    <i class="bar-loss" style="width:0%"></i>
    <i class="bar-draw" style="width:0%"></i>
   </div>
  </div>
 </div>
  <nav class="cindex" aria-label="Secciones de ajedrez"><button class="btn btn-g" onclick="jumpChess('cg-comp')">Comparativa</button><button class="btn btn-g" onclick="jumpChess('cg-open')">Aperturas</button><button class="btn btn-g" onclick="jumpChess('cg-evo')">Evolución</button><button class="btn btn-g" onclick="jumpChess('allMatchesCard')">Partidas</button></nav>
  <section class="kpis" id="kpis"></section>
 <div class="card" id="formCard" style="margin-top:12px"><h2>Forma actual</h2>
  <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:10px"><span class="muted">Últimas</span>
   <button class="btn btn-g" id="b20" onclick="setRecent(20)">20</button><button class="btn btn-g" id="b50" onclick="setRecent(50)">50</button><button class="btn btn-g" id="b100" onclick="setRecent(100)">100</button>
   <span class="muted" id="formMeta" style="margin-left:6px"></span></div>
  <div id="form"></div>
  <div class="muted" id="streak" style="margin-top:10px"></div></div>

 <div class="card" id="chessPatternsCard" style="margin-top:12px">
  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">
   <h2 style="margin:0">Patrones observados &amp; cobertura de análisis</h2>
   <span class="muted" style="font-size:11px">Intervalos Wilson al 95 % · Muestras explícitas (n)</span>
  </div>
  <div class="grid3" id="chessPatternsGrid" style="margin-top:10px">
   <div class="card" id="chessPatternColorCard" style="margin:0;background:#0d1522;border:1px solid #1e2e44">
    <div style="font-weight:600;font-size:13px;color:#8ea0b8;margin-bottom:4px">Rendimiento por color</div>
    <div id="chessPatternColorVal" style="font-size:16px;font-weight:700">—</div>
    <div id="chessPatternColorMeta" class="muted" style="font-size:11px;margin:4px 0 8px">—</div>
    <div id="chessPatternColorConclusion" style="font-size:11px;margin:0 0 8px"></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
     <button class="btn btn-g" style="font-size:11px;padding:3px 8px" onclick="filterMatchesAndScroll('color','white')">Blancas</button>
     <button class="btn btn-g" style="font-size:11px;padding:3px 8px" onclick="filterMatchesAndScroll('color','black')">Negras</button>
    </div>
   </div>
   <div class="card" id="chessPatternOppCard" style="margin:0;background:#0d1522;border:1px solid #1e2e44">
    <div style="font-weight:600;font-size:13px;color:#8ea0b8;margin-bottom:4px">Oponente (Bots vs PvP)</div>
    <div id="chessPatternOppVal" style="font-size:16px;font-weight:700">—</div>
    <div id="chessPatternOppMeta" class="muted" style="font-size:11px;margin:4px 0 8px">—</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
     <button class="btn btn-g" style="font-size:11px;padding:3px 8px" onclick="filterMatchesAndScroll('type','bot')">Bots</button>
     <button class="btn btn-g" style="font-size:11px;padding:3px 8px" onclick="filterMatchesAndScroll('type','pvp')">PvP</button>
    </div>
   </div>
   <div class="card" id="chessPatternEngineCard" style="margin:0;background:#0d1522;border:1px solid #1e2e44">
    <div style="font-weight:600;font-size:13px;color:#8ea0b8;margin-bottom:4px">Cobertura Stockfish</div>
    <div id="chessEngineCoverageVal" style="font-size:16px;font-weight:700">—</div>
    <div id="chessEngineCoverageMeta" class="muted" style="font-size:11px;margin:4px 0 8px">Denominador: partidas guardadas en el historial (elegibles para análisis)</div>
    <div>
     <button class="btn btn-g" style="font-size:11px;padding:3px 8px" onclick="openEngineProfileSection()">Ver análisis de motor ▾</button>
    </div>
   </div>
  </div>
  <div id="chessPatternSuggested" class="muted" style="font-size:11px;margin-top:10px"></div>
 </div>

 <details class="cgroup" id="cg-comp" open><summary>Comparativa por color y oponente</summary>
 <div class="grid2">
  <div class="card" id="colCard"><h2>Rendimiento por color</h2><div id="colDiff" class="muted" style="margin-bottom:8px"></div><div id="col"></div></div>
  <div class="card" id="oppCard"><h2>Oponentes por familia</h2><div class="muted" style="font-size:11px;margin-bottom:6px">Las diferencias por familia de oponente no aíslan la dificultad del rival.</div><div id="oppMacro" class="muted" style="margin-bottom:8px"></div><div id="opp"></div></div>
 </div>
 </details>

 <details class="cgroup" id="cg-open" open><summary>Repertorio de aperturas &amp; fases</summary>
 <div class="card" id="matesCard" style="display:none"><h2>Cómo terminan tus mates</h2><div class="grid2"><div><div class="muted">Dados</div><div id="matesGiven"></div></div><div><div class="muted">Recibidos</div><div id="matesReceived"></div></div></div><div class="muted" id="matesNote" style="margin-top:8px"></div></div>
 <div class="card" id="threatsCard" style="display:none"><h2>Amenazas de mate</h2><div id="threatsMain"></div><div class="muted" id="threatsPhases" style="margin-top:8px"></div><div class="muted" id="threatsTrend" style="margin-top:4px"></div><div class="muted" id="threatsNote" style="margin-top:8px"></div><button class="btn btn-g" id="threatsMissedBtn" onclick="toggleMissedThreats()" style="margin-top:8px;display:none"></button></div>
 <div class="grid2">
  <div class="card" id="openingsCard"><h2>Repertorio de aperturas</h2><div id="openingsTabs" style="display:flex;gap:6px;margin-bottom:12px"><button class="btn btn-p" id="tabBtnBlancas" onclick="showOpeningTab('white')">Blancas</button><button class="btn btn-g" id="tabBtnNegras" onclick="showOpeningTab('black')">Negras</button></div><div id="openingsWhite"></div><div id="openingsBlack" style="display:none"></div><div class="muted" id="openingsPop" style="margin-top:8px"></div></div>
  <div class="card" id="phasesCard"><h2>Fases de partida</h2><div id="phasesBody"></div><div class="muted" id="phasesMeta" style="margin-top:8px"></div></div>
 </div>
 </details>

 <details class="cgroup" id="cg-evo" open><summary>Evolución & detalle</summary>
 <div class="grid2">
  <div class="card" id="evoCard"><h2>Evolución · ELO</h2><div class="muted" style="font-size:11px">ELO observado en sincronizaciones</div><div id="evo"></div><div class="muted" id="evoNote" style="margin-top:6px"></div></div>
  <div class="card" id="resCard"><h2>Resultados</h2><div id="res"></div><div class="muted" id="lossContext" style="margin-top:8px"></div><div class="muted" id="lossRateNote" style="margin-top:4px"></div><div class="muted" id="drawContext" style="margin-top:4px"></div></div>
 </div>
 <details id="eloDetails" class="card" style="margin-top:12px">
  <summary style="cursor:pointer;font-weight:600;font-size:13px;letter-spacing:.05em;text-transform:uppercase;color:#8ea0b8">ELO del rival <span id="eloSummaryMeta" class="muted" style="font-weight:400;text-transform:none"></span></summary>
  <div style="margin-top:12px" id="eloCard"><div id="elo"></div><div class="muted" id="eloNote" style="margin-top:6px"></div></div>
 </details>
 </details>

  <details class="cgroup" id="chessEngineProfileDetails" open>
   <summary style="cursor:pointer;font-weight:600;font-size:13px;color:#8ea0b8;padding:10px 0">Perfil de juego y análisis de motor (Stockfish) ▾</summary>
   <div id="chessEngineProfileContent">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin:8px 0 4px">
     <h2 style="margin:0;font-size:16px">Tu perfil de ajedrez</h2>
     <span class="muted" style="font-size:11px">Stockfish a profundidad 12</span>
    </div>
    <p class="muted" id="profileContext" style="margin:0 0 8px 0">Calculado con Stockfish sobre tus partidas guardadas.</p>
    <div class="kpis" id="profileKpis"></div>
    <p id="profileVerdict" class="prof-verdict"></p>
    <div class="card" id="profileCutCard"><h2>Antes y después de un corte</h2><div class="muted" style="margin-bottom:8px">Para un experimento: compara las partidas anteriores a una partida con las posteriores. Pega el id de la última partida de antes (lo ves en la URL del visor).</div><div class="filters"><input id="profileSinceInput" type="text" aria-label="Id de la partida de corte" placeholder="id de la partida de corte" style="width:100%;max-width:340px"><button class="btn btn-p" id="profileSinceApply" onclick="applyProfileSince()">Aplicar</button><button class="btn btn-g" id="profileSinceClear" onclick="clearProfileSince()">Quitar</button></div><div class="muted" id="profileSinceNote"></div><div id="profileCut"></div></div>
    <div class="grid2">
     <div class="card" id="profileQualityCard"><h2>Dónde cometes errores graves</h2><div class="muted" style="margin-bottom:8px">Por cada 100 jugadas tuyas. Menos es mejor.</div><div id="profilePhases"></div><h3 style="margin:12px 0 6px">Por color</h3><div id="profileColors"></div></div>
     <div class="card" id="profileTrendCard"><h2>Cómo evoluciona</h2><div class="muted" style="margin-bottom:8px">Evolución descriptiva: errores graves por 100 jugadas en bloques de 50 partidas seguidas, de las más antiguas a las más recientes. Cada bloque mezcla rivales y colores distintos, así que no demuestra mejora ni empeoramiento; pasa el cursor por una columna para ver sus partidas y jugadas.</div><div id="profileTrend"></div></div>
    </div>
    <div class="grid2">
     <div class="card" id="profileDecisiveCard"><h2>Cuándo se te escapan las derrotas</h2><div class="muted" style="margin-bottom:8px">Momento decisivo: la primera jugada tuya que convierte una posición jugable en una perdida.</div><div id="profileDecisive"></div></div>
     <div class="card" id="profileConversionCard"><h2>Ventajas y remontadas</h2><div class="muted" style="margin-bottom:8px">Ventaja sostenida: el motor te daba más de 3 peones durante 3 jugadas seguidas.</div><div id="profileConversion"></div></div>
    </div>
    <div class="card" id="profileReviewCard"><h2>Qué partidas revisar</h2><div class="muted">Partidas con al menos 20 jugadas tuyas, ordenadas por pérdida media por jugada (los errores graves se muestran como información adicional, no como criterio de orden). Pulsa una para abrirla en el visor.</div><h3 style="margin:12px 0 4px">Las que más te costaron</h3><div id="profileWorst"></div><h3 style="margin:12px 0 4px">Las mejor jugadas</h3><div id="profileBest"></div></div>
    <div class="muted" id="profileNote" style="margin-top:8px"></div>
   </div>
  </details>

 <div class="card" style="margin-top:14px" id="allMatchesCard">
  <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px"><h2>Partidas</h2><span class="muted" style="font-size:12px" id="chessMatchesSubtitle">Partidas recientes</span><a class="btn btn-g" style="font-size:11px;padding:3px 8px;margin-left:8px" href="/api/export/matches.csv" download>Exportar CSV</a></div>
  <div class="filters" id="matchChips">
   <div class="fgroup" role="group" aria-label="Rival"><span class="flabel">Rival</span><button class="btn btn-p" data-chip="type:" onclick="setChip('type','')">Todos</button><button class="btn btn-g" data-chip="type:bot" onclick="setChip('type','bot')">Bots</button><button class="btn btn-g" data-chip="type:pvp" onclick="setChip('type','pvp')">PvP</button></div>
   <div class="fgroup" role="group" aria-label="Resultado"><span class="flabel">Resultado</span><button class="btn btn-p" data-chip="result:" onclick="setChip('result','')">Todos</button><button class="btn btn-g" data-chip="result:win" onclick="setChip('result','win')">Victorias</button><button class="btn btn-g" data-chip="result:loss" onclick="setChip('result','loss')">Derrotas</button><button class="btn btn-g" data-chip="result:draw" onclick="setChip('result','draw')">Tablas</button></div>
   <div class="fgroup" role="group" aria-label="Color"><span class="flabel">Color</span><button class="btn btn-p" data-chip="color:" onclick="setChip('color','')">Todos</button><button class="btn btn-g" data-chip="color:white" onclick="setChip('color','white')">Blancas</button><button class="btn btn-g" data-chip="color:black" onclick="setChip('color','black')">Negras</button></div>
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
      <div class="card" id="langLimitsCard" style="margin-bottom:12px;background:#0d1829;border:1px solid #1c314e">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span style="color:#e3b341;font-size:13px" aria-hidden="true">⚠</span>
          <b style="font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#e6edf3">Lo que estos datos no pueden decir</b>
        </div>
        <div class="muted" style="font-size:12px;line-height:1.5">
          No miden comprensión auditiva, expresión oral, lectura ni competencia comunicativa real. XP, racha y lecciones completadas son métricas de actividad y avance curricular en la plataforma, no representan dominio lingüístico ni una evaluación de competencia real.
        </div>
      </div>
      <div class="card hero-card" id="langCourseHero" style="margin-bottom:12px">
        <div id="langHeroCard">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
            <div style="min-width:0;max-width:100%">
              <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em">Curso seleccionado</div>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span id="langCourseFlag" style="font-size:18px"></span>
                <select id="langCourseSelect" onchange="selectCourse(this.value)" style="flex:1 1 0;min-width:0;max-width:100%;text-overflow:ellipsis;background:#0d1b2a;color:#c8d7ea;border:1px solid #1e2e44;border-radius:6px;padding:4px 8px;font-size:16px;font-weight:700"></select>
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
        <div class="muted" id="langXpGapNote" style="font-size:11px;margin-top:6px"></div>
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
      <details class="cgroup" id="langCoursesDetails" style="margin-bottom:12px">
        <summary style="cursor:pointer;font-weight:600;font-size:13px;color:#8ea0b8;padding:10px 0">Tus Cursos <span id="langCoursesCount" class="muted" style="font-size:12px;margin-left:8px"></span></summary>
        <div class="card" style="margin-top:8px">
          <div id="langCoursesList"></div>
        </div>
      </details>

      <!-- Análisis y métricas longitudinales (Disclosure Progresivo) -->
      <details class="cgroup" id="langAnalyticsDetails" style="margin-bottom:12px">
        <summary style="cursor:pointer;font-weight:600;font-size:13px;color:#8ea0b8;padding:10px 0">Análisis y métricas longitudinales</summary>
        <!-- Cambios Observados (Longitudinal #16.9) -->
        <div class="card" id="langObservedChangesCard" style="margin:12px 0">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <h2 style="margin:0;font-size:13px;letter-spacing:.05em;text-transform:uppercase;color:#8ea0b8">Cambios observados</h2>
          </div>
          <div id="langObservedChangesBody">
            <div id="langObservedSynthesis" style="font-weight:700;font-size:14px;color:#c8d7ea;margin-bottom:8px">—</div>
            <div id="langObservedDimensions" style="display:grid;gap:8px;font-size:12px">
              <div id="langCurricularProgressBlock" class="observed-dim">
                <div style="font-weight:600;color:#8ea0b8">1. Avance curricular (Δ unidades con ΔtotalUnits = 0)</div>
                <div id="langCurricularProgressDetail" class="muted" style="margin-top:2px">—</div>
              </div>
              <div id="langCourseStructureBlock" class="observed-dim">
                <div style="font-weight:600;color:#8ea0b8">2. Estructura del curso (árbol curricular)</div>
                <div id="langCourseStructureDetail" class="muted" style="margin-top:2px">—</div>
              </div>
              <div id="langAccountActivityBlock" class="observed-dim">
                <div style="display:flex;justify-content:space-between;align-items:baseline">
                  <span style="font-weight:600;color:#8ea0b8">3. Actividad de cuenta (XP y sesiones)</span>
                  <span class="pill pill-scope" style="font-size:10px">CUENTA · NO ES COMPETENCIA</span>
                </div>
                <div id="langAccountActivityDetail" class="muted" style="margin-top:2px">—</div>
              </div>
            </div>
            <div id="langObservedDetail" style="display:none">No se detectaron reestructuraciones de árbol curricular en las sincronizaciones observadas.</div>
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
      </details>

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
        <h2 style="margin:0 0 4px">Unidades curriculares por nivel CEFR</h2>
        <div class="muted" style="font-size:11px;margin-bottom:10px">Mide unidades del árbol clasificadas por la fuente bajo cada nivel; no constituye evaluación ni certificación de competencia lingüística.</div>
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
   <section id="profileTab" class="tab-panel prof" hidden>
   </section>

   <section id="gamesTab" class="tab-panel" hidden>
    <div class="hero-card" id="gamesHero">
     <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
      <div>
       <div id="gamesHeroStreakLabel" class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em">LinkedIn Games · racha actual</div>
       <div style="display:flex;align-items:baseline;gap:8px;margin-top:2px"><span id="gamesHeroStreak" style="font-size:28px;font-weight:800;line-height:1">—</span></div>
       <div id="gamesHeroMeta" class="muted" style="font-size:12px;margin-top:4px">—</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
       <button class="btn btn-p" type="button" onclick="openGamesEntry()">Registrar resultado</button>
       <span id="gamesHeroDays" class="muted" style="font-size:12px">—</span>
      </div>
     </div>
     <div style="margin-top:14px"><div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Hoy · toca un juego para registrarlo</div><div id="gamesToday" class="chips"></div></div>
    </div>
    <div id="gamesNote" class="muted" role="status"></div>
    <div class="cindex" id="gamesRange" role="group" aria-label="Periodo de análisis"><span class="muted" style="align-self:center">Periodo</span><button type="button" class="btn btn-g" id="gr-7" aria-pressed="false" onclick="setGamesRange('7')">7 d</button><button type="button" class="btn btn-g" id="gr-28" aria-pressed="true" onclick="setGamesRange('28')">28 d</button><button type="button" class="btn btn-g" id="gr-90" aria-pressed="false" onclick="setGamesRange('90')">90 d</button><button type="button" class="btn btn-g" id="gr-all" aria-pressed="false" onclick="setGamesRange('all')">Todo</button></div>
    <details class="cgroup" id="cg-games-cmp" open><summary>Comparativa</summary>
     <div class="tblwrap"><table class="gtable" id="gamesTable"><caption class="sr-only">Comparativa de juegos en el periodo seleccionado. Los encabezados ordenan la tabla. Cada porcentaje y cada mediana muestran su n.</caption><thead id="gamesHead"></thead><tbody id="gamesRows"></tbody></table></div>
     <p class="muted">n = observaciones con media global usadas (eficiencia y % que gana a la media) o con tiempo (mediana y n final). Δ eficiencia = cambio relativo frente al periodo anterior equivalente, con n actual/anterior; «—» si no es comparable.</p>
    </details>
    <details class="cgroup" id="cg-games-traj" open><summary>Trayectoria</summary>
     <label class="muted" for="gamesTrajGame">Juego</label> <select id="gamesTrajGame" onchange="setGamesTrajGame(this.value)"></select>
     <div id="gamesChart" class="card"></div>
     <p class="muted" id="gamesChartNote"></p>
     <details class="gdata" id="gamesDataDetails"><summary>Ver los datos del gráfico (tabla)</summary>
      <div class="tblwrap"><table class="gtable" id="gamesDataTable" aria-describedby="gamesDataCaption"><caption id="gamesDataCaption" class="sr-only"></caption><thead><tr><th scope="col">Periodo</th><th scope="col">Eficiencia (mediana)</th><th scope="col">Gana a la media</th><th scope="col">n</th></tr></thead><tbody id="gamesDataRows"></tbody></table></div>
     </details>
    </details>
    <details class="cgroup" id="cg-games" open><summary>Por juego</summary><p class="muted" id="gamesInterpNote">La etiqueta compara con el ruido propio de cada juego (límites calibrados con datos reales) y solo se publica si se repite dos semanas seguidas. «Estable» significa «sin cambio detectable», no «sin cambio». Las flechas de la tabla solo existen en el periodo de 28 días.</p><div id="gamesList" class="grid2"></div></details>
   </section>
  <p class="muted" style="margin-top:16px"><a href="/raw">Datos técnicos</a></p>
</div>
</main>
<div id="gameModal" class="modal" style="display:none" role="dialog" aria-modal="true" aria-labelledby="gTitle">
 <div class="card gamecard">
  <div class="gamehead"><b id="gTitle"></b><button class="btn btn-g" id="gClose" onclick="closeGame()" aria-label="Cerrar">✕</button></div>
  <div id="gErr" class="muted"></div>
  <div id="gBody" style="display:none">
   <div class="gamegrid"><div id="gBoard" class="board"></div><div id="gMoves" class="moves"></div></div>
   <div id="gMissed" class="muted" style="margin-top:8px"></div>
   <div id="gErrors" class="muted" style="margin-top:8px"></div>
   <div class="gamectl"><button class="btn btn-g" id="gPrev" onclick="gameStep(-1)" aria-label="Jugada anterior">‹</button><span class="muted" id="gPos"></span><button class="btn btn-g" id="gNext" onclick="gameStep(1)" aria-label="Jugada siguiente">›</button><a class="btn btn-g" id="gPgn" download style="text-decoration:none;margin-left:auto">Descargar PGN</a></div>
  </div>
 </div>
</div>
<div id="lgModal" class="modal" style="display:none" role="dialog" aria-modal="true" aria-labelledby="lgTitle">
 <div class="card gamecard lgcard">
  <div class="gamehead"><b id="lgTitle">Registrar resultado</b><button class="btn btn-g" type="button" onclick="closeGamesEntry()" aria-label="Cerrar">✕</button></div>
  <div class="muted">Lo introduces tú; no se lee nada de LinkedIn. Tiempos como M:SS.</div>
  <label for="lgGame">Juego</label>
  <select id="lgGame"><option value="zip">Zip</option><option value="tango">Tango</option><option value="queens">Queens</option><option value="mini_sudoku">Mini Sudoku</option><option value="patches">Patches</option><option value="wend">Wend</option></select>
  <label for="lgDate">Fecha de la partida</label>
  <input id="lgDate" type="date" onchange="loadGamesDay()">
  <label for="lgScore">Tu tiempo (M:SS)</label>
  <input id="lgScore" type="text" inputmode="numeric" placeholder="0:08" autocomplete="off">
  <label for="lgAvg">Promedio de hoy (opcional)</label>
  <input id="lgAvg" type="text" inputmode="numeric" placeholder="0:17" autocomplete="off">
  <label for="lgNumber">Nº de puzzle (opcional)</label>
  <input id="lgNumber" type="number" min="1" step="1" inputmode="numeric">
  <button id="lgSave" type="button" class="btn btn-p lgsave" onclick="saveGamesResult()">Guardar</button>
  <div id="lgStatus" class="muted" role="status" style="margin-top:8px"></div>
  <h3 style="margin:14px 0 4px">Registrado ese día</h3>
  <ul id="lgDay" class="lgday"></ul>
 </div>
</div>
<script>${CLIENT_JS}</script></body></html>`;

export const RAW_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>Raw · Meridian</title><style>body{font-family:monospace;background:#0e141c;color:#e6edf3;padding:24px}pre{background:#131f33;padding:12px;border-radius:8px;overflow:auto;border:1px solid #1e2e44}a{color:#7aa7e6}</style></head><body>
<p><a href="/">← Volver al dashboard</a></p><h1>Raw snapshots · debug</h1><div id="l"></div><pre id="d">selecciona un snapshot…</pre><script>
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
async function init(){const d=await (await fetch('/api/snapshots')).json();
document.querySelector('#l').innerHTML=d.snapshots.map(s=>{const countLabel=s.games_count!=null?(s.games_count+' games'):(s.source==='duolingo-lang'?'languages':s.source); return '<div><button onclick="show('+esc(JSON.stringify(s.id))+')" style="background:#1e2e44;color:#e6edf3;border:1px solid #2a3d56;border-radius:6px;padding:4px 8px;cursor:pointer;margin:2px">'+esc(s.created_at.slice(0,19))+' · '+esc(countLabel)+' · '+esc(s.checksum.slice(0,12))+'</button> '+esc(s.source)+'</div>';}).join('');}
async function show(id){const d=await (await fetch('/api/snapshots/'+encodeURIComponent(id)+'?raw=1')).json();document.querySelector('#d').textContent=JSON.stringify(JSON.parse(d.raw_json),null,1).slice(0,20000);}
init();</script></body></html>`;
