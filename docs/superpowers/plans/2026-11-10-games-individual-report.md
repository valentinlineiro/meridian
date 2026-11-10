# Informe individual de LinkedIn Games (fase 1) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un informe por juego (modo informe de la ruta canónica `/games`, `/games/:game`) con regularidad arriba, calculado solo con lo que el resumen devuelve hoy.

**Architecture:** Mismo route y mismo componente `Games` que la lista (como `/languages/:courseId`): un `UrlMatcher` con parámetro `game`; el resumen se lee una vez y se reutiliza al pasar de lista a informe. La lógica de presentación es un módulo de funciones puras (`game-report.model.ts`, con tests); un componente nuevo `GameReport` pinta las cuatro secciones reutilizando `Section`, `Segmented`, `VerdictPill`, `Help` y `GamesChart`. Sin backend.

**Tech Stack:** Angular (signals, `input()` ligado a la ruta, `rxResource`), Vitest vía `ng test`, Playwright + axe (e2e).

**Spec:** `docs/superpowers/specs/2026-11-10-games-individual-report-design.md`

## Global Constraints

- Una ruta canónica por dominio (decisión 2026-11-04): `/games/:game` es la misma ruta y el mismo componente que `/games`; claves de juego sin puntos; clave desconocida → redirige a `/games`.
- Sin cambios de backend ni de contrato; el servidor calcula, la interfaz formatea.
- Se muestra el veredicto calibrado existente (`verdictFor(x.interpretation)`, pill con «Cómo se calcula»); **no se añade ningún veredicto nuevo ni hipótesis**.
- Vocabulario de `core/words.ts` (`PERIODS`, `typicalTime`, veredictos). «Sin señales de cambio» sigue siendo la etiqueta; «sin cambio detectable» solo en textos explicativos.
- Una feature no importa de otra (lint): lo compartido va en `core/` o `shared/`.
- Mínimo de 8 partidas por casilla de día de la semana (`MIN_LOSS_CELL`); semana completa = al menos 5 partidas (`MIN_WEEK_N`, convención de presentación, no umbral estadístico); la cláusula de semanas exige al menos 4 semanas completas.
- Un día «destaca» solo si el límite inferior de su intervalo de derrotas supera la tasa de derrotas global del juego.
- Cada cifra con periodo y `n` visibles; ningún dato solo en `title`; 44 px de objetivo táctil en móvil; 390 px sin desplazamiento horizontal.
- Español; tests con nombre `shouldXWhenY`; tests primero y vistos en rojo; un fallo de petición es «No disponible», nunca un cero.
- Un fallo en un bloque degrada solo ese bloque (`safe()` de `core/guard`).

## Review Focus

1. Clave de juego válida pero ausente del resumen (juego sin partidas): «Aún sin partidas registradas de {nombre}», sin redirigir y sin ceros (Task 4).
2. El resumen falla en modo informe: «No disponible», no un informe vacío (Task 4).
3. Juego con `datos_insuficientes` (Tango, Wend): sin veredicto más allá de «Aún pocos datos», se dice qué falta con `interpretationLines`, y el nivel sigue visible (Tasks 3 y 4).
4. Casilla con `n < 8` se muestra «—» con su `n`; juego con cero derrotas (Wend) no destaca ningún día y no divide por cero (Task 2).
5. Pasar de la lista al informe y cambiar de periodo no vuelve a pedir el resumen (Task 1/4).

---

### Task 1: Ruta `/games/:game` en el mismo componente

**Files:**
- Modify: `web/src/app/app.routes.ts`, `web/src/app/features/games/games.ts`, `web/src/app/features/games/games.html`
- Test: `web/src/app/app.routes.spec.ts`

**Interfaces:**
- Produces: `Games.game: InputSignal<string | undefined>` (param de ruta); en `games.html` el bloque `@if (game(); as g) {…modo informe…} @else {…lista actual…}`; título de ruta dinámico.

