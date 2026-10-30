# Mate-threat indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure, per game and in aggregate, how often the owner neutralises a mate-in-1 threat, computed offline by the collector's scheduled job and shown on the chess dashboard with a path to the games where it failed.

**Architecture:** A pure domain function (`analyzeMateThreats`) lives in Meridian. A Node script in Meridian pulls pending games from a machine route, computes, and POSTs one validated result per game; the collector repo runs that script on a schedule from a pinned checkout of Meridian. Results live in one versioned JSON column on `match_details`; readers aggregate it with `json_extract`.

**Tech Stack:** TypeScript, Hono, Cloudflare D1 (SQLite), `chess.js`, zod (edge only), vitest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-30-mate-threat-indicator-design.md` (read it first; this plan only records the decisions the spec leaves to the builder).

## Global Constraints

- Domain and application code import neither `hono` nor `zod`; `scripts/check_architecture_boundaries.py` must stay green.
- `chess.js` is the only chess dependency; no engine.
- Server assigns `v` (value `1`, constant `MATE_THREATS_VERSION`); a request body carrying `v` or unknown keys is rejected `422`.
- `POST …/threats` writes only `match_details.mate_threats`; `GET pending-threats` returns only `match_id`, `user_color`, `move_history`.
- Both new machine routes use `IMPORT_TOKEN` (reads via `MACHINE_READ`, writes via the existing write rule). No scopes.
- No match ids, moves or counts per game in any log line the script or the Worker emits.
- Spanish UI copy is descriptive, with no causal wording, and passes `tests/epistemicWording.test.ts`.
- Rates are shown as `numerator / denominator (percent)`, never with a confidence interval.
- Phase of a threat position by the ply of *my* move: `ply <= 20` opening, `ply <= 60` middlegame, else endgame.
- Pending order: `played_at` DESC, then `match_id` ASC. A batch is 100 games per request; the job chains batches within a 12-minute wall-clock budget.
- Migrations are applied to remote by hand before the code that needs them is merged (`deploy.yml` fails on pending migrations).
- Commit trailers: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_018tZ5M7tKpMBu99td2ptjvr`.

## Review Focus

1. A game that ends on my own move (mate delivered, or the record stops) yields no verdict for that position. Pinned in Task 1.
2. A position where I am in check cannot be passed; it is skipped, never an exception. Pinned in Task 1.
3. Promotion moves (`e7e8q`) and castling replay correctly in the analyser. Pinned in Task 1.
4. A stored `mate_threats` with an unknown `v`, or malformed JSON, is counted aside and never crashes aggregation. Pinned in Task 2 and Task 6.
5. Repeating the same `POST` is a no-op; an invariant violation writes nothing and leaves a previously valid value untouched. Pinned in Task 4.
6. A game with no pending-time details or a foreign id answers `404` and writes nothing. Pinned in Task 4.
7. The pending order is deterministic with ties on `played_at` (and NULL `played_at` last). Pinned in Task 3.

---

## Part A — `meridian` repository (one PR)

### Task 1: The analyser

**Files:**
- Create: `src/domain/mateThreats.ts`
- Test: `tests/mateThreats.test.ts`

**Interfaces:**
- Produces:
  - `export const MATE_THREATS_VERSION = 1;`
  - `export type ThreatPhase = "opening" | "middlegame" | "endgame";`
  - `export type PhaseTally = [neutralized: number, missed: number, unpunished: number];`
  - `export interface MateThreatsOk { faced: number; neutralized: number; missed: number; unpunished: number; byPhase: Record<ThreatPhase, PhaseTally>; missedPlies: number[] }`
  - `export function analyzeMateThreats(moves: readonly string[], userColor: "white" | "black"): MateThreatsOk` — throws `IllegalGame` (from `./gameReplay.ts`) on an unplayable move.

