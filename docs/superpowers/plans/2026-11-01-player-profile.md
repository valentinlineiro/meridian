# Perfil de jugador Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Meridian evalúa cada partida con Stockfish (en el colector), guarda un resumen versionado por partida y muestra un perfil (calidad de juego, momentos decisivos, ventaja/remontada, revisión) con corte de experimento.

**Architecture:** Copia el patrón de `mate_threats`: columna JSON `engine_eval` (migración 0019), contrato versionado y validado en el servidor, rutas de máquina con `IMPORT_TOKEN`, script Node que consume la cola y un workflow del colector (apagado). La lógica de resumen es una función pura de dominio; el motor solo lo toca el script. El bucle de cola/reintentos de `scripts/analyzeThreats.ts` se extrae y lo comparten los dos scripts.

**Tech Stack:** TypeScript, Hono, D1 (SQLite en tests), vitest, chess.js, Stockfish.js 19.0.1 (WASM, un hilo, `Hash 16`).

**Spec:** `docs/superpowers/specs/2026-11-01-player-profile-design.md`

## Global Constraints

- Constantes v1, congeladas: profundidad 12; evaluación recortada a ±1000 cp desde el punto de vista del propietario, *antes* de calcular la pérdida (`max(0, antes − después)`); error grave = pérdida ≥ 300; fases por ply de mi jugada: apertura ≤ 20, medio ≤ 60, final > 60 (`phaseOfPly` de `src/domain/mateThreats.ts`); momento decisivo = primera jugada propia con antes > −150 y después ≤ −300; ventaja/desventaja sostenida = 3 posiciones consecutivas (todas las posiciones de la partida) ≥ +300 / ≤ −300; un mate se mapea a ±(10000 − distancia) y luego se recorta; la posición final con mate suma ±10000.
- Plies 1-based; la paridad del propietario: blancas impares, negras pares.
- El servidor asigna `v`; el cuerpo del colector no la lleva y los campos desconocidos se rechazan con 422.
- Ninguna nota global, radar ni "nivel". Cifras siempre con su denominador. Pendientes, inválidas y de versión desconocida se cuentan aparte.
- Migración 0019 la aplica el propietario; no se fusiona antes de confirmarla. El workflow del colector queda apagado (`ENGINE_SCHEDULE` sin definir) hasta que Meridian esté desplegado. El relleno de producción no se lanza automáticamente.
- Scripts que importan `src/domain` se ejecutan con `node --experimental-transform-types`. Nombres de tests `shouldXWhenY`. Stagear archivos por nombre, nunca `git add -A`.

## Review Focus

- Partida de 1 jugada o sin jugadas propias: `moves` 0, ACPL indefinido (null), nunca división por cero ni aparece en la revisión.
- Partida acabada en mate (posición final): la evaluación final es ±10000 recortada, no un cero del motor.
- Partida con sólo una jugada legal en una posición: el motor devuelve `best` igual; `worst` jamás contiene un `best` mal formado.
- Reeditar el historial de una partida con otro `move_history`: `engine_eval` vuelve a `NULL`; con el mismo, se conserva.
- `engine_eval` con versión desconocida, JSON roto o contadores contradictorios: "desconocido", fuera de todos los denominadores, contado aparte.
- `?since=` con un `match_id` inexistente o sin `played_at`: respuesta sin división (campo `since: null`), no un error 500.

---

### Task 1: Dominio — resumen, contrato, invariantes y lector

**Files:**
- Create: `src/domain/engineEval.ts`
- Test: `tests/engineEval.test.ts`

**Interfaces:**
- Consumes: `phaseOfPly`, `ThreatPhase` de `src/domain/mateThreats.ts`; `DomainError` de `src/kernel/errors.ts`.
- Produces:
  - `ENGINE_EVAL_VERSION = 1`
  - `type WorstMove = { ply: number; loss: number; best: string }`
  - `interface EngineEvalOk { moves: number; loss: number; byPhase: Record<ThreatPhase, [moves: number, serious: number]>; decisivePly: number | null; sustainedAdv: boolean; sustainedDis: boolean; minEval: number; maxEval: number; worst: WorstMove[] }`
  - `summarizeEngineGame(evals: readonly number[], bests: readonly (string | null)[], userColor: "white" | "black"): EngineEvalOk` — `evals` en centipeones desde las blancas, longitud `plies + 1`, mates ya mapeados; `bests[i]` es la mejor jugada UCI de la posición `i`.
  - `type EngineInvalidReason = "illegal_game" | "corrupt_game" | "engine_error"`
  - `type StoredEngineEval = ({ v: 1; status: "ok" } & EngineEvalOk) | { v: 1; status: "invalid"; reason: EngineInvalidReason }`
  - `class InvalidEngineEval extends DomainError` (código `INVALID_ENGINE_EVAL`)
  - `assertEngineEvalInvariants(p: EngineEvalOk, ctx: { plyCount: number; userColor: "white" | "black" }): void`
  - `type ReadEngineEval = { state: "pending" } | { state: "ok"; value: EngineEvalOk } | { state: "invalid"; reason: EngineInvalidReason } | { state: "unknown" }`; `readEngineEval(raw: string | null): ReadEngineEval`

