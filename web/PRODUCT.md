# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One person: the owner, who is also the builder. They open the app on a phone, once or a few times a day, mostly for chess. They read their own chess games, Duolingo language progress and LinkedIn Games times, and type the Games results by hand once a day. They read Spanish. There is no second user, no team and no public audience; the repository ships synthetic data only.

## Product Purpose

Meridian is personal longitudinal analytics on Cloudflare Workers, D1 and an Angular front end. It turns repeated observations of the owner's activity into historical memory: immutable snapshots, comparisons between two moments, and findings. Chess and languages arrive through a sync. LinkedIn Games has had no source since 2026-11-09 and is manual entry. Surfaces: Hoy, Chess, Idiomas, Games, Qué cambió. Success means:

- The Games log stays complete: a result is entered or corrected from Hoy in one sitting.
- The value stored equals the value the owner meant (no silent misreads of times).
- Every section either loads or says it did not, and offers a retry.
- Chess and language status read on the phone without opening a second page.

## Positioning

Evidence-first memory. Snapshots are stored once and never rewritten, every finding carries its claim, its evidence and the observation window it came from, and unknown is never coerced to zero. A neighbouring product that only shows current state, or states verdicts without evidence, could not truthfully claim this.

## Operating Context

The owner checks the app on a phone, often outdoors, in short sittings. In production with continuous deploy on every green push to main; migrations are manual. Mature and in audit-and-polish. The Games register, today-first hub and base accessibility pass are in production (#222-#227), and the Chess game viewer has board coordinates and a last-move frame (#228). Design docs live in `docs/ux/` (briefs, copy, accessibility and journey notes per surface).

## Capabilities and Constraints

- Free-plan Worker CPU and D1 write budget; a save is one request.
- Production data is read only with a fresh grant from the owner.
- Day records are append-only; changes append versions.
- Closed-by-default routes, signed sessions, CSRF defence, login throttling.
- Clean architecture enforced by CI (`scripts/check_architecture_boundaries.py`).
- No dedicated UX team; the owner decides.
- Independent project, not affiliated with Duolingo or LinkedIn. Reading LinkedIn is dropped.
- Spanish copy. Single dark theme.

## Brand Commitments

No external brand. The existing single dark theme, Spanish voice and shared design tokens and verdict vocabulary (see `docs/ux/` and the web design-system work) are incumbent and stay unless the owner changes them.

## Evidence on Hand

Real owner data exists only in production and is not in the repo. `demo/` holds an invented dataset, and `docs/ux/screenshots/` holds captures. No testimonials, customers or benchmarks exist and none must be invented.

## Product Principles

1. Evidence over interpretation: state what was observed and for which window; no verdict stronger than the evidence.
2. Utility only: no streak pressure, no notifications to pull the owner back, no loss framing, no completion-exploiting progress bars.
3. Honest input: what the field shows is what is stored; nothing typed is lost without being asked; changes are reversible until saved and correctable after.
4. Never silent failure: no missing feedback, dead ends or broken error recovery.
5. Phone first, chess first.

## Accessibility & Inclusion

WCAG 2.2 AA is the working bar (see `docs/ux/accessibility-chess.md` and `accessibility-games-register.md`): at least 3:1 contrast on field borders, text alternatives for graphics, focus management after dynamic changes, and `prefers-reduced-motion` respected. No vulnerable populations in the user base.