- [ ] **Step 1: Write the failing tests** in `tests/mateThreats.test.ts`, one `it` per case, moves as long-algebraic strings:
  - `shouldCountAMissedThreatWhenTheReplyIsMate`: black, `e2e4 e7e5 f1c4 b8c6 d1h5 g8f6 h5f7` → `faced 1, missed 1, neutralized 0, unpunished 0, byPhase.opening [0,1,0], missedPlies [6]`.
  - `shouldCountANeutralizedThreatWhenNoMateRemains`: black, `… d1h5 g7g6 h5f3` → `faced 1, neutralized 1`, `byPhase.opening [1,0,0]`, `missedPlies []`.
  - `shouldCountAnUnpunishedThreatWhenTheMateStaysButIsNotPlayed`: black, `… d1h5 g8f6 d2d3` → `faced 1, unpunished 1`, `byPhase.opening [0,0,1]`.
  - `shouldGiveNoVerdictWhenTheRecordEndsOnMyMove`: black, `… d1h5 g8f6` (six moves, mine is last) → `faced 0`.
  - `shouldSkipPositionsWhereIAmInCheck`: a short legal line where black is in check on its turn (`e2e4 f7f6 d1h5`) → does not throw; `faced` counts only passable positions.
  - `shouldReplayPromotionsAndCastling`: a legal line containing `e1g1` and a `…a8q` style promotion → does not throw.
  - `shouldThrowIllegalGameOnAnUnplayableMove`: `["e2e5"]` → `IllegalGame`.
  - `shouldSplitPhasesByThePlyOfMyMove`: assert the three buckets using a hand-built position-independent check on the exported phase boundaries (ply 20 → opening, 21 → middlegame, 61 → endgame) via a small exported helper `phaseOfPly(ply: number): ThreatPhase`.
- [ ] **Step 2: Run** `npx vitest run tests/mateThreats.test.ts` — Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `analyzeMateThreats` and `phaseOfPly` in `src/domain/mateThreats.ts`. Algorithm (not determined by the signature): replay with `chess.js`; for each of my moves at zero-based index `i` that has an opponent reply (`i + 1 < moves.length`), take the FEN before it, flip the side to move and clear the en-passant field, and try to load it (chess.js does NOT throw when the side not to move is in check, so test `inCheck()` first and skip); the position is *threatened* if any legal move of the flipped side gives checkmate. Verdict: `missed` if the opponent's reply `moves[i+1]` leaves me checkmated; else, if a mate-in-1 still exists for the opponent after my move, `unpunished`; else `neutralized`. `ply = i + 1`. Filter candidate moves by `san` ending in `+` or `#` before testing mate, for speed.
- [ ] **Step 4: Run** the test file — Expected: PASS. Then `npx tsc --noEmit` and `python3 scripts/check_architecture_boundaries.py` — Expected: clean.
- [ ] **Step 5: Commit** `feat(domain): analyze mate-in-1 threats per game`.

### Task 2: The stored contract and its invariants

**Files:**
- Modify: `src/domain/mateThreats.ts`
- Test: `tests/mateThreatsContract.test.ts`

**Interfaces:**
- Consumes: `MateThreatsOk` from Task 1.
- Produces (all exported from `src/domain/mateThreats.ts`):
  - `export type InvalidReason = "illegal_game" | "corrupt_game";`
  - `export type StoredMateThreats = ({ v: 1; status: "ok" } & MateThreatsOk) | { v: 1; status: "invalid"; reason: InvalidReason };`
  - `export class InvalidMateThreats extends DomainError` with `code = "INVALID_MATE_THREATS"`.
  - `export function assertMateThreatsInvariants(p: MateThreatsOk, ctx: { plyCount: number; userColor: "white" | "black" }): void`
  - `export type ReadMateThreats = { state: "pending" } | { state: "ok"; value: MateThreatsOk } | { state: "invalid"; reason: InvalidReason } | { state: "unknown" };`
  - `export function readMateThreats(raw: string | null): ReadMateThreats`

- [ ] **Step 1: Write failing tests**, one `it` each: `shouldRejectWhenFacedIsNotTheSumOfTheThreeOutcomes`; `shouldRejectWhenPhaseTalliesDoNotAddUpToTheTotals`; `shouldRejectWhenMissedPliesLengthDiffersFromMissed`; `shouldRejectPliesOutsideTheGameOrNotIncreasingOrOfTheWrongColour` (white's plies are odd, black's even); `shouldAcceptAConsistentResult`; `readMateThreats` cases: `null → pending`, a valid stored JSON → `ok`, an `invalid` JSON → `invalid` with its reason, `{"v":2,…}` and malformed JSON and `{"v":1,"status":"ok"}` with a failing invariant-free shape (missing fields) → `unknown`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** the types, the error and both functions. `InvalidMateThreats` follows `IllegalGame` in `src/domain/gameReplay.ts`.
- [ ] **Step 4: Run** the new test file plus `tests/mateThreats.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(domain): versioned mate-threats contract with invariants`.