- [ ] **Step 1: Write the failing tests** in `tests/engineEval.test.ts`:
  - `shouldCountMovesLossAndSeriousErrorsPerPhaseFromTheOwnersMovesOnly`: evals blancas `[0, 0, 0, -400, -400]` con bests (strings) → blancas: jugadas propias en los índices 0 y 2; `moves 2`, la jugada del índice 2 pierde 400 → `serious 1` en apertura, `loss 400`, `worst [{ply: 3, loss: 400, best}]`.
  - `shouldSignEvaluationsByColorAndClipThemBeforeComputingLoss`: negras con evals `[0, 50, 5000, -9000]`... el resultado usa ±1000 (p. ej. pérdida máxima 2000).
  - `shouldFindTheFirstDecisiveMoveWhenBeforeAboveMinus150AndAfterAtMostMinus300`, y `null` si nunca ocurre.
  - `shouldFlagSustainedAdvantageOnlyWithThreeConsecutivePositionsAtPlus300` (dos seguidas, no; tres, sí) y análogo para desventaja.
  - `shouldTrackMinAndMaxEvalOverAllPositionsClipped`.
  - `shouldKeepAtMostFiveWorstMovesSortedByLossDescendingThenPlyAndOnlySeriousOnes`.
  - `shouldReturnZeroMovesForAGameWithNoOwnerMoves` (evals `[0]`, evals `[0, 0]` con negras).
  - Invariantes: `shouldRejectMovesThatDoNotMatchTheOwnerPlyCount` (blancas, plyCount 5 → 3 jugadas; negras → 2), `shouldRejectSeriousAboveMovesInAPhase`, `shouldRejectWorstEntriesOutsideTheGameOrOfTheWrongParityOrDuplicated`, `shouldRejectWorstLossOutside300To2000`, `shouldRejectMalformedBestMove` (regex `^[a-h][1-8][a-h][1-8][qrbn]?$`), `shouldRejectWorstLossSumAboveTotalLoss`, `shouldRejectSustainedFlagsInconsistentWithMinMax` (`sustainedAdv` exige `maxEval ≥ 300`; `sustainedDis` exige `minEval ≤ −300`), `shouldRejectMinAboveMaxOrOutsideClip`.
  - Lector: `shouldReadNullAsPending`, `shouldReadUnknownVersionBrokenJsonAndContradictionsAsUnknown`, `shouldReadInvalidWithKnownReasonOnly`, `shouldReadAnOkResultBack`.
