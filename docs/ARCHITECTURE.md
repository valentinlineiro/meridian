# Architecture notes

Dependencies point inward: **delivery / infrastructure → application → domain**.

- `domain` has no framework, database or HTTP imports.
- `application` use cases depend on `ports` only — never on adapters, `db` or `api`.
- `infrastructure` adapters implement ports directly.
- `domain` and `application` never import `hono` or `zod`; validation happens at the delivery boundary.

`scripts/check_architecture_boundaries.py` enforces these rules in CI.

## Vertical slices (how new functionality is built)

One use case or cohesive group of them = one slice under `src/slices/<slice>/`:

```text
slices/<slice>/
  domain/           entities, value objects, domain errors (extend kernel DomainError). No imports outside domain, kernel.
  ports/            interfaces the application needs (repositories, gateways).
  application/      use cases: classes with constructor-injected ports; real domain, no framework.
  infrastructure/   adapters implementing the ports (D1, HTTP clients).
  delivery/         thin Hono routes: parse input (zod), call the use case, return JSON. Never imports infrastructure or db.
  module.ts         the slice's DI tokens and registration (the only place that pairs ports with adapters).
```

- `src/kernel/` is the shared kernel: the DI `Container`/`Token` and `DomainError`. It depends on nothing else.
- `src/composition/` is the composition root: `buildContainer(env)` registers shared adapters and every slice. Delivery gets the container from the request context (`c.get("container")`); use cases never see it.
- A slice is self-contained: it declares the ports it needs, even when another slice needs the same lookup. It never imports another slice nor the legacy `src/ports/`; the only shared pieces are the kernel, `src/domain/` helpers and `src/application/errors.ts`.
- Errors: domain rules throw `DomainError` subclasses with a stable `code`; use-case failures throw `ApplicationError` subclasses. `src/api/errors.ts` is the single place mapping them to HTTP (a domain code without an entry there is a 500 on purpose: map it explicitly).
- Tests per slice live in `tests/slices/<slice>/`: `unit.test.ts` (real application + real domain, in-memory fakes of the ports from `fakes.ts`), `integration.test.ts` (HTTP through the worker to a real SQLite D1), and E2E only for journeys the lower levels cannot prove. Titles follow `shouldDoWhateverWhenInputIsWhatever`.

`scripts/check_architecture_boundaries.py` enforces the layer whitelist, slice isolation, kernel purity and the test naming of `tests/slices` and `tests/kernel`.

Pilot: `slices/daily-goal` (the user's own daily XP goal).

Older code still uses the horizontal layout (`api/`, `application/`, `db/`, `ports/`, `infrastructure/`) and some handlers contain handler-local SQL. It is not migrated proactively: when a feature changes it, the touched behaviour moves into a slice. Known debt: the provider-account query exists in `src/db/users.ts` and in `slices/daily-goal` until sync is migrated and identity gets its own slice.

## Frontend (`web/`)

The dashboard is an Angular app (`web/`, built by `npm run web:build` to `web/dist/browser`). The Worker serves it through the
Workers Assets binding `ASSETS` (`run_worker_first: true`), after the access policy in `src/api/router.ts`: every extension-less
non-API path (and `/index.html`) gets `index.html` with a CSP that allows no inline script; a path with an extension is a bundle
file, and a missing one is a 404 (no SPA fallback for files). `/login` and `/logout` stay server-rendered. `/next/*` (the
migration prefix) answers 301 to the same path at the root.

```text
web/src/app/
  core/       ApiClient (10 s timeout, BROWSER_LOCATION), 401 interceptor -> /login?next=, sync, stats bundle, format, legacy URLs
  shared/     presentational pieces (kpi, donut, sparkline, evaluation cards)
  shell/      header + side nav (the only place that links every view)
  features/   one folder per view: overview, chess (+ /profile), languages, games, changes, trajectory, settings
```

- `features/*` may import `core/*` and `shared/*`, never another feature. Checked when this section was written
  (`grep` for `../<feature>/` and `features/` imports under `features/`): no violations. Specs import `app.routes` to drive
  the real router; that is test wiring, not a feature dependency. This rule is not yet enforced by
  `scripts/check_architecture_boundaries.py`.
- Each view tolerates a malformed or failed response on its own: a card says "No disponible" (or a dash), never a zero.
- Product wording rules and the layout rules of the global stylesheet are guarded from the root suite
  (`tests/webCopyInvariants.test.ts`); behaviour is tested in `web/` (`npm run web:test`).
- Design system (stable; change it only for a concrete need, see PR #130):
  - Tokens live in the `:root` block of `web/src/styles.css`: colours (`--bg`, `--surface`, `--line`, `--muted`, `--accent`, `--ok`, `--err`, pill sets…),
    radii (`--r-sm|md|lg|pill`) and type (`--fs-xs|sm|md|lg|xl|h|display`). No raw hex, `font-size` or `border-radius` in px outside `:root`;
    `tests/webDesignTokens.test.ts` fails if one appears.
  - Controls: one global rule styles `input`/`select`; contexts only set widths. `.btn` + `.btn-g` is the default button, `.btn-p` a primary action,
    and a toggled button is `.btn[aria-pressed=true]` (never a class swap).
  - Dialogs use `<app-modal>` (`shared/modal.ts`): Escape, backdrop click, Tab trap, initial focus and focus restore. Not native `<dialog>`
    because jsdom has no `showModal()`. Scroll lock and `inert` are deliberately not implemented.

### Decision: Angular, through a strangler (2026-11)

The legacy dashboard was one inline script (`src/dashboard.client.js`, ~2,400 lines) plus HTML in `src/frontend.ts`. It needed
`script-src 'unsafe-inline'` and was tested by running the script in a `vm` sandbox against string HTML. We moved to Angular for
typed components, real DOM tests and a CSP without inline scripts. The move was a strangler: the app was served under `/next/`
next to the legacy page, one view per task with its legacy tests ported, and the cutover deleted the old page only after every
view was ported. The cost is a framework and a build step (`npm run web:build`) that every deploy, CI job and hand-deployed
wrangler config (the `assets` block) must include.

See `ENGINEERING_CONSTITUTION.md` for the general engineering rules (testing, naming, error mapping).
