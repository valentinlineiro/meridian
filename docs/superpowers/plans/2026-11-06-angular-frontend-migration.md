# Angular Frontend Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-built dashboard (`src/dashboard.client.js`, `src/frontend.ts`, `src/settingsPage.ts`) with an Angular app, view by view, without changing the API, data model or hexagonal backend.

**Architecture:** Strangler. A standalone-components Angular app lives in `web/`, is built to static assets and served by the Worker (Workers Assets) under `/next/*` behind the existing session auth. The legacy dashboard keeps serving `/` untouched until every view is ported; then one cutover task moves Angular to `/` and deletes the legacy code. Production never has a half-migrated user-facing UI.

**Tech Stack:** Angular 22.2.4 (standalone, Router, Signals, `HttpClient`, application builder/esbuild), TypeScript 6.0.x, Vitest (Angular `unit-test` builder for `web/`, existing root Vitest for the Worker), Hono + Cloudflare Workers Assets.

**Spec:** none written (user opted out of the brainstorm). Decisions are the "Global Constraints" below; source conversation: the Angular proposal pasted 2026-11-06 + user's "Empieza ya con el plan por defecto".

## Global Constraints

- Backend untouched: no change to `/api/*` contracts, D1 schema, `src/domain|application|ports|infrastructure`. Only `src/api/router.ts`, `src/types.ts`, `wrangler*.jsonc`, `scripts/makeProductionConfig.ts`, CI and docs may change outside `web/`.
- Versions (verified on npm 2026-11-06): `@angular/*` `22.2.4`; its builder needs `typescript >=6.0 <6.1` and Node `^22.22.3 || ^24.15.0 || >=26`. CI today pins `node-version: 22` → must be `22.22.3` or `24`.
- Standalone components only (no NgModules); state in Signals; HTTP only via one `ApiClient` service on `HttpClient`; every route lazy-loaded with `loadComponent`.
- UI copy stays Spanish (`lang="es"`), decimal comma, `−` for negatives, `62 %` with space — reuse the existing formatters' behavior, covered by the ported tests.
- Auth stays server-side: HTML and assets are served only to an owner session; unauthenticated HTML → `302 /login?next=…`; any API `401` in the browser → `location.href='/login?next='+encodeURIComponent(path+search)` (current behavior).
- Constitution: tests named `shouldXWhenY`; mock only at the HTTP boundary (`HttpTestingController` / fake `ASSETS` binding), never between components and their own services.
- Legacy URLs keep working: `/`, `/overview`, `/chess`, `/languages[/<courseId>]`, `/changes`, `/trajectory`, `/profile`, `/games`, `/settings`, hash forms `#/x`, and `?course=<id>`.
- Don't deploy anything user-visible before Task 10. Tasks 1–9 may deploy (CD is on) because `/next/*` is additive.

## Review Focus

- Deep link `/next/languages/DUOLINGO_ES` after login → returns to that exact page (the `next` param survives the login round-trip through the SPA fallback).
- Session expires while the SPA is open → next API call redirects to login with the current route in `next`; no blank/zero-filled screen (existing `frontendErrorIsNotZero` rule: an error is never rendered as 0).
- CSP: Angular needs external `script-src 'self'` and inline styles; a CSP that is too loose on `/` (legacy) or too strict on `/next` (blank page) are both regressions.
- Unknown `/next/<garbage>` → client 404/redirect to overview, not a Worker 404 JSON; but `/next/main-<hash>.js` that doesn't exist → real 404 (no HTML served as JS).
- Race: fast route switching while a view's requests are in flight must not paint the old view's data (legacy has `changesSeq`/`recentSeq` guards; Angular needs `takeUntilDestroyed`/switchMap equivalents).

---

### Task 0: Toolchain floor (TypeScript 6, Node, Wrangler)

**Files:**
- Modify: `package.json`, `package-lock.json`, `tsconfig.json` (only if TS 6 requires), `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`
- Test: existing suite

**Interfaces:** Produces: repo on `typescript ~6.0`, Node ≥22.22.3 in CI, a Wrangler version that supports `assets.run_worker_first` and `assets.binding`.

