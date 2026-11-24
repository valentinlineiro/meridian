# Ajedrez por periodos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La pantalla Ajedrez muestra ELO y tendencia, puntos fuertes y débiles, color, aperturas y partidas largas por periodo (30 d / 90 d / 1 a / todo), con las partidas en un submenú.

**Architecture:** Un endpoint `GET /api/stats/weekly` agrega en SQL (filas agrupadas, sin filas crudas) y un plegado puro (`foldWeekly`) las convierte en semanas con el clasificador único `resultOf`. El cliente descarga las semanas una vez y suma las del periodo elegido con funciones puras; los componentes solo dibujan.

**Tech Stack:** Cloudflare Worker + Hono + D1 (SQLite), Angular 22 con signals, vitest (raíz y `web/`), Playwright.

**Spec:** `docs/superpowers/specs/2026-11-24-chess-periods-design.md`

## Global Constraints

- Plan gratuito de Worker y D1: el endpoint no lee filas crudas de partidas; devuelve como mucho una fila por (semana, color, familia, fase, resultado, desconexión).
- Sin migraciones (son manuales). Registros append-only.
- Copy en español; tema oscuro único; tokens y vocabulario de `web/DESIGN.md`.
- Muestra mínima `MIN_GAMES = 8`: por debajo, un punto aparece atenuado ("pocas partidas") y no entra en fuertes/débiles.
- Semanas = lunes UTC (`played_at` son segundos Unix). Periodos: `30d`=30, `90d`=90, `1y`=365 días, `all`.
- Una derrota por desconexión (`end_condition = 'disconnection'` y resultado derrota) cuenta en el total, pero no en la cifra competitiva (regla P3 de `handleStatsPhases`).
- Tests con nombre `shouldXWhenY`. Antes de cada commit de código: `npm run typecheck`, `npm test`, `npm run web:lint`, `npm run web:test`; antes de subir, también `python3 scripts/check_architecture_boundaries.py` y `npm run test:e2e`.
- Gráficas: cargar la skill `dataviz` antes de escribir cualquier gráfica; cada gráfica lleva una tabla de datos equivalente accesible.

## Review Focus

- Semana con partidas y todos los resultados desconocidos: la tasa es `null`, nunca 0 (la tasa usa solo partidas decididas).
- Partidas con `played_at` NULL: cuentan en `undated` y solo en el periodo `all`; nunca en una semana.
- Usuario sin partidas, o con una sola semana: la pantalla muestra un estado vacío o un punto, sin errores ni NaN.
- Dos usuarios: el endpoint no mezcla partidas de otro `userId`.
- Derrotas por desconexión: presentes en el total, ausentes del cálculo de fuertes/débiles.

---

### Task 1: Plegado semanal puro (`foldWeekly`)

**Files:**
- Create: `src/domain/chessWeekly.ts`
- Test: `tests/chessWeekly.test.ts`

**Interfaces:**
- Consumes: `resultOf` de `src/domain/result.ts`.
- Produces:
```ts
export interface WeeklyRow { week: string | null; color: string | null; family: string | null; phase: string | null;
  result: string | null; outcome: string | null; disconnection: number; n: number }   // disconnection: 0|1
export interface Tally { w: number; d: number; l: number; u: number; disconnections: number }  // l incluye las desconexiones; u = resultado desconocido
export interface WeekBucket { week: string; games: number; total: Tally; byColor: Record<string, Tally>;
  byFamily: Record<string, Tally>; byPhase: Record<string, Tally>; eloEnd: number | null }
export interface Weekly { weeks: WeekBucket[]; undated: Tally & { games: number } }
export function foldWeekly(rows: readonly WeeklyRow[], eloByWeek: ReadonlyMap<string, number>): Weekly
```

