# Meridian

## Users

One person, the owner, who is also the builder. Checks the app on a phone, once or a few times a day, mainly for chess [mobile UX plan 2026-11-03]. Reads their own chess games, Duolingo language progress and LinkedIn Games times. Types LinkedIn Games results by hand once a day, off LinkedIn's result screen. Reads Spanish. No second user, no team, no public audience: the repository ships synthetic data only.

## Product

Personal longitudinal analytics on Cloudflare Workers, D1 and an Angular front end. Immutable snapshots, deduplicated by checksum; findings carry their claim, evidence and observation window. Chess and languages arrive through a sync; LinkedIn Games has no source since 2026-11-09 and is manual entry. Surfaces: Hoy, Chess, Idiomas, Games, Qué cambió. Single dark theme. Spanish copy. In production with continuous deploy on every green push to main; migrations are manual. Maturity: mature, in audit-and-polish; the Games register build is next.

## Constraints

- Free-plan Worker CPU and D1 write budget; a save is one request.
- Production data is read only with a fresh grant from the owner.
- Day records are append-only; changes append versions.
- Closed-by-default routes, signed sessions, CSRF defence, login throttling.
- Clean architecture enforced by CI (`scripts/check_architecture_boundaries.py`).
- No dedicated UX team; the owner decides.
- Independent project, not affiliated with Duolingo or LinkedIn. Reading LinkedIn is dropped.
- Unknown is never coerced to zero.

## Ethical stance

- Data: minimum collection, stored once, never rewritten; no third-party analytics.
- Attention: utility only. No streak pressure, no notifications to pull the owner back, no loss framing, no progress bars that exploit completion.
- Honest reading: findings state what was observed and for which window; no verdict stronger than the evidence.
- Input: what the field shows is what is stored; nothing typed is lost without being asked; changes are reversible until saved and correctable after.
- Rejected from the anti-pattern catalog: all manipulative patterns; Missing Feedback, Dead Ends and Broken Error Recovery are treated as defects.
- Vulnerable populations: none in the user base.

## Success

- The Games log stays complete: a result is entered or corrected from Hoy in one sitting.
- The value stored equals the value the owner meant (0 silent misreads of times).
- Every section either loads or says it did not and offers a retry.
- The owner reads chess and language status on the phone without opening a second page.
- Measures stay in `metrics-games-register.md`; none count visits or time on page.

## Open questions

- Is chess the surface to evaluate next, given it is the main use?
- Does the paste box get the same removal and field-level errors as the sheet?
- Is removal needed for past days?