- [ ] **Step 1:** Create branch `feat/angular-migration` from `main`.
- [ ] **Step 2:** `npm i -D typescript@~6.0 && npm run typecheck && npm test` — fix any TS 6 breakages in the smallest way; commit separately from the rest.
- [ ] **Step 3:** In both workflows set `node-version: 24`; verify locally with `node -v` ≥ 24.15.
- [ ] **Step 4:** Check `npx wrangler --version`; if < the first version documenting `assets.run_worker_first` (check Cloudflare docs via the `wrangler` skill), `npm i -D wrangler@^4` and run `npm run typecheck && npm test`.
- [ ] **Step 5:** Verification: `npm run typecheck && python3 scripts/check_architecture_boundaries.py && npm test` all green. Commit `chore: TypeScript 6, Node 24, Wrangler for Workers Assets`.

### Task 1: Angular workspace + Worker serves `/next/*`

**Files:**
- Create: `web/` (Angular workspace: `angular.json`, `web/tsconfig*.json`, `web/src/{index.html,main.ts,app/app.component.ts,app/app.routes.ts,app/app.config.ts}`), `tests/nextAssets.test.ts`
- Modify: `package.json` (scripts `web:build`, `web:test`, `web:dev`; `build` of web before `wrangler deploy`/`dev`), `wrangler.jsonc`, `wrangler.private.jsonc`, `scripts/makeProductionConfig.ts`, `src/types.ts` (`ASSETS: Fetcher`), `src/api/router.ts` (~line 276–292), `.gitignore` (`web/dist`, `web/.angular`), `.github/workflows/{ci,deploy}.yml` (`npm run web:build` before tests/deploy)

**Interfaces:**
- Produces: `GET /next` and `/next/*` → session-checked, then `env.ASSETS.fetch`; any path under `/next/` with no file extension → `/next/index.html` (SPA fallback); paths with an extension that miss → 404. Response for `index.html` carries `HTML_HEADERS` with CSP `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'`. Static files keep their own content-type and get `x-content-type-options: nosniff`.
- Angular: `outputPath: web/dist`, `baseHref: "/next/"`, bundle at `web/dist/browser`, `ng build` on Angular 22.2.4, zoneless.

- [ ] **Step 1: Write failing tests** in `tests/nextAssets.test.ts` using the existing router test helpers and a fake `ASSETS` (`{ fetch: (req) => … }` returning index.html / a js file / 404): `shouldRedirectToLoginWhenNextRequestedWithoutSession`, `shouldServeIndexWhenDeepLinkUnderNextHasSession`, `shouldServeBundleWithItsContentTypeWhenFileExists`, `shouldReturn404WhenAssetWithExtensionIsMissing`, `shouldKeepLegacyDashboardAtRoot`. Assert CSP on index contains `script-src 'self'` and the root response still contains the legacy CSP.
- [ ] **Step 2:** Run `npx vitest run tests/nextAssets.test.ts` → FAIL.
- [ ] **Step 3:** Scaffold `web/` with `npx @angular/cli@22.2.4 new` (standalone, routing, no SSR, no zone, vitest unit-test builder) inside `web/`; delete generated sample content; `app.routes.ts` has one placeholder route `{ path: '', loadComponent: … ShellPlaceholder }`.
- [ ] **Step 4:** Add `assets: { directory: "./web/dist/browser", binding: "ASSETS", run_worker_first: true }` to `wrangler.jsonc`, `wrangler.private.jsonc` and the production config generator (the generator refuses unknown keys today — extend its allow-list and its test). Remove nothing from the legacy `rules`.
- [ ] **Step 5:** Implement the `/next` handler in `src/api/router.ts` after the auth middleware (it already redirects HTML paths without a session; `isHtmlPath` covers `/next/*`). Use `app.get("/next", …)` and `app.get("/next/*", …)`.
- [ ] **Step 6:** `npm run web:build && npx vitest run tests/nextAssets.test.ts && npm run typecheck && npm test` → all pass. Manual: `npm run dev`, log in, open `/next/` and `/next/languages/X` (both show the placeholder), `/` still legacy.
- [ ] **Step 7:** Commit `feat(web): Angular workspace served under /next via Workers Assets`.

### Task 2: Shell, Router, ApiClient, global styles