- [ ] **Step 1: Write the failing tests** — `shouldCountEachGameOncePerDimensionWhenRowsShareAWeek`, `shouldKeepDisconnectionLossesInLossesAndCountThemSeparately`, `shouldCountUnknownResultsApartWhenOutcomeIsMissing`, `shouldPutRowsWithoutWeekInUndatedWhenPlayedAtIsMissing`, `shouldSortWeeksAscendingAndAttachEloEndWhenKnown`, `shouldKeyByUnknownWhenColorFamilyOrPhaseIsNull`. Assert exact tallies, e.g. two rows `{week:'2026-11-16', color:'white', result:'win', n:3}` and `{... color:'black', result:'loss', disconnection:1, n:1}` give `total {w:3,d:0,l:1,u:0,disconnections:1}` and `games 4`.
- [ ] **Step 2: Run** `npx vitest run tests/chessWeekly.test.ts` — expect FAIL (module not found).
- [ ] **Step 3: Implement `foldWeekly`** in `src/domain/chessWeekly.ts`. Classify with `resultOf({result, outcome})`; add `n` to the matching tally field; null dimension values use the key `"unknown"`; weeks sorted ascending by `week`; `eloEnd = eloByWeek.get(week) ?? null`.
- [ ] **Step 4: Run** the same command — expect PASS.
- [ ] **Step 5: Commit** `feat(stats): pure weekly fold for chess results`.

### Task 2: Endpoint `GET /api/stats/weekly`

**Files:**
- Modify: `src/api/stats.ts` (add `handleStatsWeekly`, dispatch `kind === "weekly"` in `handleStats`)
- Test: `tests/statsWeekly.test.ts` (reuse the in-memory `node:sqlite` D1 shim and the `match()` helper pattern from `tests/statsBundle.test.ts`; migrations `0001`, `0005`, `0006`, `0007`, `0017`)

**Interfaces:**
- Consumes: `foldWeekly`, `WeeklyRow`, `Weekly` (Task 1); `userId` query param as in the sibling handlers.
- Produces: `export async function handleStatsWeekly(db: D1Database, url: URL): Promise<Response>` returning `Weekly` as JSON. The route is already covered by `app.get("/api/stats/*")` and the 30 s private cache.

- [ ] **Step 1: Write the failing tests** — `shouldReturnOneBucketPerMondayUtcWhenGamesSpanSeveralDays` (a Sunday 2026-11-22 23:59 UTC game and a Monday 2026-11-23 00:00 UTC game land in different weeks; Sunday belongs to Monday 2026-11-16), `shouldExcludeOtherUsersWhenUserIdIsGiven`, `shouldReportUndatedWhenPlayedAtIsNull`, `shouldAttachLatestEloAfterOfTheWeekWhenKnown`, `shouldIssueOnlyGroupedQueriesWhenCalled` (assert no prepared SQL selects `raw_json` or `move_history`).
- [ ] **Step 2: Run** `npx vitest run tests/statsWeekly.test.ts` — expect FAIL.
- [ ] **Step 3: Implement `handleStatsWeekly`.** Query 1: `matches m LEFT JOIN match_details md` grouped by `date(m.played_at,'unixepoch','weekday 0','-6 days')` (NULL when `played_at` is NULL), `m.user_color`, `md.opening_family`, `md.phase_key`, `m.result`, `m.outcome`, `(md.end_condition='disconnection')`, with `COUNT(*)`, filtered by `userId` when present. Query 2: the latest non-null `md.elo_after` per week with `ROW_NUMBER() OVER (PARTITION BY week ORDER BY m.played_at DESC)` keeping `rn = 1`. Return `json(foldWeekly(rows, eloByWeek))`.
- [ ] **Step 4: Run** the new test plus `npx vitest run tests/accessPolicy.test.ts tests/statsBundle.test.ts` — expect PASS.
- [ ] **Step 5: Commit** `feat(api): weekly chess aggregates at /api/stats/weekly`.

### Task 3: Funciones puras de periodo (cliente)

**Files:**
- Create: `web/src/app/features/chess/periods.ts`
- Test: `web/src/app/features/chess/periods.spec.ts`