- [ ] **Step 2: Run** `rtk npx vitest run tests/engineEval.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3: Implement `src/domain/engineEval.ts`** con las firmas de arriba; `selfInconsistency` (sin conocimiento de la partida) compartido por `assert…` y `readEngineEval`, igual que en `mateThreats.ts`. Estructura de `assertEngineEvalInvariants`: autoconsistencia, luego `moves` = jugadas del propietario según `plyCount`/color, plies de `worst` y `decisivePly` dentro de la partida y con la paridad del color.
- [ ] **Step 4: Run** the test file → PASS; `rtk npx tsc --noEmit` limpio.
- [ ] **Step 5: Commit** `git add src/domain/engineEval.ts tests/engineEval.test.ts` · `feat(domain): per-game engine summary, contract and reader`.

### Task 2: Migración 0019, puerto y adaptador

**Files:**
- Create: `migrations/0019_engine_eval.sql` (`ALTER TABLE match_details ADD COLUMN engine_eval TEXT;`)
- Modify: `src/ports/matchPort.ts`, `src/infrastructure/d1/d1MatchAdapter.ts` (UPSERT y métodos), fakes de `MatchPort` en tests (`tests/recordMatchDetailUseCase.test.ts`, `tests/portsDecoupling.test.ts`, y los que `rtk tsc` señale)
- Test: `tests/engineEvalAdapter.test.ts`

**Interfaces:**
- Consumes: `StoredEngineEval` (Task 1).
- Produces en `MatchPort`: `getPendingEngine(limit: number): Promise<{ items: { match_id: string; user_color: string | null; move_history: string }[]; totalPending: number }>`; `saveEngineEval(matchId: string, stored: StoredEngineEval): Promise<void>`. `getThreatTarget` se reutiliza como objetivo de validación del motor (su comentario se amplía; no se renombra).

- [ ] **Step 1: Failing tests** (modelo: `tests/mateThreatsAdapter.test.ts`, con 0019 en `MIGRATIONS`): `shouldListOnlyGamesWithADetailAndNoStoredEngineResultNewestFirstWithStableTies`, `shouldNotListAGameOnceItHasAnOkOrInvalidResult`, `shouldSkipGamesWithUnknownColourInThePendingQueue`, `shouldSaveTheResultWithOneUpdate`, `shouldResetEngineEvalWhenTheMoveHistoryChanges` y `shouldKeepEngineEvalWhenTheSameDetailIsSavedAgain` (a través de `saveMatchDetail`).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** SQL de cola idéntica a `getPendingThreats` con `md.engine_eval IS NULL`. En el UPSERT de `saveMatchDetail`, añadir la cláusula `engine_eval = CASE WHEN excluded.move_history IS match_details.move_history THEN match_details.engine_eval ELSE NULL END` junto a la de `mate_threats`. Añadir los dos métodos al fake de cada test que implemente `MatchPort`.
- [ ] **Step 4: Run** `rtk npx vitest run tests/engineEvalAdapter.test.ts tests/mateThreatsAdapter.test.ts` y `rtk npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** (archivos por nombre) · `feat(chess): engine_eval column, queue and persistence`.

### Task 3: Aplicación, esquema, rutas de máquina y política de acceso

**Files:**
- Create: `src/application/recordEngineEval.ts`
- Modify: `src/api/schemas.ts` (`engineEvalBody`), `src/api/chessDetail.ts` (`handleGetPendingEngine`, `handlePostEngineEval`), `src/api/router.ts`, `src/api/errors.ts` (`INVALID_ENGINE_EVAL: 422`), `tests/accessPolicy.test.ts`
- Test: `tests/engineEvalRoutes.test.ts`

**Interfaces:**
- Consumes: Task 1 y 2.
- Produces: `type EngineEvalBody = ({ status: "ok" } & EngineEvalOk) | { status: "invalid"; reason: EngineInvalidReason }`; `recordEngineEval(port: MatchPort, matchId: string, body: EngineEvalBody): Promise<void>` (404 `NotFoundError` si no hay objetivo; invariantes antes de escribir; el servidor sella `v`); rutas `GET /api/chess/matches/pending-engine?limit=` (en `MACHINE_READ`, máx. 100, por defecto 100) y `POST /api/chess/matches/:id/engine`.

- [ ] **Step 1: Failing tests** (modelo: `tests/mateThreatsRoutes.test.ts`): `shouldRejectEngineRoutesWithoutTheImportToken`, `shouldReturnPendingItemsWithTotal`, `shouldStoreAnOkResultAndStampTheVersion`, `shouldStoreAnInvalidResult`, `shouldRejectABodyThatCarriesAVersionOrUnknownFields` (422), `shouldRejectInvariantViolationsWithoutWriting` (422 y la columna sigue `NULL`), `shouldAnswer404WhenTheMatchHasNoDetail`, `shouldBeIdempotentWhenThePostIsRepeated`. Añadir las dos rutas a la tabla de `tests/accessPolicy.test.ts`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** igual que las amenazas. Zod estricto: `moves/loss` enteros ≥ 0; `byPhase` objeto estricto de tuplas `[count, count]`; `decisivePly` entero ≥ 1 o null; `sustainedAdv/sustainedDis` booleanos; `minEval/maxEval` enteros; `worst` array máx. 5 de objetos estrictos `{ ply, loss, best }`; `reason` ∈ las tres razones.
- [ ] **Step 4: Run** `rtk npx vitest run tests/engineEvalRoutes.test.ts tests/accessPolicy.test.ts` → PASS.
- [ ] **Step 5: Commit** · `feat(api): machine routes for engine evaluation results`.

### Task 4: Script con motor y bucle de cola compartido