### Task 3: Migration, port and D1 adapter

**Files:**
- Create: `migrations/0018_mate_threats.sql`
- Modify: `src/ports/matchPort.ts`, `src/infrastructure/d1/d1MatchAdapter.ts`, `tests/helpers/testDb.ts`
- Test: `tests/mateThreatsAdapter.test.ts`

**Interfaces:**
- Produces on `MatchPort`:
  - `getPendingThreats(limit: number): Promise<{ items: { match_id: string; user_color: string | null; move_history: string }[]; totalPending: number }>`
  - `getThreatTarget(matchId: string): Promise<{ plyCount: number; userColor: "white" | "black" } | null>` (null when no detail row; `userColor` read from `matches`)
  - `saveMateThreats(matchId: string, stored: StoredMateThreats): Promise<void>`

- [ ] **Step 1: Write failing tests** against the real SQLite helper (`setupTestDb`): `shouldListOnlyGamesWithADetailAndNoStoredResultNewestFirst` (ties on `played_at` broken by `match_id` ascending, NULL `played_at` last); `shouldNotListAGameOnceItHasAnOkOrInvalidResult`; `shouldReturnNullTargetWhenThereIsNoDetail`; `shouldPersistTheJsonInOneUpdateAndOnlyThatColumn` (compare every other `match_details` column before and after); `shouldBeIdempotentWhenSavingTheSameResultTwice`.
- [ ] **Step 2: Run** — Expected: FAIL (column and methods missing).
- [ ] **Step 3: Implement** `0018_mate_threats.sql` (`ALTER TABLE match_details ADD COLUMN mate_threats TEXT;`), add `0018_mate_threats.sql` to the migration list in `tests/helpers/testDb.ts` and to every other test that lists migrations by hand (search `0017_opening_family_mate_type.sql` under `tests/` and add after it), then the three adapter methods. `saveMateThreats` is a single `UPDATE match_details SET mate_threats = ? WHERE match_id = ?` that stores `JSON.stringify(stored)`.
- [ ] **Step 4: Run** `npx vitest run` — Expected: all green (the full suite, since many tests list migrations).
- [ ] **Step 5: Commit** `feat(db): mate_threats column, pending queue and save`.

### Task 4: Machine routes

**Files:**
- Create: `src/application/recordMateThreats.ts`
- Modify: `src/api/chessDetail.ts`, `src/api/router.ts`, `src/api/schemas.ts`, `src/api/errors.ts`
- Test: `tests/mateThreatsRoutes.test.ts`

**Interfaces:**
- Consumes: Task 2 types/functions; Task 3 port methods.
- Produces:
  - `export async function recordMateThreats(port: MatchPort, matchId: string, body: MateThreatsBody): Promise<void>` where `export type MateThreatsBody = ({ status: "ok" } & MateThreatsOk) | { status: "invalid"; reason: InvalidReason }`. Throws `NotFoundError` when `getThreatTarget` is null; calls `assertMateThreatsInvariants` for `ok`; stamps `v: MATE_THREATS_VERSION`.
  - `export const mateThreatsBody` (zod, in `schemas.ts`): a strict discriminated union on `status`; strict means unknown keys (including `v`) fail.
  - `handleGetPendingThreats(db, req)` and `handlePostMateThreats(db, req, matchId)` in `chessDetail.ts`.
  - Routes `GET /api/chess/matches/pending-threats` and `POST /api/chess/matches/:id/threats`.
  - `INVALID_MATE_THREATS: 422` in `DOMAIN_STATUS`.