- [ ] **Step 1: Tests en `app.routes.spec.ts`** (patrón del test de `/languages/DUOLINGO_ES`):
  - `shouldKeepTheGameKeyWhenOpeningAGamesDeepLink`: `navigateByUrl('/games/queens')` → `Router.url === '/games/queens'` y existe `#gamesTab`.
  - `shouldRedirectToGamesWhenTheGameKeyIsUnknown`: `/games/nope` → `Router.url === '/games'`.
  - `shouldTitleTheRouteWithTheGameName`: tras `/games/queens`, `document.title === 'Queens · LinkedIn Games · Meridian'`; tras `/games`, `'LinkedIn Games · Meridian'`.
- [ ] **Step 2:** `cd web && npx ng test --include='src/app/app.routes.spec.ts' --watch=false` → los tres fallan.
- [ ] **Step 3:** En `app.routes.ts` sustituir la ruta `games` por `{ matcher: games, title: gamesTitle, loadComponent: … Games }`. `games: UrlMatcher` acepta `segs[0].path === 'games'` con `segs.length === 1`, o `=== 2` si `segs[1].path in GAME_NAMES` (importar `GAME_NAMES` de `core/words`), devolviendo `posParams: { game: segs[1] }`. `gamesTitle: ResolveFn<string>` lee `route.params['game']` y devuelve `` `${gameName(g)} · LinkedIn Games · Meridian` `` o `'LinkedIn Games · Meridian'`. Añadir antes del comodín `{ path: 'games/:other', redirectTo: 'games' }`. En `games.ts` añadir `readonly game = input<string>()`; en `games.html` envolver el contenido actual en la rama `@else` y, en la rama del informe, un `<h1>` con `gameName(game)` y un enlace «← Todos los juegos» a `/games` (el contenido real llega en la Task 4). Conservar `#gamesTab` en la raíz.
- [ ] **Step 4:** Mismo comando → pasan; `npx ng test --watch=false` (suite web) sin regresiones.
- [ ] **Step 5: Commit** `feat(games): /games/:game as report mode of the canonical route`.

### Task 2: Modelo de la regularidad (funciones puras)

**Files:**
- Create: `web/src/app/features/games/game-report.model.ts`
- Test: `web/src/app/features/games/game-report.model.spec.ts`

**Interfaces:**
- Consumes (de `games.model.ts`): `Game`, `Range`, `RANGE_NAMES`, `MIN_LOSS_CELL`, `gdays`; (de `core/words`) `typicalTime`.
- Produces:
  - `MIN_WEEK_N = 5`
  - `normalRange(x: Game, range: Range): { median: string; low: string; high: string; n: number; best: { time: string; date: string } } | null` (`null` si no hay mediana).
  - `weeklyBeat(x: Game): { weeks: { start: string; n: number; beat: number | null; complete: boolean }[]; completeCount: number; min: number | null; max: number | null }` (de `trajectory['90']`; `min/max` solo sobre semanas completas con `beat`).
  - `weekdayReport(x: Game): { rows: { day: string; n: number; losses: number; wins: number; rate: number | null; lo: number | null; hi: number | null; enough: boolean; stands: boolean }[]; overallRate: number | null; standing: string[] }` (`dow 0` = lunes; `enough = n >= MIN_LOSS_CELL`; `overallRate = losses.losses / Σ cells.n`, `null` si Σ = 0; `stands = enough && rate != null && lo != null && overallRate != null && lo > overallRate`; `standing` = nombres en plural: lunes, martes, miércoles, jueves, viernes, sábados, domingos).
  - `reportSentence(x: Game, range: Range): string[]` (cláusulas de hechos, abajo).

