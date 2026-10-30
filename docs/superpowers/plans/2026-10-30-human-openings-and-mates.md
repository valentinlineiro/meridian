# Human openings and mate types — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show opening families and mate types by Spanish name in every chess stat, filter and table pill, from two new stored columns.

**Architecture:** Pure domain classifiers (`src/domain`) compute `opening_family` (coordinate-prefix table, no engine) and `mate_type` (final position via `chess.js`). `recordMatchDetail` fills them on save; a script backfills existing rows into SQL the owner applies. Stats endpoints group by the new columns; the dashboard renders labels from one key→label map served by the API.

**Tech Stack:** TypeScript, Cloudflare Workers + D1, Hono, `chess.js` (already a dependency), vitest.

**Spec:** `docs/superpowers/specs/2026-10-30-human-openings-and-mates-design.md`

## Global Constraints
- Family only, never a variant ("Siciliana", not "Siciliana, Najdorf").
- Domain imports nothing from application/ports/db/infrastructure/api/analytics/normalization/hono/zod (`scripts/check_architecture_boundaries.py`).
- Tests named `shouldXWhenY`; no mocks between internal layers.
- Never fail a save because classification fails: fall back to `unclassified` / `NULL`.
- No raw coordinates on screen. Unrecognised game → "Otra apertura"; fewer than 2 plies → `unclassified` ("Sin datos").
- Production writes (migration `0017`, backfill) only with the owner's explicit grant; this plan does not execute them.
- Correction to the spec: `classifyGame(moves)` takes no `userColor`; a family is a property of the game, the user's side is applied in stats from `matches.user_color`.

## Review Focus
- A game with 0 or 1 plies → `unclassified`, mate `null`, no throw.
- Moves that are illegal or not coordinates → both fields fall back, save still succeeds.
- Checkmate recorded but position is not mate (stored `end_condition` disagrees) → `mate_type` stays `null`; the end pill shows plain "Mate".
- Stalemate / timeout / resignation → `mate_type` is `null`, never a guessed type.
- Promotion mate (`e7e8q`) and en-passant positions replay correctly.
- Rows with `NULL` family are excluded from family stats and counted as "sin clasificar", not folded into "Otra apertura".
- A user playing black vs white against the same family appear under the right colour tab.
- Backfill run twice yields identical SQL (idempotent); rows it cannot classify are skipped, not nulled over a good value.

## File Structure
- Create `src/domain/openingFamily.ts` — `FAMILIES` table, `OPENING_FAMILY_LABELS`, `classifyOpeningFamily`.
- Create `src/domain/mateType.ts` — `MateType`, `MATE_TYPE_LABELS`, `classifyMate`.
- Create `src/domain/gameClassification.ts` — `classifyGame` (composes the two).
- Create `migrations/0017_opening_family_mate_type.sql`.
- Modify `src/types.ts`, `src/ports/matchPort.ts`, `src/infrastructure/d1/d1MatchAdapter.ts`, `src/application/recordMatchDetail.ts` — carry and persist the two columns.
- Create `scripts/backfillClassification.ts` — rows JSON in, SQL + counts out.
- Modify `src/api/stats.ts` — openings by family; new `mates` stat; `/api/matches` returns the columns and filters `opening` on family.
- Modify `src/dashboard.client.js`, `src/frontend.ts`, `src/dashboard.client.css` — labels, filter, mates block, end pill.

---

### Task 1: Opening family classifier
**Files:** Create `src/domain/openingFamily.ts`; Test `tests/openingFamily.test.ts`
**Interfaces:**
- Produces: `type OpeningFamily = string` (key); `OPENING_FAMILY_LABELS: Record<string,string>` (includes `other: "Otra apertura"`, `unclassified: "Sin datos"`); `classifyOpeningFamily(moves: readonly string[]): string` — longest-prefix match over the first 8 plies, `unclassified` if `moves.length < 2`, `other` if no prefix matches.