- [ ] **Step 1: Write failing route tests** through the real app with a machine token (mirror how `tests/apiChessDetail.test.ts` calls the router): `shouldAnswer401WithoutTheMachineToken` (GET and POST, and with the owner session cookie instead of the token → still 401 on POST); `shouldReturnOnlyTheThreeFieldsInPending`; `shouldStoreAnOkResultAndStampVersionOne`; `shouldStoreAnInvalidMarkerAndKeepItOutOfPending`; `shouldAnswer404AndWriteNothingWhenThereIsNoDetail`; `shouldAnswer422AndWriteNothingOnAnInvariantViolation` (and a prior valid value stays); `shouldReject422WhenTheBodyCarriesVOrUnknownKeys`; `shouldReject400OnInvalidJson`; `shouldBeIdempotentWhenPostedTwice`; `shouldNeverTouchOtherColumns`.
- [ ] **Step 2: Run** — Expected: FAIL (routes missing, 404/405).
- [ ] **Step 3: Implement** the use case, schema, handlers and routes; add `/api/chess/matches/pending-threats` to `MACHINE_READ`; update the access-policy comment in `router.ts`.
- [ ] **Step 4: Run** `npx vitest run tests/mateThreatsRoutes.test.ts tests/apiChessDetail.test.ts` and `npx tsc --noEmit` and the architecture check — Expected: PASS/clean.
- [ ] **Step 5: Commit** `feat(api): machine routes for pending threats and their results`.

### Task 5: The analysis script

**Files:**
- Create: `scripts/analyzeThreats.ts`
- Test: `tests/analyzeThreatsScript.test.ts`

**Interfaces:**
- Consumes: `analyzeMateThreats`, `parseStoredGame` (from `src/domain/gameReplay.ts`), the two machine routes.
- Produces: `export async function analyze(opts: { fetch: typeof fetch; worker: string; importToken: string; limit?: number; budgetMs?: number; now?: () => number; log?: (s: string) => void }): Promise<{ batches: number; ok: number; invalid: number; failed: number; remaining: number; aborted: string | null }>`; a CLI entry guarded like `hydrateChessDetails.mjs` that reads `WORKER` (required, no default) and `IMPORT_TOKEN` from the environment and prints one summary line with counts only.

- [ ] **Step 1: Write failing tests** with an injected fake `fetch` and clock: `shouldChainBatchesUntilNothingIsPending`; `shouldStopBetweenGamesWhenTheBudgetIsSpent` (fake `now`); `shouldPostAnInvalidMarkerWhenTheHistoryIsIllegalOrCorrupt` (`illegal_game` vs `corrupt_game`); `shouldContinueAfterAFailedPostAndCountIt`; `shouldAbortOn401WithoutRetrying`; `shouldNeverLogIdsMovesOrPerGameCounts` (collect `log` calls and assert no `match_id` substring and no digits-per-game); `shouldTrustTheCallerOnlyForLimitUpToOneHundred`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** the loop: GET pending with `limit`, for each item compute (`parseStoredGame(item.move_history, "[]")` then `analyzeMateThreats`), POST `{status:"ok",…}` or `{status:"invalid",reason}`, check the budget before each game, stop on empty `items`. `user_color` is lower-cased; anything other than white/black is skipped and counted as `failed`.
- [ ] **Step 4: Run** the test file, `npx tsc --noEmit` — Expected: PASS/clean. Then a dry end-to-end against an in-memory app: reuse the route-test app with the script's `fetch` pointed at it (one extra test, `shouldFillAllPendingGamesAgainstTheRealRoutes`).
- [ ] **Step 5: Commit** `feat(scripts): analyze pending mate threats and post results`.

### Task 6: Aggregates, filter and per-game plies

**Files:**
- Modify: `src/api/stats.ts`, `src/api/router.ts` (only if `kind` dispatch lives there), `src/api/game.ts`
- Test: `tests/apiThreats.test.ts`

**Interfaces:**
- Consumes: `readMateThreats` and types (Task 2).
- Produces:
  - `GET /api/stats/threats` → `{ analysed: number; pending: number; invalid: number; unknownVersion: number; totals: Tally; byPhase: Record<ThreatPhase, Tally>; recent: Tally & { games: number }; rest: Tally & { games: number }; gamesWithMissed: number }` where `Tally = { faced: number; neutralized: number; missed: number; unpunished: number; rate: number | null }` and `rate = neutralized / faced` or `null` when `faced = 0`. `recent` = the 100 most recent analysed (`status ok`) games by `played_at` DESC; `rest` = the other analysed games.
  - `GET /api/matches?missedThreat=1` keeps only games whose stored result is `ok` with `missed > 0`; rows gain `mate_threats_missed: number | null`.
  - `/api/me/matches/:id/game` JSON gains `missedPlies: number[]` (empty when pending/invalid/unknown).