- [ ] **Step 1: Tests** con fixtures sintéticos de `Game` (solo los campos usados):
  - `normalRange`: `time {median: 43, p25: 36.75, p75: 52, nTime: 28}`, `best {seconds: 19, date: '2026-09-28'}` → `{ median: '0:43', low: '0:37', high: '0:52', n: 28, best: { time: '0:19', date: '2026-09-28' } }`; `median: null` → `null`.
  - `weeklyBeat`: buckets `[{n:4,beat:.75},{n:7,beat:.86},{n:7,beat:1},{n:7,beat:.71},{n:2,beat:.5}]` → `completeCount 3`, `min .71`, `max 1`, y el primero y el último con `complete: false`.
  - `weekdayReport`: lunes `{n:26, losses:14, lo:.3546, hi:.7124, rate:.538}`, martes `{n:26, losses:5, lo:.085, …}`, jueves `{n:5, losses:2}`, total de derrotas 31 sobre Σn=176 → lunes `{wins:12, enough:true, stands:true}`, martes `stands:false`, jueves `{enough:false, stands:false}`; `standing === ['lunes']`.
  - `shouldNotDivideByZeroWhenAGameHasNoLosses`: `losses {losses:0, cells: todas n>0 y rate 0}` → `overallRate 0`, `standing []`; `cells: []` → `overallRate null`, `rows` de 7 días con `n 0`.
  - `reportSentence`, periodo `'28'`: `beat {k:24, nBeat:28, rate:.857}` → primera cláusula `'Le ganas a la media el 86 % de los días (24 de 28, las últimas 4 semanas)'`; con 12 semanas completas entre .71 y 1 → `'En las 12 semanas completas, entre el 71 % y el 100 % de los días'`; con `standing ['lunes','miércoles']` → `'Se pierde más los lunes y los miércoles'` (con 3: `'los lunes, los martes y los jueves'`); con 3 semanas completas la segunda cláusula no aparece; sin días que destaquen, la tercera no aparece; sin `beat.rate` devuelve `[]`.
- [ ] **Step 2:** `cd web && npx ng test --include='src/app/features/games/game-report.model.spec.ts' --watch=false` → fallan (módulo inexistente).
- [ ] **Step 3: Implementar** las cuatro funciones y la constante con las firmas de arriba en `game-report.model.ts`. Porcentajes con `Math.round(r * 100) + ' %'`; reutilizar `typicalTime` para el formato `m:ss`; las cláusulas siguen el orden 1, 2, 3 y cada una exige su condición de las Global Constraints.
- [ ] **Step 4:** mismo comando → pasan.
- [ ] **Step 5: Commit** `feat(games): regularity model of the individual report`.

### Task 3: Modelo del nivel, la evolución y la evidencia

**Files:**
- Modify: `web/src/app/features/games/game-report.model.ts`, `web/src/app/features/games/games.model.ts` (añadir `firstDate?: string` a la interfaz `Game`: el servidor ya lo devuelve y el tipo no lo declara)
- Test: `web/src/app/features/games/game-report.model.spec.ts`

**Interfaces:**
- Consumes: Task 2 (mismo fichero), `interpretationLines(x: Game): string[]`, `PERIODS`, `speedWords`.
- Produces:
  - `levelRows(x: Game): { range: Range; label: string; median: string; band: string; speed: string; beat: string }[]` (periodos `7`, `28`, `90`, `all` con las etiquetas de `PERIODS`; `speed = '×' + efficiency con 2 decimales y coma`; `beat = 'k de n (r %)'`).
  - `evolutionFacts(x: Game, range: Range): { adjusted: Fact; recent: Fact; trend: Fact }` con `Fact = { title: string; value: string; note: string; detectable: boolean | null }`.
  - `evidenceLines(x: Game): string[]`.