**Interfaces:**
- Consumes: tipos de Task 1 copiados al cliente en `web/src/app/features/chess/weekly.model.ts` (mismos nombres y campos).
- Produces:
```ts
export type PeriodKey = '30d' | '90d' | '1y' | 'all';
export const PERIODS: readonly Choice[];                       // Choice de shared/segmented.ts; k = PeriodKey, l = '30 días' | '90 días' | '1 año' | 'Todo'
export const MIN_GAMES = 8;
export function sliceWeeks(weeks: readonly WeekBucket[], key: PeriodKey, now: Date): { current: WeekBucket[]; previous: WeekBucket[] }
export function sumTally(ts: readonly Tally[]): Tally;
export function winRate(t: Tally, competitive?: boolean): { n: number; rate: number | null }   // n = w+d+l(-disconnections si competitive)
export interface Point { kind: 'color' | 'opening' | 'long'; label: string; n: number; rate: number; delta: number }  // delta = puntos de % vs tasa media competitiva del periodo
export function rankPoints(current: readonly WeekBucket[]): { strong: Point[]; weak: Point[]; sparse: Point[] }
```

- [ ] **Step 1: Write the failing tests** — `shouldIncludeWeeksStartingOnOrAfterTheCutoffWhenSlicing30d`, `shouldReturnTheSameLengthWindowBeforeAsPreviousWhenSlicing90d`, `shouldReturnAllWeeksAndNoPreviousWhenKeyIsAll`, `shouldReturnNullRateWhenNoDecidedGames`, `shouldExcludeDisconnectionLossesWhenCompetitive`, `shouldPutPointsBelowMinGamesInSparseWhenRanking`, `shouldOrderStrongDescendingAndWeakAscendingByDelta`. Use fixed `now = new Date('2026-11-24T12:00:00Z')`.
- [ ] **Step 2: Run** `cd web && npx ng test --watch=false --include='**/periods.spec.ts'` — expect FAIL.
- [ ] **Step 3: Implement** the functions in `periods.ts`. A week is in the period when its Monday ≥ start of the UTC day `now − days`; `previous` is the same number of days immediately before; `rankPoints` builds points from `byColor` (white/black), `byFamily` (opening) and `byPhase.endgame` (kind `long`), strong = delta > 0, weak = delta < 0.
- [ ] **Step 4: Run** the same command — expect PASS.
- [ ] **Step 5: Commit** `feat(web): period slicing and strength ranking for chess`.

### Task 4: Carga, selector y gráficas

**Files:**
- Create: `web/src/app/features/chess/components/elo-line.ts`, `web/src/app/features/chess/components/points-bars.ts` (+ `*.spec.ts` for each)
- Modify: `web/src/app/features/chess/chess.ts`, `web/src/app/features/chess/chess.html`, `web/src/styles.css` (only tokens already in `:root`)

**Interfaces:**
- Consumes: Task 3 exports; `ApiClient.get<Weekly>('/api/stats/weekly')`; `Segmented` (`options`, `value`, `label`, `picked`).
- Produces: `EloLine` (`weeks = input.required<WeekBucket[]>()`; SVG line over `eloEnd`, skips `null`, one point renders as a dot; a `<details>` table with the same data) and `PointsBars` (`points = input.required<Point[]>()`, `title = input.required<string>()`; divergent bars around 0 with the percentage and `n` on every row; accessible table).

