# Meridian's LinkedIn Games daily register

Meridian is a single-owner dashboard for chess, Duolingo languages and LinkedIn Games. Games has no source, so the owner types each day's times into the "Registrar hoy" sheet. This change adds the entry point to Hoy, stops silent wrong data and lost input in the sheet, makes a stored result removable, and gives the owner a retry on Hoy, Games and Qué cambió when a section does not load. It is built for one person who logs once a day, mostly on a phone.

## Contents

Read in this order.

| Artifact | Path | What it holds |
|---|---|---|
| Brief | ../brief-games-register.md | Gap, goals, constraints, principles, phase 1 scope and deferrals |
| Evaluation | ../../audits/evaluation-meridian-web-app-2026-11-16.md | The findings that started the work, with severities |
| Journey | ../journey-games-register.html | The flow from Hoy or Games to a saved day, gates, device and interaction rules |
| Blueprint | ../blueprint-games-register.html | The save path behind the sheet: the day-save call, errors by game and field, failure and recovery rows, contract changes |
| Wireframes | ../wireframes-games-register.html | 13 full-page screens at phone width with notes: Hoy, the sheet's states, the shared error block |
| States and edge cases | ../states-games-register.md | State inventory (S1–S11), edge case catalog (E1–E14), the Critical, Major, Minor and Cosmetic recommendations |
| Accessibility | ../accessibility-games-register.md | WCAG findings with done-when tests, announcement table, keyboard map |
| Copy deck | ../copy-games-register.md | Every string, error inventory, naming changes, the field-code decision |
| Measurement | ../metrics-games-register.md | Goal-signal-metric chains from existing data, guardrail, owner check-ins, checkpoints and the no-data checks |
| Decision log | ../decision-log-games-register.md | Decisions someone may reopen, including the anti-pattern review |

## How the pieces fit

Touchpoints are the routes under `/api/me/linkedin-games`, drawn in the blueprint's backstage lane. The app's routes are the information architecture: `/overview` is Hoy, `/games` is LinkedIn Games.

| Screen | Wireframe | Journey step | IA node | Blueprint touchpoint | States | Copy |
|---|---|---|---|---|---|---|
| Hoy, nothing logged: the Games row offers the daily action beside its link | scr-hoy-empty | 1 Open, from Hoy | /overview | GET …/summary (`to` decides the button label) | default | Copy deck, Hoy |
| Hoy, logged: confirms what a save from here changed | scr-hoy-logged | 5 Back where you were | /overview | GET …/summary after the save | status region | Copy deck, Hoy; Register sheet (result note) |
| Hoy, loading: tells a slow load from missing data | scr-hoy-loading | 1 Open | /overview | the Hoy reads | S8 | Copy deck, Hoy |
| Hoy, a section failed: one retry for the page | scr-hoy-partial | none (recovery) | /overview | the Hoy reads | S9 | Copy deck, Hoy; Error inventory |
| Sheet, empty: where typing starts | scr-sheet-empty | 1 Open | sheet over /overview or /games | GET …/ (the day) | S2 | Copy deck, Register sheet |
| Sheet, typing: the time field produces what is stored | scr-sheet-editing | 2 Type | same | none | E1, E2, E3 | Copy deck, Register sheet |
| Sheet, removing a result: removal with undo until Guardar | scr-sheet-removal | 2 Type | same | PUT …/day `remove` (appends a version without the game) | E14 | Copy deck, Register sheet |
| Sheet, errors on save: each error sits on its field | scr-sheet-errors | 3 Save | same | PUT …/day answers 422 with `{ game, field, reason }` | E2, E3 | Copy deck, Register sheet; Error inventory |
| Sheet, closing with changes: protects typed work on every way out | scr-sheet-discard | gate: closing with unsaved edits | same | none | E12 | Copy deck, Register sheet |
| Sheet, no answer on save: says the input is safe to resend | scr-sheet-noanswer | 3 Save | same | PUT …/day (repeat returns `same`) | S3, E6, E8 | Copy deck, Register sheet |
| Sheet, midnight passed: asks which day gets the times | scr-sheet-midnight | 3 Save | same | PUT …/day (`date` chosen by the sheet) | S6 | Copy deck, Register sheet |
| Sheet, stored day unreadable: opens empty without implying nothing is stored | scr-sheet-unread | 1 Open | same | GET …/ failed | S1, S11 | Copy deck, Register sheet |
| Games, did not load: the shared block on Games, Qué cambió and Hoy | scr-games-error | none (recovery) | /games | GET …/summary failed | S10 | Copy deck, Error inventory |

Server work that no screen shows: the day-save call `PUT /api/me/linkedin-games/day` (add, change, clear an average, remove, errors by game and field), a `field` code on the paste box's line errors, the new path in the router's access list, and contract rule L14 added to the ingestion contract with the change (blueprint; decision log, 2026-11-16). The draft kept in session storage (E7, S5) restores after a login redirect or reload.

## Left to the builder

- Visual design: color, type, spacing, motion beyond the existing sheet slide. The app has a single dark theme; a light theme is deferred in the brief.
- Technology: the existing Angular front end and Worker with D1.
- The mask implementation behind E1, within the rules in the accessibility file (caret at the end, paste and dictation produce the same result).
- How the 44 px hit area is reached for Cerrar and the Hoy button.
- The names of the use case and the functions behind the day save.

## Open questions

- Does the paste box keep the server's line sentences or get its own copy? (copy deck)
- Should removal exist for past days, which are reached only through the paste box? (brief)
- How does the sheet lay out at 320 px width and 200 % zoom with the keyboard open? (states file E9, E10; accessibility file)
