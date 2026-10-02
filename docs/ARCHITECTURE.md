# Architecture notes

Dependencies point inward: **delivery / infrastructure → application → domain**.

- `domain` has no framework, database or HTTP imports.
- `application` use cases depend on `ports` only — never on adapters, `db` or `api`.
- `infrastructure` adapters implement ports directly.
- `domain` and `application` never import `hono` or `zod`; validation happens at the delivery boundary.

`scripts/check_architecture_boundaries.py` enforces these rules in CI.

## New vertical slices

New functionality enters through the application layer and uses ports for external dependencies. Delivery handlers stay thin.

Some older handlers still contain handler-local SQL. That code is not migrated proactively; when a future feature changes it, only the touched behaviour moves to application + ports if the existing structure gets in the way.

See `ENGINEERING_CONSTITUTION.md` for the general engineering rules (testing, naming, error mapping).