- [ ] **Step 1: Write the failing tests** — `shouldRenderOneDotWhenOnlyOneWeekHasElo` and `shouldListEveryPointInTheTableWhenRendering` (component specs), plus `shouldRenderEmptyStateWhenThereAreNoWeeks` for the page.
- [ ] **Step 2: Run** `cd web && npm test` — expect the new specs FAIL.
- [ ] **Step 3: Implement** both components and rework `chess.html` top-down as in the spec: ELO current + variation vs `previous` + `EloLine`; `PointsBars` for strong and weak; colour pairs; openings best→worst; "Partidas largas (más de 80 jugadas)"; period `Segmented` bound to a `period = signal<PeriodKey>('90d')`. One `rxResource`/`resource` loads `Weekly` once (error shows the existing retry block).
- [ ] **Step 4: Run** `cd web && npm test && npm run lint` — expect PASS. Then render at 390 px and 1280 px with the demo seed (`npm run demo:seed` against `wrangler dev src/dev.ts`) and check contrast, 44 px targets and no horizontal scroll.
- [ ] **Step 5: Commit** `feat(web): chess page by periods with ELO line and strengths`.

### Task 5: Submenú `/chess/partidas`

**Files:**
- Modify: `web/src/app/app.routes.ts`, `web/src/app/features/chess/chess.ts`, `web/src/app/features/chess/chess.html`, `web/src/app/shell/section.ts` (active tab for the sub-route), `tests/spaAssets.test.ts` (`CANONICAL`)
- Test: `tests/e2e/frontend.spec.ts`

**Interfaces:**
- Consumes: the existing games list, filters, viewer modal, CSV export and review banner inside `chess.ts`.
- Produces: a `chess` UrlMatcher like `games`/`languages` that accepts `/chess` and `/chess/partidas` (anything else falls through to NotFound) and a `view = computed<'periods' | 'games'>()` in `Chess`; the games view hosts the list, filters, "Exportar CSV" and the review banner; a "Partidas" link on the periods view; a back link on the games view.

- [ ] **Step 1: Write the failing tests** — e2e `shouldOpenTheGamesListWhenNavigatingToChessPartidas`, `shouldKeepChessTabActiveOnTheSubroute`, `shouldReloadChessPartidasWithoutA404`; add `/chess/partidas` to `CANONICAL` in `tests/spaAssets.test.ts`.
- [ ] **Step 2: Run** `npx vitest run tests/spaAssets.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** the matcher, the `view` switch and the move of the list; the legacy `/profile` route and `?course=`/`#/x` guards stay unchanged.
- [ ] **Step 4: Run** `npx vitest run tests/spaAssets.test.ts && cd web && npm test && cd .. && npm run test:e2e` — expect PASS.
- [ ] **Step 5: Commit** `feat(web): move the games list to /chess/partidas`.

### Task 6: Perfil por periodo, Umami y limpieza

**Files:**
- Modify: `web/src/app/features/chess/chess.ts` (profile `since`), `web/src/app/features/chess/chess.html`, `web/DESIGN.md`, `docs/ux/` (one short note on the new Ajedrez structure)
- Test: `web/src/app/features/chess/chess.spec.ts`

**Interfaces:**
- Consumes: the existing `since` parameter of `/api/stats/profile`; `PeriodKey` (Task 3).
- Produces: `sinceFor(key: PeriodKey, now: Date): number | undefined` in `periods.ts` (seconds Unix of the cutoff; `undefined` for `all`).

- [ ] **Step 1: Write the failing tests** — `shouldRequestTheProfileWithTheSelectedPeriodSinceWhenPeriodChanges`, `shouldOmitSinceWhenPeriodIsAll`.
- [ ] **Step 2: Run** `cd web && npm test` — expect FAIL.
- [ ] **Step 3: Implement** `sinceFor`, the profile link carrying the period, `data-umami-event` on the period buttons (`chess-period`), the "Partidas" link (`chess-games-open`) and the profile link (`chess-profile-open`); hide (do not delete) the old hero streak/bar, the 10-game list and the collapsed "Estadísticas" block; update `web/DESIGN.md` and the UX note.
- [ ] **Step 4: Run the full gate:** `npm run typecheck && python3 scripts/check_architecture_boundaries.py && npm test && npm run web:lint && npm run web:test && npm run test:e2e` — expect all green.
- [ ] **Step 5: Commit, push the branch, open the PR** (the merge to `main` deploys; check the page view and the three new events in Umami afterwards).