**Files:**
- Create: `web/src/app/core/api-client.ts`, `core/unauthorized.interceptor.ts`, `core/sync.service.ts`, `shell/shell.component.ts`, `shell/side-nav.component.ts`, `web/src/styles.css` (copy of `src/dashboard.client.css`, tokens preserved), `web/src/app/**/*.spec.ts`
- Modify: `web/src/app/app.routes.ts`, `app.config.ts`

**Interfaces:**
- Produces: `ApiClient.get<T>(path: string, params?: Record<string,string|number>): Observable<T>`, `post/put` same shape; `provideHttpClient(withInterceptors([unauthorizedInterceptor]))`; `SyncService` with signals `busy(): boolean`, `note(): string`, `lastSyncLabel(): string` and `start(): void` (port of `doSync/trackSync/resumeSync`, `src/dashboard.client.js:168–225`); routes `overview|changes|trajectory|chess|languages|languages/:courseId|games|profile|settings`, each `loadComponent`, `''` → redirect `overview`, `**` → redirect `overview`; side nav groups Resumen/Dominios/Cuenta exactly as `src/frontend.ts:15–35` with `routerLinkActive`; mobile `side-toggle` collapsed menu.
- Consumes: nothing from earlier tasks except the `/next` hosting.

- [ ] **Step 1: Failing specs** (`HttpTestingController` only): `shouldRedirectToLoginWithCurrentRouteWhenApiReturns401`, `shouldNavigateToOverviewWhenPathIsUnknown`, `shouldMarkActiveSideItemWhenRouteMatches`, `shouldDisableSyncButtonWhileSyncing`, `shouldPollSyncStatusUntilDoneThenReload`. The 401 spec asserts the exact `next` encoding from `src/dashboard.client.js:53`.
- [ ] **Step 2:** `npm run web:test` → FAIL.
- [ ] **Step 3:** Implement the files above. Views are empty `<h2>` stubs (replaced in Tasks 4–9). No third-party UI library.
- [ ] **Step 4:** `npm run web:test && npm run web:build` pass; manual check of nav + mobile toggle in the browser (use the `run` skill / Playwright). Commit `feat(web): shell, router, ApiClient, sync service`.

### Task 3: Pure logic and legacy URL compatibility

**Files:**
- Create: `web/src/app/core/format.ts` (+ `.spec.ts`), `core/legacy-url.ts` (+ spec), `core/escape.ts`
- Modify: `app.routes.ts` (a canMatch/redirect that uses `legacy-url`)

**Interfaces:**
- Produces from `src/dashboard.client.js`: `shortDate(d: string): string` (:150), `relDate(iso: string): string` (:151), `pc1(n: number): string`, `pctCi(rate, ci)` (:1293), `fmtDelta` (:1213), `esc` (:1664), `formatMatchDate(playedAt, firstSeenAt)` (:1332); `legacyRedirect(pathname: string, hash: string, search: string): string | null` = the canonical path from `parseCanonicalRoute` (:3–40) or `null` when already canonical.
- Rule: port behavior, not text. Angular templates escape by default, so `esc` exists only for the few strings built outside templates (SVG/chart builders).

- [ ] **Step 1: Failing specs**, ported from `tests/frontend.test.ts`, `frontendEscaping.test.ts`, `frontendDeltas.test.ts`, `frontendWinRateCi.test.ts`: `shouldUseCommaDecimalsAndTypographicMinus`, `shouldWritePercentWithSpace`, `shouldRedirectHashRouteToCanonicalPath` (`#/languages/DUOLINGO_ES` → `/languages/DUOLINGO_ES`), `shouldRedirectCourseQueryToPath` (`?course=X`), `shouldNotRedirectWhenAlreadyCanonical`, `shouldEscapeHtmlInBuiltStrings`.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** `npm run web:test` PASS. Wire `legacyRedirect` as a router redirect at app start (it needs `location.hash`, which the Router does not see). Commit `feat(web): formatters and legacy URL redirects`.

### Task 4: Overview

**Files:** Create `web/src/app/features/overview/overview.component.ts` (+ `.html`/spec), shared `shared/{kpi,donut,sparkline}.component.ts`; port source `src/dashboard.client.js:783–1000, 1108–1142` and template `src/frontend.ts:38–` (overview section).