- [ ] **Step 1: Write failing tests** (real SQLite): `shouldAggregateTotalsAndPhasesOverOkResultsOnly`; `shouldCountPendingInvalidAndUnknownVersionAside`; `shouldReturnNullRateWhenNothingWasFaced`; `shouldSplitRecentFromTheRestByPlayedAt`; `shouldFilterMatchesByMissedThreat`; `shouldAddMissedPliesToTheGameJson`; `shouldIgnoreMalformedStoredJsonWithoutFailing`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** `handleStatsThreats` (read the rows with `SELECT m.played_at, md.mate_threats …` and fold them with `readMateThreats` — the population is small; do not use `json_extract` for the `v` check), register `kind === "threats"` next to `"mates"`, add the filter and row field in `handleMatches`, and `missedPlies` in `handleMatchGame`.
- [ ] **Step 4: Run** `npx vitest run tests/apiThreats.test.ts tests/matchGame.test.ts tests/matchesFilters.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): threat aggregates, missed-threat filter and per-game plies`.

### Task 7: Dashboard card, filter chip and viewer plies

**Files:**
- Modify: `src/frontend.ts`, `src/dashboard.client.js`, `src/dashboard.client.css`
- Test: `tests/chessDashboardThreats.test.ts`

**Interfaces:**
- Consumes: Task 6 responses.
- Produces: a `#threatsCard` with `#threatsMain`, `#threatsPhases`, `#threatsTrend`, `#threatsNote`, and a `#threatsMissedBtn` that sets the matches filter to `missedThreat=1`; in the game viewer, a `#gMissed` list of buttons that jump to each missed ply.

- [ ] **Step 1: Write failing tests** driven through the dashboard runtime like `tests/chessDashboard.test.ts` (reuse its `openChess` pattern with `"/api/stats/threats"` added to the fake API): `shouldShowTheRateWithItsDenominator` (e.g. `Neutralizadas 738 de 1070 (69%)`), `shouldShowFailedAndUnpunishedCounts`, `shouldShowEachPhaseWithItsDenominator`, `shouldShowRecentAgainstTheRest`, `shouldStateThatOnlyMateInOneIsCounted`, `shouldExplainThereIsNoIntervalBecausePositionsAreNotIndependent`, `shouldShowHowManyGamesAreStillPending`, `shouldShowNothingMisleadingWhenNothingIsAnalysedYet`, `shouldFilterTheMatchesTableToMissedThreatsWhenTheButtonIsPressed` (asserts the request carries `missedThreat=1`), `shouldListMissedPliesInTheViewerAndJumpToOne`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** the markup, the render and the click wiring, following `#matesCard` and the viewer functions already in `dashboard.client.js`; all new copy in Spanish and descriptive ("Solo mate en 1", "tasas descriptivas de posiciones observadas").
- [ ] **Step 4: Run** the new file, then `npx vitest run tests/epistemicWording.test.ts tests/frontend.test.ts tests/chessDashboard.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(dashboard): mate-threat card, missed-games filter and viewer plies`.

### Task 8: Operations doc, full verification and PR

**Files:**
- Modify: `docs/OPERATIONS.md`

- [ ] **Step 1:** Add a section to `docs/OPERATIONS.md`: what `mate_threats` holds (the three states), how to see pending/invalid counts (`GET /api/stats/threats`), that a result is recomputed by setting the column `NULL`, the `IMPORT_TOKEN` boundary, and the order *apply migration 0018 → merge → pin the SHA in the collector*.
- [ ] **Step 2: Run** `npx vitest run`, `npx tsc --noEmit`, `python3 scripts/check_architecture_boundaries.py` — Expected: all green.
- [ ] **Step 3:** Request the migration be applied to remote by the owner (`yes | npx wrangler d1 migrations apply meridian --remote --config wrangler.private.jsonc`, run by the owner with `!`); do not merge before it is applied.
- [ ] **Step 4: Commit** `docs(ops): mate-threat results and rollout order`, push, open the PR with the spec link; merge only after the migration is confirmed.

