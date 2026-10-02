# Longitudinal Stats

A personal analytics system that turns repeated observations of an account's activity into **historical memory**: snapshots, temporal comparisons, change detection and auditable trajectory findings — on Cloudflare Workers + D1.

> **Independent personal project. Not affiliated with, sponsored by, or endorsed by Duolingo.**
> It was built around one learner's own activity data; this repository ships with synthetic data only.

## What this demonstrates

- **Longitudinal data modeling** — immutable snapshots, deduplicated by checksum, with derived state reconstructable at any past instant.
- **Evidence-first analytics** — every finding carries its claim, its evidence and the observation window it came from.
- **Clean architecture** — domain → application → ports → adapters, enforced by a CI guard (`scripts/check_architecture_boundaries.py`).
- **Historical comparison** — "what changed between *t₁* and *t₂*", with explicit comparability rules instead of silent subtraction.
- **Security boundaries** — closed-by-default route policy, signed sessions, CSRF defence, login throttling.
- **Deterministic testing** — in-memory SQLite behind the same D1 interface, a fake clock, invented fixtures.

## Architecture

```text
Observation (JSON snapshot) ──► POST /api/snapshot (bearer token)
        │  validate → stable hash → dedupe → normalize → persist
        ▼
   Cloudflare D1  (snapshots · matches · courses · xp_summaries · user_state · …)
        │
        ▼
 Application use cases ──► Hono delivery layer ──► dashboard / JSON API (owner session)
```

```text
src/
  domain/          pure rules and types (what-changed, trajectory, user)
  application/     use cases; depend on ports only
  ports/           interfaces the use cases need
  infrastructure/  D1, PBKDF2 and HMAC adapters implementing those ports
  analytics/       pure statistics over normalized rows
  normalization/   source payload → internal model (never null→0 on ratings)
  ingestion/       stable stringify + SHA-256, schema observation
  api/             HTTP delivery: router, access policy, thin handlers
migrations/        D1 schema
demo/              invented dataset + seed script
```

New functionality enters through the application layer and uses ports for external dependencies; some older handlers still contain handler-local SQL and are migrated only when touched (see `docs/ARCHITECTURE.md`).

## Design principles

```text
Evidence      > Interpretation
Historical    > Snapshot
Observed     != Interpreted
Personal analytics > replication of the upstream product
```

Concretely: raw observations are stored once and never rewritten; metrics are derived from them; findings state what was observed and for which window; "unknown" is never coerced to zero.

## Domain model

| Concept | Meaning |
|---|---|
| **Snapshot** | One immutable observation of the source, keyed by checksum; re-sending identical data is a no-op. |
| **Match** | A chess game seen in one or more snapshots (`first_seen_at` / `last_seen_at`, canonical `played_at`). |
| **Course / section** | Curriculum structure observed per course, with the last time each was confirmed. |
| **XP summary** | Daily account-level activity, primary key `(user, date)`, idempotent under re-ingestion. |
| **User state** | Latest observed account state; auxiliary captures never overwrite the active course. |

## Analytics

- **Chess** — results, colour split, opponent segmentation (bot / human), openings and game phases, streaks, timeline.
- **Languages** — activity intensity and concentration, weekly rhythm, curriculum progress per course. Progress is only compared across observations when the curriculum denominator is unchanged (`ΔtotalUnits = 0`); otherwise the report says the structure changed.
- **What changed** — deltas between two instants (rating, win rate, XP, sessions, streak) plus rule-based findings.
- **Trajectory** — split-half and era analysis across the whole observed span; returns *no findings* when the evidence is too thin.

Contracts for the language module are in `docs/contracts/` (written in Spanish).

## Security

- **Route policy** — one central policy in `src/api/router.ts`; anything not listed is closed. Writes need a bearer token; everything else needs the owner session. Matrix in `docs/audits/`.
- **Authentication** — single-owner login; password verified with salted PBKDF2-SHA256; the check runs even when the e-mail is wrong.
- **Sessions** — stateless `__Host-` cookie (`HttpOnly; Secure; SameSite=Lax`), HMAC-SHA256 signed, 7-day expiry; rotating the secret invalidates all sessions.
- **CSRF** — cookie-authenticated writes additionally require a same-origin signal.
- **Throttling** — 10 failed attempts per 15 minutes, reserved atomically in D1 *before* the password check, so a concurrent burst cannot exceed the limit.
- **No CORS** — the dashboard is same-origin; no cross-origin headers are ever emitted.

## Testing

812 tests across 57 files: unit tests for pure analytics, integration tests that run the real router against in-memory SQLite with the project's migrations, and a journey test (`tests/demoJourney.test.ts`) that goes *snapshot → deduplication → historical comparison → trajectory → chess summary* on the demo dataset with a fake clock. Test names follow `shouldXWhenY`.

```bash
npm install
npm test
npm run typecheck
python3 scripts/check_architecture_boundaries.py
```

## Run the demo locally

```bash
npx wrangler d1 migrations apply longitudinal-analytics --local
npx wrangler dev src/dev.ts --port 8787 --var IMPORT_TOKEN:dev-token
npm run demo:seed          # 60 invented matches + two language observations
```

To deploy your own instance, create a D1 database and put its id in `wrangler.jsonc`.

`src/dev.ts` is a loopback-only entry point that fixes the owner identity in code; it is never the deployed entry.

## Data

This repository contains **synthetic data only** (`demo/`, `tests/`): an invented account, invented courses, invented opponents.

The ingestion boundary preserves source-specific field names where they are required to map external data into the internal model. No upstream payloads, credentials, or extraction procedures are included in this repository.

## License

MIT for the original code and documentation in this repository (see `LICENSE`). This license applies only to original code and documentation in this repository. It does not grant rights to third-party trademarks, data, content, or services referenced by the project.
