# Human openings and mate types — design

## Intent
The chess statistics speak in coordinates (`e2e4 e7e5`) and in a first-ply bucket (`other_white`). The owner wants them in words a player uses: opening **families** ("Siciliana", "Española") and **mate types** ("mate del pasillo"). Variants are explicitly out: family only.

## Decided with the owner
- Family only, no variant ("Siciliana", not "Siciliana, Najdorf").
- Computed once and **stored in columns**, with a one-off **backfill** of the existing matches. Reads stay cheap; nothing is recomputed per request.
- Scope of this work: openings and mate types. Mistake/best-move analysis stays out.

## Goals / non-goals / anti-goals
- Goal: every stat, filter and table pill that shows an opening or a mate shows a Spanish name.
- Non-goal: variants, engine analysis, dropping `opening_key`, CSV changes.
- Anti-goal: raw coordinates on screen; a label that claims more than the moves support (an unrecognised game is "Otra apertura", never a guess).

## Design (my calls unless marked)
1. **Domain** `src/domain/gameClassification.ts`: `classifyGame(moves, userColor)` → `{ openingFamily, mateType }`, built on `chess.js` (already a dependency). Pure; used by the write path and the backfill, so both agree.
2. **Opening family** comes from the first plies of the *game* (not of the user's side): a table of ~25 families, each defined by a short move prefix, matched longest-prefix-first over the first 8 plies (e.g. `1.e4 e5 2.Nf3 Nc6 3.Bb5` → `ruy_lopez`; `1.e4 c5` → `sicilian`). Names in Spanish live in one map (key → label). No match → `other`; fewer than 2 plies → `unclassified`. The exact family list is the builder's to propose, reviewed against well-known ECO names.
3. **Mate type** is set only when the final position is checkmate: `back_rank` (pasillo), `scholars` (pastor, queen mate on f7/f2 within 4 moves), `fools` (loco), `smothered` (ahogado, knight mate with the king boxed in by its own pieces), otherwise by the mating piece (`queen|rook|bishop|knight|pawn`). Direction (given/received) is derived in stats from `user_color` and who moved last, not stored.
4. **Schema**: migration `0017` adds nullable `opening_family TEXT` and `mate_type TEXT` to `match_details` (+ index on `opening_family`). Migrations are applied manually.
5. **Write path**: `recordMatchDetail` fills both next to `opening_key`/`phase_key`. `opening_key` keeps being written and read by nothing new; dropping it is a later cleanup.
6. **Backfill**: `scripts/backfillClassification.ts` reads each match's moves and color and emits batched `UPDATE`s. It runs **dry-run first** (counts per family/mate, no writes), then applies only after the owner explicitly authorizes the production write. Rows it cannot classify stay NULL. Idempotent.
7. **Stats/UI**: the openings card, the opening filter and the table's opening pill switch to `opening_family`. A new compact "Cómo terminan tus mates" block splits mates **dados** and **recibidos** by type. The "Mate" end pill becomes "Mate · pasillo" when known. Matches with NULL are excluded from family stats and counted ("N sin clasificar") so a partial backfill is visible, as `population.hydrated` does today.
8. **Errors**: a game whose moves are not valid never fails a save: classification falls back to `unclassified` / NULL.

## Constraints
Clean Architecture boundaries as in `scripts/check_architecture_boundaries.py`; tests named `shouldXWhenY`; no mocks between internal layers; production writes only with the owner's explicit grant, and not during the legal freeze unless they say so.

## Left to the builder
Exact family table and prefixes; the mate heuristics' edge cases; backfill batch size (D1 write budget: measure first, as in the P2 piece-1 note).