- [ ] **Step 1: Tests:**
  - `levelRows` con `windows` de 7/28/90/all (`time {43, 36.75, 52}`, `eff.median 2.0375`, `beat {k:24, nBeat:28, rate:.857}`) → fila `'28'`: `{ label: '4 semanas', median: '0:43', band: '0:37–0:52', speed: '×2,04', beat: '24 de 28 (86 %)' }`.
  - `evolutionFacts`: `adjusted {label:'sin_cambio', windows['28'].pct: 6.09, trend:{noise:[-4.7,4.06]}}` → `adjusted: { value: '+6 %', detectable: false, note: 'sin cambio detectable · ruido −5 % a +4 %' }`; `label:'mejora'` → `detectable: true`, nota «mejora detectable»; `label:'pocos_datos'` → `detectable: null`.
  - `recent28vBase56 {delta: -0.0676}` con `bands['28v56'] [-0.2423, 0.3495]` → `recent: { value: '−7 %', detectable: false, note: 'dentro del ruido de este juego (−24 % a +35 %)' }`; `delta -0.30` → `detectable: true`, «fuera del ruido»; `bands: null` → `detectable: null`, «sin límites calibrados».
  - `trend112 {rho: .058, slopePctPer28d: 2.32, n: 111}` con `rho112 [-0.1512, 0.1652]` → `trend: { value: '+2,3 % cada 4 semanas', detectable: false, note: 'estimada · sin cambio detectable · n = 111' }`; `rho: .30` y pendiente positiva → `detectable: true`; `rho: .30` con pendiente negativa → `detectable: false` (la regla del servidor exige el mismo signo).
  - `evidenceLines` incluye `'146 de 177 días mejor que la media (82 %), desde el 17 may 2026'` (de `windows.all.beat` y `firstDate`) y las líneas de `interpretationLines(x)`; con `interpretation.label === 'datos_insuficientes'` incluye el texto de qué falta (el de `interpretationLines`) y **no** afirma «sin cambio».
- [ ] **Step 2:** mismo comando que la Task 2 → fallan.
- [ ] **Step 3: Implementar** las tres funciones. `detectable` de `recent` y `trend` es una comparación con las bandas que envía el servidor (`interpretation.bands`), no una regla nueva; `adjusted` toma la etiqueta ya publicada (`adjusted.label`). Valores con signo y `−` tipográfico como el resto de `games.model.ts`.
- [ ] **Step 4:** pasan; suite web sin regresiones.
- [ ] **Step 5: Commit** `feat(games): level, evolution and evidence of the individual report`.

### Task 4: Componente `GameReport` y modo informe

**Files:**
- Create: `web/src/app/features/games/game-report.ts`, `web/src/app/features/games/game-report.html`
- Modify: `web/src/app/features/games/games.ts`, `web/src/app/features/games/games.html`
- Test: `web/src/app/features/games/game-report.spec.ts`, `web/src/app/features/games/games.spec.ts`

**Interfaces:**
- Consumes: Tasks 2 y 3; `Summary`, `Range`, `trajectory(s, game, '90')`, `gameName`, `gdays`; componentes `Section`, `Segmented`, `VerdictPill`, `Help`, `GamesChart`.
- Produces: `GameReport` (`selector: 'app-game-report'`) con `summary = input.required<Summary>()`, `game = input.required<string>()`, `range = input.required<Range>()`. En `Games`, el modo informe pinta el selector de periodo (`Segmented`, el mismo `range` de la lista) y `<app-game-report [summary]="summary()!" [game]="g" [range]="range()" />`; el resto de estados los resuelve `Games`.

- [ ] **Step 1: Tests** (`game-report.spec.ts` monta el componente con un `Summary` sintético de Queens; `games.spec.ts` usa el patrón existente de `HttpTestingController`):
  - Cabecera: `h1` «Queens» (presente también en los estados «No disponible» y «Aún sin partidas»), pill del veredicto de `interpretation` con un `Help` «Cómo se calcula» al lado (el texto de `interpretationLines`), y las cláusulas de `reportSentence` en `#gameReportSentence`.
  - `shouldApplyThePeriodOnlyToTheBlocksThatDependOnIt`: al pasar de `'28'` a `'7'` cambian el rango normal, la fila resaltada del nivel, la forma ajustada y los hechos de evolución; **no** cambian la tira semanal (90 días) ni el mapa por día (todo el histórico), y cada uno dice su ventana en su texto.
  - Regularidad: rango normal «0:37 – 0:52» con `n`, tira semanal con las semanas incompletas marcadas (`[data-complete=false]`), una fila por día con «14 de 26 · 54 %» y «12 victorias», racha actual y máxima, y el aviso de la referencia.
  - Nivel: tabla con 4 filas (7 días, 4 semanas, 3 meses, Todo).
  - Evolución: `GamesChart` con los buckets semanales de 90 días, tabla de datos del gráfico dentro de `Help`, y los tres hechos con «estimada»/«detectable» en texto visible (nada solo en `title`).
  - `shouldShowTheMissingDataInsteadOfAVerdictWhenTheGameHasTooFewResults` (Tango): pill «Aún pocos datos», texto de qué falta, nivel visible, sin sección de evolución.
  - `shouldSayNoGamesYetWhenTheKeyIsValidButTheSummaryHasNoSuchGame` → «Aún sin partidas registradas de Queens», sin redirigir.
  - `shouldSayNoDisponibleWhenTheSummaryFailsInReportMode` y `shouldNotRequestTheSummaryAgainWhenMovingBetweenTheListAndAReport`: una sola petición a `/api/me/linkedin-games/summary` al navegar `/games` → `/games/queens` y al cambiar de periodo.
  - Un bloque con datos malformados (p. ej. `trajectory` ausente) degrada solo ese bloque.