- [ ] **Step 1: Write the failing test** with these exact assertions (moves in coordinates, first 2–6 plies): `e2e4 e7e5 g1f3 b8c6 f1b5` → `ruy_lopez` ("Española (Ruy López)"); `… f1c4` → `italian` ("Italiana"); `e2e4 e7e5 g1f3 b8c6 d2d4` → `scotch`; `e2e4 e7e5 g1f3 g8f6` → `petrov`; `e2e4 e7e5 f2f4` → `kings_gambit`; `e2e4 c7c5` → `sicilian`; `e2e4 e7e6` → `french`; `e2e4 c7c6` → `caro_kann`; `e2e4 d7d5` → `scandinavian`; `d2d4 d7d5 c2c4` → `queens_gambit`; `d2d4 g8f6` → `indian`; `d2d4 f7f5` → `dutch`; `c2c4 e7e5` → `english`; `g1f3 d7d5` → `reti`; `["e2e4"]` → `unclassified`; `[]` → `unclassified`; `["a2a3","a7a6"]` → `other`; longest wins (`ruy_lopez` over the generic `e4 e5` bucket if one exists).
- [ ] **Step 2: Run** `npx vitest run tests/openingFamily.test.ts` — expect FAIL (module missing).
- [ ] **Step 3: Implement** the table as ordered `{ key, prefix: string[] }` entries, matched longest-first; the builder completes it to ~25 families, checking names against standard ECO families (no variants), adding each new family's labelled assertion to the test.
- [ ] **Step 4: Run** the test — expect PASS. Run `python3 scripts/check_architecture_boundaries.py` — OK.
- [ ] **Step 5: Commit** `feat(domain): opening family classifier`.

### Task 2: Mate type classifier and `classifyGame`
**Files:** Create `src/domain/mateType.ts`, `src/domain/gameClassification.ts`; Test `tests/mateType.test.ts`
**Interfaces:**
- Produces: `type MateType = "back_rank"|"scholars"|"fools"|"smothered"|"queen"|"rook"|"bishop"|"knight"|"pawn"`; `MATE_TYPE_LABELS` (pasillo, pastor, loco, ahogado, "con dama", "con torre", "con alfil", "con caballo", "con peón" — prefixed "Mate "); `classifyMate(moves: readonly string[]): MateType | null`; `classifyGame(moves: readonly string[]): { openingFamily: string; mateType: MateType | null }`.