**Interfaces:** Consumes `ApiClient`, `format.ts`. Produces shared presentational components `<m-kpi label value sub>`, `<m-donut>`, `<m-sparkline [points]>` (ports of `kpi/donut/sparkline`, :237–277) reused by Tasks 5–8.

- [ ] **Step 1:** Port the assertions of `tests/frontendOverviewScope.test.ts`, `frontendEmptyAndErrorStates.test.ts` (overview cases), `frontendErrorIsNotZero.test.ts` as component specs: `shouldShowErrorNotZeroWhenStatsRequestFails`, `shouldRenderStreakAndDomainCards`, `shouldShowEmptyStateWhenNoData`, `shouldIgnoreStaleResponseWhenRouteChanged`.
- [ ] **Step 2:** FAIL → **Step 3:** implement with `signal`/`computed` + `resource`/`rxResource` for loading/error/value → **Step 4:** PASS + visual compare with legacy `/` side by side at 390px and 1280px. Commit `feat(web): Overview`.

### Task 5: Chess

**Files:** Create `features/chess/` (components: `chess.component`, `matches-table`, `match-detail-modal`, `openings`, `engine-profile`, `patterns`, `chess-board.component` (port `boardHtml`, :1396)); port source `src/dashboard.client.js:1004–1665` and tests `frontend.test.ts` chess parts, `frontendNetwork.test.ts`, `frontendVisitAnchor.test.ts` (if chess-bound), `frontendEvaluations.test.ts` chess parts.

**Interfaces:** Produces `MatchesService` with signals `rows()`, `offset()`, `filters()`, `missedOnly()`; `setFilter(group, value)`, `page(delta)`, `open(id)`. Search is debounced 300 ms (`onSearch`, :1376). Consumes shared components from Task 4.

- [ ] **Step 1:** Specs: `shouldFilterMatchesByChipAndResetPage`, `shouldPageBy50WhenNotCompact`, `shouldDebounceSearchBy300ms`, `shouldDropLateResponseWhenFilterChanged`, `shouldTrapFocusAndRestoreItInGameModal`, `shouldStepPliesWithinBounds`, `shouldShowConfidenceIntervalWithEveryColorDelta`.
- [ ] **Step 2–4:** FAIL → implement → PASS + visual compare. Commit `feat(web): Chess`. If this exceeds one sitting, split `match-detail-modal` into its own commit, not its own plan.

### Task 6: Languages

**Files:** Create `features/languages/{languages.component, course-detail.component, goal-summary}`; port `src/dashboard.client.js:283–780, 1143–1180`; route `languages/:courseId` uses `withComponentInputBinding()` (`courseId` as input). Tests ported from `frontend.test.ts` language parts.

- [ ] **Step 1:** Specs: `shouldSelectCourseFromRouteParam`, `shouldUpdateUrlWhenSelectingCourse` (replaces `selectCourse(…, skipHistory)`), `shouldFallBackToActiveCourseWhenParamUnknown` (priority rule at :388), `shouldRenderGoalColorByXp`.
- [ ] **Step 2–4:** as above. Commit `feat(web): Languages`.

### Task 7: LinkedIn Games

**Files:** Create `features/games/{games.component, games-table, games-chart (SVG), games-entry-modal}`; port `src/dashboard.client.js:1794–2007` (+ day load/save); tests from `tests/frontendGames.test.ts` (513 lines — largest port; keep every case name).

- [ ] **Step 1:** Port all cases of `frontendGames.test.ts` as specs, plus `shouldSaveResultThenRefreshDay`, `shouldUseLocalDayNotUtc` (`localToday`, :1794).
- [ ] **Step 2–4:** FAIL → implement → PASS + visual compare. Commit `feat(web): LinkedIn Games`.

### Task 8: Changes, Trajectory, Profile

**Files:** Create `features/{changes,trajectory,profile}/…`; port `src/dashboard.client.js:1664–1794, 2008–end` and the `changesSeq` flow; tests `frontendWhatChanged.test.ts`, `frontendTrajectory.test.ts`, `frontendTrajectoryEvaluations.test.ts`, `frontendEvaluations.test.ts`, `frontendVisitAnchor.test.ts`.

**Interfaces:** Profile since-cut is `localStorage` key `PROFILE_CUT_KEY` (:1689) — keep the same key so the user's saved cut survives; wrap in try/catch as today.

