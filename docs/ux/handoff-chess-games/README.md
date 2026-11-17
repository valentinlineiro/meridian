# Meridian's chess games: finding a game and reading it

Meridian is a single-owner dashboard for chess, Duolingo languages and LinkedIn Games, on a Cloudflare Worker with D1 and an Angular front end. This change is to the Ajedrez screen: a number about the owner's chess games ("N por tiempo", an ELO range) gets a way into the games behind it, the viewer opens any game that can open, and every request that can fail says so and offers one manual retry. The owner is the only user, mostly on a phone. Scope for Phase 1 is in the brief; nothing in the package needs a new endpoint, a write, or a route.

## Contents

| Artifact | Path | What it holds |
|---|---|---|
| Brief | ../brief-chess-games.md | The gap, goals, constraints and Phase 1 scope; the deferred items |
| Journey | ../journey-chess-games.md | Five steps from the 10 recent games to an open game: screen-by-screen rules, device variants, interaction specification, copy strings for the flow |
| Journey diagram | ../journey-chess-games.html | The same flow drawn, with the three branches |
| Wireframes | ../wireframes-chess-games.html | 14 full-page frames in four sections, a notes rail with the reason for each structural decision, and a click-through prototype of the Partidas flow |
| States | ../../audits/states-chess-2026-11-17.md | State inventory for every block that can load, fail or be empty; edge cases with the change for each |
| Accessibility | ../accessibility-chess.md | Findings with a change and a done-when test each, the live-region table, the keyboard map and the order to fix them |
| Copy | ../copy-chess.md | Every string the change adds or replaces, in Spanish, with the accessible names and announcements |
| Decision log | ../decision-log-games-register.md | The decisions behind the package, including the ethical review of the design; the entries dated 2026-11-17 are the chess ones |

## How the pieces fit

Wireframe names are the frame titles in the board; the id in brackets is the frame's id.

| Screen | Journey step | Lives under | States | Copy |
|---|---|---|---|---|
| Partidas · 10 recientes (`scr-recent`): the first sight of the list, and the one button that opens the filters | 1 | Ajedrez › Partidas | Partidas table error; Loading | Copy › Partidas table |
| Partidas · lista completa con filtros (`scr-filters`): every filter in one place, with one rule for when the list changes | 2 | Ajedrez › Partidas | Partidas table error | Copy › Partidas table |
| Partidas · derrotas por tiempo (`scr-filtered`): the answer to the number the owner started from, with the ending on each card | 3 | Ajedrez › Partidas | — | Copy › Partidas table |
| Partidas · ELO mínimo mayor que el máximo (`scr-elo-error`): a range that cannot match, said at the fields | 3 | Ajedrez › Partidas | — | Copy › Partidas table |
| Partidas · sin coincidencias (`scr-empty`): an empty result with its way out in the same line | 3 | Ajedrez › Partidas | — | Copy › Partidas table |
| Partidas · fila sin jugadas tocada (`scr-recent-status`): feedback for a tap that cannot open anything | 4 | Ajedrez › Partidas | — | Copy › Partidas table |
| Visor · partida abierta (`scr-viewer`): a game readable as text and as a board, with losses in pawns | 5 | Ajedrez › Partidas › visor | Game viewer | Copy › Game viewer; Accessible names |
| Visor · fallo temporal (`scr-viewer-fail`): a game that could not load is not a game that does not exist | 5 | Ajedrez › Partidas › visor | Game viewer, temporary error | Copy › Game viewer |
| Visor · sin jugadas guardadas (`scr-viewer-nomoves`): a game with nothing to replay says so, with no retry | 5 | Ajedrez › Partidas › visor | Game viewer, permanent error | Copy › Game viewer |
| Ajedrez · la página no cargó (`scr-page-fail`): one error block under a hero that shows no dashes | Outside the flow | Ajedrez | Page failed; offline | Copy › Page, first load and failure |
| Ajedrez · cargando, después de 3 s (`scr-loading`): skeletons that do not read as values, and a line once the wait is long | Outside the flow | Ajedrez | Loading | Copy › Page, first load and failure |
| Ajedrez · dos bloques no cargaron (`scr-card-fail`): independent blocks that fail and retry on their own | Outside the flow | Ajedrez | Suggested game; Forma actual window | Copy › Forma actual; Suggested game and engine |
| Forma actual · historial corto (`scr-form-short`): a comparison that cannot be drawn says why | Outside the flow | Ajedrez › Forma actual | Forma actual, empty | Copy › Forma actual |
| Partidas · escritorio (`scr-desktop`): the same rules with the filter bar on one row | 1–3 | Ajedrez › Partidas | — | Copy › Partidas table |

Blocks with states and copy but no frame of their own (engine profile, mates, threats, openings and phases failing) follow the suggested-game frame: the same block, the same retry, the sentence in Copy › Blocks of the openings section.

## Left to the builder

- Visual design: color (including the result colours), type, spacing, and motion beyond what the journey and states specify (4 s for the row status line, 3 s before the loading line, 10 s request timeout).
- Technology: the existing Angular front end and Hono API; no new endpoint is needed, since the matches route filters by any stored ending.
- The look of the skeletons, the "›" mark and the board pieces.

## Open questions

- Does the phone's Back gesture close the viewer or leave Ajedrez? (accessibility-chess.md, journey-chess-games.md)
- Should the "Material" pill read "Material insuficiente" where the table has the width? (copy-chess.md)