- [ ] **Step 2:** `cd web && npx ng test --include='src/app/features/games/*.spec.ts' --watch=false` → fallan.
- [ ] **Step 3: Implementar** `GameReport` (cuatro `app-section`: Regularidad, Nivel, Evolución, Qué sabemos y qué no; cada bloque calculado con `safe()`), y el cableado en `Games` (rama informe: «Aún sin partidas…» si `summary.games[g]` no existe, «No disponible» si `summary() === null`). Las advertencias del mapa por día reutilizan el texto de «Dónde pierdes». Estilos solo con tokens y las clases existentes (`.card`, `.prof-bar`, `.bar`, `.stats`, `.gtable`); añadir a `styles.css` únicamente lo imprescindible (tira semanal), sin colores literales ni `font-size` en px (lo vigila `tests/webDesignTokens.test.ts`).
- [ ] **Step 4:** pasan; `npx ng test --watch=false` completo y `npm run web:lint` sin errores.
- [ ] **Step 5: Commit** `feat(games): the individual game report`.

### Task 5: Enlaces, accesibilidad y verificación con datos reales

**Files:**
- Modify: `web/src/app/features/games/games.html` («Tus juegos»), `tests/e2e/a11y.spec.ts`
- Test: `web/src/app/features/games/games.spec.ts`

- [ ] **Step 1: Tests:** en `games.spec.ts`, `shouldLinkEachGameRowToItsReport`: el nombre de cada fila de «Tus juegos» es un enlace a `/games/{k}` con nombre accesible «Informe de {nombre}»; en `a11y.spec.ts` añadir `'/games/queens'` a `ROUTES` (axe sin violaciones y un solo `h1`).
- [ ] **Step 2:** `npx ng test --include='src/app/features/games/games.spec.ts' --watch=false` → falla el de enlaces.
- [ ] **Step 3:** Convertir el nombre de la fila en `<a [routerLink]="['/games', r.k]">` (importar `RouterLink` en `Games`), con objetivo táctil ≥ 44 px en móvil (regla existente de `.btn`/enlaces del menú; añadir solo si falta).
- [ ] **Step 4: Verificar:** `npm run typecheck`; `npx vitest run`; `npm run web:test`; `npm run web:lint`; `npx playwright test tests/e2e/a11y.spec.ts -g "WhenOngames|games/queens"` → todo en verde.
- [ ] **Step 5: Datos reales** (solo lectura): ventana de login de Playwright como en las revisiones anteriores; capturas de `/games/queens` y `/games/tango` a 390 y 1200 px; comprobar que la frase de la cabecera dice lo mismo que la maqueta («86 %», «12 semanas completas, entre el 71 % y el 100 %», «Se pierde más los lunes y los miércoles» solo si el intervalo lo permite), que no hay desplazamiento horizontal y que Tango muestra qué falta.
- [ ] **Step 6: Commit y PR** `feat(games): individual game report (phase 1)`; el PR enlaza la spec y este plan. No se mergea sin el «go» explícito del propietario.