**Files:**
- Create: `scripts/analysisQueue.ts`, `scripts/stockfishEngine.ts`, `scripts/analyzeEngine.ts`
- Modify: `scripts/analyzeThreats.ts` (usa `analysisQueue.ts`), `package.json` (dependencia `stockfish` fijada a `19.0.1`), `package-lock.json`
- Test: `tests/analyzeEngineScript.test.ts`; `tests/analyzeThreatsScript.test.ts` debe seguir en verde sin cambios

**Interfaces:**
- Produces:
  - `runQueue<G>(o: { kind: "threats" | "engine"; pendingPath: string; postPath: (id: string) => string; compute: (g: G) => Promise<Body | null>; fetch; worker; importToken; limit?; budgetMs?; now?; sleep?; log? }): Promise<AnalyzeMetrics>` en `scripts/analysisQueue.ts`, con exactamente la semántica actual de `analyze` (reintentos acotados, 401 aborta, "no progress", presupuesto entre partidas). `analyzeThreats.analyze` pasa a ser una llamada a `runQueue`; `AnalyzeOptions`/`AnalyzeMetrics` se exportan sin cambios.
  - `interface Evaluator { eval(fen: string): Promise<{ cp: number; best: string | null }>; close(): void }` y `createStockfish(depth?: number): Promise<Evaluator>` en `scripts/stockfishEngine.ts` (proceso hijo `node node_modules/stockfish/scripts/cli.js`, `Hash 16`, un hilo; `cp` desde las blancas con la regla de mates).
  - `evaluateGame(moves: readonly string[], evaluator: Evaluator): Promise<{ evals: number[]; bests: (string | null)[] }>` y `analyzeEngine(opts: AnalyzeOptions & { evaluator: Evaluator }): Promise<AnalyzeMetrics>` en `scripts/analyzeEngine.ts`; CLI guardada por `import.meta.url`, variables `WORKER`, `IMPORT_TOKEN`, `ENGINE_BUDGET_MS` opcional.

- [ ] **Step 1: Failing tests**: `shouldRunTheSameLoopForBothKinds` (el test existente de amenazas es la prueba de no regresión); en `analyzeEngineScript.test.ts` con un `Evaluator` falso determinista: `shouldPostAnOkSummaryForAReplayableGame`, `shouldAssignMateScoreToTheFinalPositionOfACheckmatedGame` (±10000 recortado), `shouldPostInvalidIllegalGameForAnIllegalMove`, `shouldPostInvalidCorruptGameForUnreadableHistory`, `shouldCountEngineFailuresAsFailedAndPostNothing` (no se marca inválida una partida por fallo del motor), `shouldStopWithinTheBudgetBetweenGames`, `shouldNotLogIdsOrMoves`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Extraer sin cambiar comportamiento; el motor reutiliza `parseStoredGame` y `Chess` para generar FENs; la posición final con mate se evalúa sin motor (±10000 según el bando que mueve). La evaluación recortada ocurre en `summarizeEngineGame`, no en el script. `npm i -D stockfish@19.0.1 --ignore-scripts`.
- [ ] **Step 4: Run** `rtk npx vitest run tests/analyzeEngineScript.test.ts tests/analyzeThreatsScript.test.ts` → PASS.
- [ ] **Step 5: Aceptación contra el estudio** (script fuera de la suite, `scripts/compareWithStudy.ts`, documentado en OPERATIONS): ejecutar `summarizeEngineGame` sobre `~/code/experiments/audit/all.jsonl` y comprobar partida a partida que errores graves, pérdida y momento decisivo coinciden con `profile.mjs`, y que la tasa global es 9,7 ± 0,1 por 100 jugadas. Debe imprimir 0 discrepancias.
- [ ] **Step 6: Commit** · `feat(scripts): engine analysis over the shared queue loop`.

### Task 5: API de lectura del perfil

**Files:**
- Modify: `src/api/stats.ts` (`handleStatsProfile`, rama `kind === "profile"`)
- Test: `tests/apiProfile.test.ts`

