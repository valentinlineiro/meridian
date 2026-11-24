# Games rediseñado por utilidad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (native, inline). Steps use checkbox syntax.

**Goal:** `/games` shows a per-game scoreboard by period, with the daily register behind one line and one button.

**Architecture:** Front end only. `games.ts`/`games.html`/`games.model.ts` change; the report page, the register sheet and the server do not.

**Tech Stack:** Angular 22 signals, vitest via `ng test`, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-11-24-games-redesign-design.md`

## Global Constraints

- Spanish copy; "unknown is never said as zero" (day unreadable → title "Hoy", no count).
- `games-chart.ts` and `trajectory()` stay: the report page uses them.
- Tests named `shouldXWhenY`; gates before push: `npm run typecheck`, `npm run web:lint`, `npm run web:test`, `npx playwright test` (axe on `/games`).
- Do not commit `.claude/` or `web/.impeccable/`.

## Review Focus

- Day unreadable (`d` null or malformed): title "Hoy", button still present, no "0 registrados".
- A game with few data: no beat percentage shown, only the count already shown.
- Every game recorded: button says "Editar lo de hoy"; draft waiting: "Continuar lo que escribías" present.
- Malformed game drops only its own card.

### Task 1: Register line instead of six rows

**Files:** Modify `web/src/app/features/games/games.html`, `games.ts`, `games.spec.ts`.

**Interfaces:** Produces `#gamesRegisterLine` (text from `todayTitle()`), the existing `#gamesRegisterOpen` button, `#gamesDraftResume`, `#gamesNote`. Removes `#gamesToday` and `#gamesToday-<k>`, the `today` computed and `flashed`/`flash` rows.

- [ ] **Step 1:** Rewrite the spec tests that used the six rows (`shouldListTheSixGamesWithTodaysTimeOrRegistrar`, `shouldOpenTheSheetOnTheGameOfTheRowTapped`, `shouldFlashTheLedgerRowOfAGameJustSaved`, `shouldNotSaySinRegistrarWhenTodayCouldNotBeRead`) as: `shouldShowOneRegisterLineAndNoPerGameRowsWhenTheHubLoads` (no `#gamesToday`, `#gamesRegisterLine` contains "Hoy · 2 registrados"), `shouldKeepTheLineAsHoyWhenTodayCouldNotBeRead` (no digit, button present). Keep the existing button, draft, edit-when-all-done tests.
- [ ] **Step 2:** Run `npm run test -w web -- --include='**/games/games.spec.ts' --watch=false`; expected: new tests FAIL (rows still there).
- [ ] **Step 3:** In `games.html` replace the `<ul class="gt">` block with `<p id="gamesRegisterLine">{{ todayTitle() }}</p>` inside `#gamesHero`, keep actions and note; in `games.ts` delete `today`, `flashed`, `flash` and the `(savedGames)="flash($event)"` bindings only if unused after the change (the sheet still emits; keep the output binding off).
- [ ] **Step 4:** Run the spec; expected: PASS.
- [ ] **Step 5:** Commit `feat(games): the register is one line and a button`.

### Task 2: Card shows change and beat rate; period and card events

**Files:** Modify `games.model.ts` (`summaryRows`), `games.html`, `games.spec.ts`; `games.model` has no spec file, test through `games.spec.ts`.

**Interfaces:** `summaryRows` rows gain `delta: string` (from `figures().delta`) and `beat: string` (`"Le ganas a la media en 71 % de las partidas"` or `''` when `verdict.state === 'few-data'` or `windows[range].beat.rate == null`).

- [ ] **Step 1:** Tests `shouldShowTheChangeAgainstThePreviousPeriodOnEachCard`, `shouldShowHowOftenYouBeatTheAverageOnEachCard`, `shouldNotShowTheBeatRateWhenThereIsTooLittleData`, `shouldTagThePeriodChooserAndEachCardForUmami` (`data-umami-event="games-period"` on the segmented, `games-open` on each `a.gc`).
- [ ] **Step 2:** Run; expected FAIL.
- [ ] **Step 3:** Implement in `summaryRows` row(); render two `muted` lines in the card; `event="games-period"` on `<app-segmented>`; `data-umami-event="games-open"` on `a.gc`.
- [ ] **Step 4:** Run; expected PASS. Commit `feat(games): cards show the change and how often you beat the average`.

### Task 3: One folded detail; drop Trayectoria and Dificultad

**Files:** Modify `games.html`, `games.ts`, `games.model.ts`, `games.spec.ts`.

- [ ] **Step 1:** Tests `shouldFoldTheWeekdayMapIntoOneClosedDetail` (`details#gamesDetail` closed, contains `#gamesLoss`), `shouldNotOfferTheTrajectoryOrTheDifficultyOnTheHub` (no `#gamesChart`, no `#gamesDiff`, no `#gamesTrajGame`). Delete the hub-rendered trajectory chart/table tests (`games trajectory chart`, `games trajectory data table` blocks) and `shouldDrawTheLastFourWeeksOfDifficultyMondayFirst`, `shouldKeepTheChartOneClickAwayUnderMoreDetail`; keep the pure `chartGeometry` tests and any that the report spec does not already cover (move them to `game-report.spec.ts` if they render through the hub only).
- [ ] **Step 2:** Run; expected new tests FAIL.
- [ ] **Step 3:** Replace the three sections by one `<details id="gamesDetail">` "Ver detalle: por día de la semana" (reuse the `app-section` pattern of the page if it renders a details, else a plain `details` with `dsum dsum-main`); delete `traj`, `trajPick`, `diff` in `games.ts`, `defaultTrajGame`/`difficultyGrid` in `games.model.ts` and their imports; keep `trajectory`.
- [ ] **Step 4:** Run the whole web suite, typecheck, lint, then `npx playwright test`. Expected all green.
- [ ] **Step 5:** Commit `feat(games): one folded detail; trajectory and difficulty leave the hub`.