---

## Part B — `meridian-collector` repository (second PR, after Part A is merged and deployed)

Work in a fresh clone under the scratchpad (`gh repo clone valentinlineiro/meridian-collector`, branch from `private/operational`). Do not push to a shared branch without the owner's go-ahead.

### Task 9: The scheduled workflow

**Files:**
- Create: `.github/workflows/threats.yml`, `tests/threatsWorkflow.test.ts`

**Why a separate workflow:** the Worker's "Sincronizar" button follows the whole `collector.yml` run; a threats job inside it would keep the button busy for as long as the backfill takes. `collector.yml` and its tests stay untouched.

**Interfaces:**
- Consumes: Part A merged; the merge commit SHA of Meridian (`MERIDIAN_SHA`, 40 hex chars) and `scripts/analyzeThreats.ts` at that SHA.

- [ ] **Step 1: Write failing tests** in `tests/threatsWorkflow.test.ts` (read the file like `collectorWorkflow.test.ts` does): `shouldRunOnScheduleOnlyWhenTheRepositoryVariableEnablesIt` (`if: github.event_name != 'schedule' || vars.THREATS_SCHEDULE == 'enabled'`); `shouldAlwaysAllowManualDispatch`; `shouldCheckOutMeridianAtAFullLengthShaNeverABranch` (matches `/ref: [0-9a-f]{40}/`, no `ref: main`); `shouldNeverRunTwoAtOnceNorCancelARunningOne` (`group: meridian-threats`, `cancel-in-progress: false`); `shouldTimeOutAfterFifteenMinutes`; `shouldPassOnlyTheWorkerAndTheExistingImportTokenSecret` (`secrets.MERIDIAN_IMPORT_TOKEN`, no other `secrets.`); `shouldInstallDependenciesFromTheLockfileWithoutLifecycleScripts` (`npm ci --ignore-scripts`); `shouldTargetTheSameExplicitWorkerAsTheCollector` (same `WORKER:` string as `collector.yml`); `shouldNotShareTheSyncGroupWithTheCollector` (`duolingo-collector` absent).
- [ ] **Step 2: Run** `npx vitest run tests/threatsWorkflow.test.ts` — Expected: FAIL (file missing).
- [ ] **Step 3: Implement** `.github/workflows/threats.yml`: `on: workflow_dispatch` and `schedule: - cron: "30 5 * * *"` (after the collector's `0 5 * * *`); a single job `threats` with the `if`, `concurrency`, `timeout-minutes: 15`, steps `actions/checkout@v4` of `valentinlineiro/meridian` at the pinned SHA into `meridian/`, `actions/setup-node@v4` (Node 24), `npm ci --ignore-scripts` in `meridian/`, then `node --experimental-strip-types meridian/scripts/analyzeThreats.ts` with `WORKER` and `IMPORT_TOKEN: ${{ secrets.MERIDIAN_IMPORT_TOKEN }}`.
- [ ] **Step 4: Run** the collector's full suite and typecheck — Expected: green.
- [ ] **Step 5: Commit**, push the branch, open the PR; the owner sets `THREATS_SCHEDULE` and runs the workflow once by hand to fill the 1,643 games.

---

## Self-review notes

- **Spec coverage:** metric definition and "no verdict on my last move" → Task 1; contract states, server-assigned `v`, union body, invariants → Tasks 2 and 4; atomic single-row `UPDATE`, `IS NULL` queue, idempotent `POST`, deterministic order → Tasks 3–4; batches of 100 chained within 12 minutes, no per-game logs → Task 5; aggregates without intervals, recent vs rest, pending/invalid/unknown counts → Task 6; card, filter, viewer plies, wording → Task 7; token boundary and rollout order → Tasks 4 and 8; checkout pinned to SHA, 15-minute limit, collector-side switch, separate workflow so Sync now is unaffected → Task 9.
- **Type consistency:** `MateThreatsOk`, `PhaseTally`, `StoredMateThreats`, `ReadMateThreats`, `MateThreatsBody` are defined once (Tasks 1, 2, 4) and consumed by name later; the port method names in Task 3 match Task 4 and Task 5's use.
- **Known small calls for the builder:** the Node version is the builder's choice within the constraints above; the cron time `30 5 * * *` is mine.