**Interfaces:**
- Consumes: `readEngineEval`, esquema de `matches` (`result`, `user_color`, `opponent_type`, `played_at`, `user_id`).
- Produces `GET /api/stats/profile?userId=&since=<match_id>` → `{ analysed, pending, invalid, unknownVersion, bots: { games, share }, since: { matchId, playedAt } | null, all: Section, before: Section | null, after: Section | null, blocks: Block[], review: { worst: ReviewRow[], best: ReviewRow[] } }`, donde `Section = { games, moves, serious, ratePer100, acpl, byPhase: { opening|middlegame|endgame: { moves, serious, ratePer100 } }, byColor: { white|black: { games, moves, serious, ratePer100 } }, decisive: { lossGames, withDecisive, medianPly, opening10, middlegame, endgame }, conversion: { advantage: Outcome, disadvantage: Outcome, thrown } }`, `Outcome = { games, win, draw, loss }`, `Block = { games, moves, serious, ratePer100, acpl, partial }` (bloques completos de 50 partidas ordenadas por `played_at` ascendente; el último incompleto con `partial: true`) y `ReviewRow = { matchId, result, moves, serious, acpl, decisivePly }` (20 por lista, mínimo 20 jugadas propias, solo `ok`). Todas las tasas son `null` con denominador 0. `before/after` solo con `since` válido: `played_at` menor / mayor-o-igual; `since` desconocido ⇒ `since: null` y `before/after: null`.

- [ ] **Step 1: Failing tests** (modelo `tests/apiThreats.test.ts`): `shouldAggregateOnlyOkResultsAndCountTheRestApart`, `shouldComputeRatesPer100MovesByPhaseAndColour`, `shouldReturnNullRatesWithZeroDenominators`, `shouldCountBotsFromOpponentTypeLive`, `shouldBuildBlocksOf50InPlayedAtOrderWithAPartialLastBlock`, `shouldClassifyDecisiveMomentsOnLostGamesByMoveAndPhase`, `shouldCountOutcomesAfterSustainedAdvantageAndDisadvantageWithDrawsApart`, `shouldCountThrownAdvantages` (ventaja sostenida y derrota), `shouldSplitBeforeAndAfterTheSinceGame`, `shouldIgnoreAnUnknownSinceWithoutFailing`, `shouldRankReviewByAcplWithAtLeast20OwnMovesAndExcludePendingInvalid`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** una consulta (como `handleStatsThreats`) y agregación en JS; las secciones se obtienen filtrando la lista de partidas `ok` y llamando a una única función `section(games)`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** · `feat(stats): player profile aggregates with before/after cut`.

### Task 6: Visor — errores graves de la partida

**Files:**
- Modify: `src/api/game.ts` (campo `engineWorst: WorstMove[]` y `engineSummary: { moves, serious, acpl } | null`), `src/frontend.ts` (`#gErrors`), `src/dashboard.client.js` (lista y salto)
- Test: ampliar `tests/apiThreats.test.ts` o nuevo `tests/apiGameEngine.test.ts`; `tests/chessDashboardThreats.test.ts` como modelo del cliente

**Interfaces:**
- Consumes: `readEngineEval`; `jumpToMissedPly(n)` (va al ply n−1) se generaliza a `jumpToPly(n)` conservando `jumpToMissedPly` como alias o reemplazando sus llamadas.
- Produces: `/api/game/:id` incluye `engineWorst` (vacío si pendiente/inválida/desconocida) y `engineSummary`.

- [ ] **Step 1: Failing tests**: `shouldReturnEngineWorstMovesOfAnAnalysedGame`, `shouldReturnEmptyForPendingInvalidOrUnknownEngineEval`, `shouldListWorstMovesInTheViewerWithLossAndBestMove`, `shouldJumpToThePositionBeforeTheErrorWhenClickingAWorstMove`, `shouldHideTheErrorListWhenThereAreNone`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** (traducir la jugada UCI preferida a SAN en el cliente con la posición del visor si ya hay chess disponible; si no, mostrar UCI).
- [ ] **Step 4: Run** → PASS. Añadir 0019 a todos los `MIGRATIONS` de tests que cubran `handleMatchGame`/`handleMatches` (`rtk grep -l 0018_mate_threats tests`).
- [ ] **Step 5: Commit** · `feat(viewer): serious engine errors per game`.

### Task 7: Pestaña «Perfil» y corte del experimento

**Files:**
- Modify: `src/frontend.ts` (botón `tabBtnProfile`, contenedor, tarjetas), `src/dashboard.client.js` (`showTab('profile')`, `loadProfile`, render, `since` por `localStorage` con try/catch), `src/api/stats.ts` si hiciera falta
- Test: `tests/chessDashboardProfile.test.ts` (modelo `tests/chessDashboardThreats.test.ts` con `tests/helpers/dom.ts`)