- [ ] **Step 1:** Port the five test files as specs; add `shouldKeepProfileCutAcrossReloadWithSameStorageKey`.
- [ ] **Step 2–4:** one commit per view: `feat(web): Changes`, `feat(web): Trajectory`, `feat(web): Profile`.

### Task 9: Settings

**Files:** Create `features/settings/settings.component.ts`; port `src/settingsPage.ts` (54 lines) onto `PUT /api/me/settings`, `/api/me/changes-anchor` etc. via `ApiClient`; **Logout** stays a real `<form method="post" action="/logout">` (cookie clear is server-side).

- [ ] **Step 1:** Specs: `shouldSaveDailyGoalViaApi`, `shouldShowErrorWhenSaveFails`. Existing settings tests that assert the HTML (`grep -l SETTINGS_HTML tests`) are ported.
- [ ] **Step 2–4:** FAIL → implement → PASS. Commit `feat(web): Settings`.

### Task 10: Cutover and deletion of the legacy frontend

**Files:**
- Delete: `src/dashboard.client.js`, `src/dashboard.client.css`, `src/frontend.ts` (including `RAW_HTML` and the `/raw` route: user confirmed 2026-11-06 it is unused), `src/settingsPage.ts`, `src/text-modules.d.ts`, `tests/frontend*.test.ts` (all superseded), `tests/helpers/dom.ts`, `tests/clientAssetsAsText.test.ts`, `tests/dashboardClientScript.test.ts`, `tests/setup/clientAssetsAsText.ts`
- Modify: `src/api/router.ts` (remove `app.get("/raw")` and the `RAW_HTML` import; serve the Angular index at `/`, `/overview`, … and every canonical path; `/next/*` → 301 to the same path without `/next`), `web/angular.json` + `app.config.ts` (`baseHref: "/"`), `wrangler*.jsonc` + `scripts/makeProductionConfig.ts` (drop the `rules` Text entry — memory: hand-deployed configs need it only while legacy exists), `vitest.config.ts` (drop plugin), `docs/ARCHITECTURE.md`, `docs/OPERATIONS.md`, `docs/ux/*` references, `tests/nextAssets.test.ts` (rename `spaAssets.test.ts`)

- [ ] **Step 1:** Failing tests: `shouldServeAngularIndexAtEveryCanonicalPath`, `shouldRedirectNextPrefixToRoot`, `shouldKeepLoginAndLogoutAsServerPages`, `shouldRedirectLegacyLinkedinGamesPath`.
- [ ] **Step 2:** Implement router change; remove legacy files; fix imports until `npm run typecheck` is clean.
- [ ] **Step 3:** Acceptance gate before merge: `npm run web:build && npm run typecheck && python3 scripts/check_architecture_boundaries.py && npm test && npm run web:test` green; manual pass over all 9 routes + login redirect + session-expiry + mobile 390px, comparing with the last legacy deploy.
- [ ] **Step 4:** Update docs; open the PR (user merges — CD deploys on green push to `main`). Commit `feat(web)!: Angular replaces the legacy dashboard`.

### Task 11: Quality pass

- [ ] **Step 1:** Run the `web-perf` skill on the deployed app: record LCP/INP/CLS and bundle size vs legacy; set an initial-bundle budget in `angular.json` (`budgets`) at the measured size + 10 %.
- [ ] **Step 2:** Run `design:accessibility-review`: keyboard focus on both modals, `aria-expanded` on the mobile nav, route-change focus/title announcement (`title` on each route).
- [ ] **Step 3:** Fix findings in small commits; update `docs/ARCHITECTURE.md` frontend section (feature folders, boundaries: `features/*` may import `core/*` and `shared/*`, never each other).

## Self-Review

- **Coverage:** proposal phases 1–8 map to Tasks 1, 2–3, 4, 5–6, 7–8, 9–10, 11; Task 0 covers the TypeScript/Node/Wrangler cost named in the proposal.
- **Open risks (not decided here):** whether Wrangler 3.x supports `run_worker_first` (Task 0 verifies); `wrangler.private.jsonc` and the production-config generator both need the `assets` block (Task 1 step 4).
- **Types:** `ApiClient`, `format.ts` exports and shared `m-*` components are defined in Tasks 2–4 and only consumed afterwards.
