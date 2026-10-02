# Read / Access surface audit — 2026-10-01

Status: **implemented and validated in production — see "Decision" at the end.** Originally: audit only, no code changes. Writes are already closed: every non-GET/HEAD/OPTIONS
under `/api/*` needs `IMPORT_TOKEN`. This document inventories the rest.

Method: `src/api/router.ts` routes, consumers grepped in `src/frontend.ts`, `scripts/`,
and unauthenticated probes of production (GET only, keys/status inspected, no data copied).

## Data scope legend
- **A** aggregate / derived stats about the owner
- **P** personal per-record data about the owner (matches, courses, XP, history)
- **R** raw upstream payloads (full source responses, incl. third-party identifiers)
- **T** contains third parties (PvP opponents: `opponent_id`, `opponent_name`)
- **O** operational (queue state, run status)

## Matrix

| Route | Method | Consumer | Scope | Current auth | Public today |
|---|---|---|---|---|---|
| `/`, `/index.html`, `/overview`, `/chess`, `/languages(/*)`, `/changes`, `/trajectory` | GET | browser | none (HTML/JS shell, no data embedded) | none | yes |
| `/raw` | GET | browser | none (shell; fetches `/api/snapshots*`) | none | yes |
| `/api/stats/{summary,results,color,opponents,opponent-elo,timeline,openings,phases}` | GET | dashboard | A | none | yes |
| `/api/stats/recent` | GET | dashboard | P (+T) | none | yes |
| `/api/stats/lang` | GET | dashboard (legacy fallback), ingest-client verify step | P | none | yes |
| `/api/languages`, `/courses`, `/courses/:id`, `/xp`, `/analytics` | GET | dashboard | P / A | none | yes |
| `/api/matches` | GET | dashboard | P + T | none | yes |
| `/api/what-changed`, `/api/trajectory` | GET | dashboard | A | none | yes |
| `/api/snapshots`, `/api/snapshots/:id` (`?raw=1`) | GET | `/raw` page, dashboard | **R + T** (matchHistory, opponent ids, avatar user id) | none | yes |
| `/api/chess/matches/:id/detail` | GET | scripts / checks | P | none | yes |
| `/api/chess/matches/pending-details` | GET | **detail-hydration client** | O | none | yes |
| `/api/me/stats/lang` | GET | dashboard | P | email header, **falls back to the single provider when absent** | yes (returns owner's data anonymously) |
| `/api/import`, `/api/snapshot`, `/api/chess/matches/:id/detail` | POST | ingest clients | write | `IMPORT_TOKEN` (fail-closed) | no |

Machine consumers that must keep working whatever is decided: the ingest client (POST `/api/snapshot`, GET `/api/stats/lang`),
the detail-hydration client (GET `pending-details`, POST `…/detail`). Everything else is a human browser.

## Findings
1. **Nothing on the read side is authenticated.** Production returns 200 for the dashboard and every GET without credentials,
   so Cloudflare Access is not effectively in front of the Worker (the README says it should protect the dashboard and `/api/admin/*`; no `/api/admin/*` route exists).
2. **`cf-access-authenticated-user-email` is only trustworthy if Access fronts every path.** Today it can be sent by any client. The Worker should verify the `Cf-Access-Jwt-Assertion` JWT, not trust the bare header.
3. **`/api/me/*` identity fallback = anonymous owner access.** `resolveSingleProviderUserId` makes "no email" behave as "the owner".
4. **Highest-sensitivity read surface:** `/api/snapshots/:id?raw=1` (raw source payloads, includes PvP opponents' ids/names)
   and `/api/matches` / `/api/stats/recent` (opponent identifiers). These are third-party data, not only the owner's.
5. **Two different threats share the same routes:** human viewing (needs identity) and machine reading (`pending-details` needs a machine credential).

## Options (decision required)
- **A. Public dashboard + API.** Only defensible as a demo with sanitized data; today it exposes raw payloads and opponent identifiers.
- **B. Everything behind Cloudflare Access; Worker verifies the Access JWT.** Ingest clients keep using machine credentials.
  Machine-only GET (`pending-details`) would require `IMPORT_TOKEN`; `/api/me/*` require a verified identity (no fallback).
- **C. Selective public view** (e.g. public aggregates, private everything else). Needs a definition of "public information"; most work.

## Recommended policy (to implement as ONE central middleware, like the write guard)
```
WRITE  (POST/PUT/PATCH/DELETE under /api)   -> IMPORT_TOKEN          [done]
MACHINE-READ (/api/chess/matches/pending-details) -> IMPORT_TOKEN
USER-READ (all other GET, HTML shell)        -> verified Access identity (JWT), allowlist ADMIN_EMAIL
```
Explicit exemptions only; unknown routes fall into the closed branch.

## Open questions
1. Public demo/portfolio, or private app? (decides A/B/C)
2. Should third-party data (opponent ids/names, raw payloads) ever be publicly visible? Recommended: no.
3. Do you want the `/raw` page kept at all?
4. Cloudflare Access: which applications exist today (including the `bypass`/`everyone` apps created by the removed workflow),
   which hostname do they cover, and is a custom domain planned? **Not verified from the repo**; needs Zero Trust dashboard or an API token with Access read scope.
5. Does the mobile experience need a login-friendly flow (Access works in mobile browsers via one-time PIN / IdP)?

## Implementation sketch (after decisions)
- Central middleware in `router.ts` (same shape as the write guard) + `verifyAccessJwt` against the team JWKS (`CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` as Worker vars).
- Remove `resolveSingleProviderUserId` fallback and the unverified header path in `emailOf`.
- Tests: every route in the matrix gets a table-driven test asserting its policy; a route not in the table must default to closed.
- Rollout order: create the Access application first (observe), then deploy the verifying Worker, then remove bypass apps.

## Decision (2026-10-02)
Cloudflare Zero Trust requires an active plan on this account, and the project goal is no paid/external identity provider.
Chosen: option B's shape with a **self-hosted single-owner login** instead of Access:
signed `__Host-session` cookie (HMAC-SHA256, 7 days) issued by `/login` for `ADMIN_EMAIL` after a PBKDF2 password check,
global failed-login throttle in D1, same-origin check on cookie-authenticated writes. Policy table above is otherwise unchanged
(`IMPORT_TOKEN` for machine routes; session for everything else; `/logout` needs session + same-origin).