**Interfaces:**
- Consumes: `/api/stats/profile` (Task 5), tarjeta de amenazas existente (`#threatsCard`, se reutiliza o se enlaza, no se duplica lógica).
- Produces: tarjetas `#profileQuality`, `#profileDecisive`, `#profileConversion`, `#profileReview`, `#profileSince` (campo para el `match_id` de corte con botón "Aplicar" y "Quitar").

- [ ] **Step 1: Failing tests**: `shouldRenderQualityWithDenominatorsAndPhaseRates`, `shouldRenderTheTrendByBlocksAndMarkThePartialOne`, `shouldRenderDecisiveMomentsShares`, `shouldRenderConversionWithDrawsApart`, `shouldRenderBeforeAndAfterWhenSinceIsSet`, `shouldRememberTheCutInLocalStorageAndSurviveItBeingUnavailable`, `shouldShowAnExplicitNoteWhenAnalysisIsIncomplete` (pendientes/inválidas/desconocidas), `shouldStateThatMostGamesAreAgainstBots`, `shouldOpenTheViewerFromAReviewRow`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** con el estilo de las tarjetas existentes; textos descriptivos, sin nota global ni juicio.
- [ ] **Step 4: Run** `rtk npx vitest run tests/chessDashboardProfile.test.ts tests/dashboardClientScript.test.ts tests/dashboardRoutes.test.ts` → PASS.
- [ ] **Step 5: Commit** · `feat(dashboard): player profile tab with experiment cut`.

### Task 8: Cierre del repositorio Meridian

**Files:**
- Modify: `docs/OPERATIONS.md` (sección del motor: cómo se calcula, cómo reanalizar con `v: 2`, aceptación contra el estudio), `package.json` si falta algún script
- Test: suite completa

- [ ] **Step 1: Run** `rtk npx vitest run`, `rtk npx tsc --noEmit`, `npm run` del chequeo de arquitectura (el que usó la rama de amenazas) → todo verde.
- [ ] **Step 2: Docs** de OPERATIONS: orden de despliegue (migración 0019 aplicada y confirmada → fusionar y desplegar → colector → relleno manual → variable), nota de que la lógica de ejecución vive en el colector.
- [ ] **Step 3: Revisión final** con un revisor nuevo sobre corrección ajedrecística (constantes, signos, fases), integridad de datos (invariantes, reinicio al reeditar), seguridad de rutas de máquina y coherencia Meridian↔colector; corregir hallazgos.
- [ ] **Step 4: Commit** y abrir PR con la advertencia de despliegue; no fusionar.

### Task 9: Colector — workflow del motor (apagado)

**Files (repositorio `valentinlineiro/meridian-collector`, rama `private/operational`):**
- Create: `.github/workflows/engine.yml`
- Modify: `OPERATIONS.md`
- Test: `tests/engineWorkflow.test.ts` (modelo `tests/threatsWorkflow.test.ts`)

- [ ] **Step 1: Failing tests**: grupo de concurrencia propio `meridian-engine`, `permissions: contents: read`, `persist-credentials: false`, referencia de Meridian fijada a SHA completo, único secreto `MERIDIAN_IMPORT_TOKEN`, `WORKER` explícito, disparadores `workflow_dispatch` y `workflow_run` del workflow `collector`, puerta `vars.ENGINE_SCHEDULE == 'enabled'`, instalación `npm ci --omit=dev --ignore-scripts` (Stockfish es dependencia de producción de Meridian, fijada por el lockfile), ejecución `node --experimental-transform-types scripts/analyzeEngine.ts`, `timeout-minutes` y presupuesto coherentes.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** copiando `threats.yml`. **Step 4: Run** suite del colector → PASS.
- [ ] **Step 5:** El SHA de Meridian se fija al hacer commit de la fusión en `main`; no publicar ni activar el workflow hasta que Meridian esté desplegado (nota en OPERATIONS).
- [ ] **Step 6: Commit** en el colector, sin push hasta confirmación.

## Self-review

- Cobertura del spec: contrato y constantes (Task 1), columna y reinicio al reeditar (2), rutas de máquina (3), motor y aceptación contra el estudio (4), perfil/antes-después/bloques/revisión (5), visor (6), pestaña y corte (7), despliegue y revisión (8), colector (9). El motivo `engine_error` está en el contrato pero el script no lo envía (un fallo del motor no marca la partida como inválida); es decisión de este plan.
- Fases 4 y 5 del spec (patrones, jugadas únicas) quedan fuera, como dice el spec.