- [ ] **Step 1: Write the failing test.** Cases: fool's mate `f2f3 e7e5 g2g4 d8h4` → `fools`; scholar's mate `e2e4 e7e5 f1c4 b8c6 d1h5 g8f6 h5f7` → `scholars`; a back-rank rook mate (king on g8/g1 boxed by its own pawns) → `back_rank`; a Philidor/knight smothered mate → `smothered`; a plain queen mate → `queen`; a promotion mate ending `…e7e8q` → `queen`; moves not ending in mate → `null`; stalemate position → `null`; `[]` → `null`; illegal moves → `null` (no throw). `classifyGame(["e2e4"])` → `{ openingFamily: "unclassified", mateType: null }`.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** with `chess.js`: replay the moves, return `null` unless `isCheckmate()`; check `fools`, `scholars` (queen mate on f7/f2, ≤ 4 full moves), `smothered` (mating knight, every king neighbour occupied by its own pieces), `back_rank` (mating rook/queen along the king's back rank, king on its first rank), else by the mating piece. Catch any replay error → `null`.
- [ ] **Step 4: Run** — expect PASS; boundary script OK.
- [ ] **Step 5: Commit** `feat(domain): mate type classifier and classifyGame`.

### Task 3: Schema and write path
**Files:** Create `migrations/0017_opening_family_mate_type.sql`; Modify `src/types.ts`, `src/ports/matchPort.ts`, `src/infrastructure/d1/d1MatchAdapter.ts`, `src/application/recordMatchDetail.ts`; Test `tests/recordMatchDetailClassification.test.ts`
**Interfaces:**
- Consumes: `classifyGame` (Task 2).
- Produces: `EnrichedMatchDetailRecord` gains `opening_family: string | null; mate_type: string | null`; `match_details.opening_family` / `.mate_type` columns written by `saveMatchDetail`.

- [ ] **Step 1: Write the failing test** through `createSqliteD1` with migrations `0001,0004,0005,0006,0007,0017`: saving a detail whose moves are the Italian opening → row has `opening_family = 'italian'`, `mate_type = NULL`; saving the scholar's-mate game → `mate_type = 'scholars'`; saving garbage moves (`["zz"]`) succeeds with `opening_family = 'unclassified'`, `mate_type = NULL`; re-saving updates both (upsert).
- [ ] **Step 2: Run** — expect FAIL (columns missing).
- [ ] **Step 3: Implement** migration (`ALTER TABLE match_details ADD COLUMN opening_family TEXT; ... mate_type TEXT; CREATE INDEX idx_match_details_family ON match_details(opening_family);`), thread the two fields through the types, the port, and the INSERT/UPSERT column lists in `d1MatchAdapter.ts`, and compute them in `recordMatchDetail` next to `openingKey`.
- [ ] **Step 4: Run** the new test and `npx vitest run` — all pass; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat(chess): store opening family and mate type with each match detail`. Do **not** run `migrate:remote`.

### Task 4: Backfill script
**Files:** Create `scripts/backfillClassification.ts`; Test `tests/backfillClassification.test.ts`
**Interfaces:**
- Consumes: `classifyGame`.
- Produces: `buildBackfill(rows: { match_id: string; move_history: string }[]): { sql: string; counts: { families: Record<string,number>; mates: Record<string,number>; skipped: number } }`; CLI `node --experimental-strip-types scripts/backfillClassification.ts <rows.json> [--apply-sql=<out.sql>]` — without the flag it prints counts only (dry run).

- [ ] **Step 1: Write the failing test:** two rows (Italian opening; scholar's mate) → SQL contains an `UPDATE match_details SET opening_family='italian', mate_type=NULL WHERE match_id='…'` and the scholar row with `mate_type='scholars'`; counts match; a row with unparseable `move_history` is counted in `skipped` and absent from the SQL; calling twice returns identical output; match ids containing `'` or `|` are escaped/quoted correctly (`bot|1793…` appears intact, a `'` is doubled).
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** `buildBackfill` and a thin CLI wrapper; emit statements in batches of 100, ordered by `match_id`.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat(scripts): backfill opening family and mate type`.

### Task 5: Stats API
**Files:** Modify `src/api/stats.ts`; Test `tests/apiOpenings.test.ts` (update) and `tests/apiMates.test.ts`
**Interfaces:**
- Consumes: `OPENING_FAMILY_LABELS`, `MATE_TYPE_LABELS`; columns from Task 3.
- Produces: `/api/stats/openings` → `{ population, white: OpeningStat[], black: OpeningStat[], unclassified: number, labels: Record<string,string> }` with `OpeningStat.key` = family key and `name` = its label; `/api/stats/mates` → `{ given: {type:string,label:string,games:number}[], received: {...}[], unclassified: number }`; `/api/matches` rows include `opening_family`, `mate_type`, and `?opening=` filters `md.opening_family`.

- [ ] **Step 1: Write failing tests:** family stats group by `opening_family` per colour with Spanish `name`; a row with `opening_family IS NULL` is excluded from lists and counted in `unclassified`; mates: a `win` with `mate_type='back_rank'` counts under `given`, a `loss` under `received`, a `draw`/unknown result under neither; `?opening=sicilian` returns only those matches.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** by replacing the `opening_key` SQL in `handleStatsOpenings` with `opening_family`, adding `handleStatsMates` and routing `kind === "mates"` next to `openings` (line ~202), and swapping the `eq("md.opening_key", …)` filter to `md.opening_family`.
- [ ] **Step 4: Run** `npx vitest run` — all pass (update the old opening-key assertions to family keys).
- [ ] **Step 5: Commit** `feat(stats): openings by family and mate types`.

### Task 6: Dashboard
**Files:** Modify `src/dashboard.client.js` (row pill ~line 1157, `pillEnd` ~1094, `populateOpeningFilter` ~1045, openings render ~1310, `loadChessDashboard` ~1222), `src/frontend.ts` (mates block next to `#openingsCard`), `src/dashboard.client.css`; Test `tests/chessDashboard.test.ts` (extend)
**Interfaces:**
- Consumes: Task 5 payloads and `/api/matches` fields.

- [ ] **Step 1: Write the failing test** in the existing dashboard runtime harness (`tests/helpers/dom.ts`): a row with `opening_family: "sicilian"` renders "Siciliana" and never `e2e4`; `end_condition: "checkmate", mate_type: "back_rank"` renders "Mate · pasillo"; checkmate with null `mate_type` renders "Mate"; the mates block lists given/received counts; the openings card shows "N sin clasificar" when `unclassified > 0`.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement** the label lookups from the API's `labels`, the row pill, the end pill, the filter options from family keys, and the "Cómo terminan tus mates" block (two short lists, hidden when both are empty); the stat fetch for `/api/stats/mates` degrades on its own to nothing (`opt(...)` pattern), like the other cards.
- [ ] **Step 4: Run** `npx vitest run`, `npx tsc --noEmit`, boundary script — all clean.
- [ ] **Step 5: Commit** `feat(dashboard): humanised openings and mate types`.

### Task 7: Rollout gate (owner-run, not executed by the plan)
- [ ] Merge to `main` (CD deploys code that tolerates NULL columns only after the migration; **apply `0017` to remote first**, owner's `npm run migrate:remote`).
- [ ] With the owner's explicit grant: export `match_id, move_history` from prod, run the script in dry-run, review counts with the owner, then apply the generated SQL in batches and re-check the dashboard.
