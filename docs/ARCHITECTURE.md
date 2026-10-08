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

See `ENGINEERING_CONSTITUTION.md` for the general engineering rules (testing, naming, error mapping).
