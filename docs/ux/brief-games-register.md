# Meridian's LinkedIn Games daily register

## Context

Meridian is a single-owner dashboard for chess, Duolingo languages and LinkedIn Games, served from a Cloudflare Worker with D1 and an Angular front end. Chess and languages arrive through the sync. LinkedIn Games has no source: reading LinkedIn was dropped on 2026-11-09, so every Games result is typed by the owner into the "Registrar hoy" sheet (or pasted into its text box). Everything on the Games page rests on that input: the verdicts, the adjusted form, the loss map and the difficulty calendar. Day records are append-only versions; the import takes lines such as `zip, 0:48, 0:53` and the text wins for the games it mentions.

The owner mostly uses the app on a phone and mainly for chess [memory: mobile UX plan 2026-11-03]. A full evaluation of the web app on 2026-11-16 routed the register's problems to journey design, hardening, accessibility and copy; their files sit next to this brief.

## Gap

- Hoy reports the Games state but cannot act on it. Logging takes Hoy, Games, "Registrar hoy" before the first character is typed [evaluation-meridian-web-app-2026-11-16].
- A phone numeric keypad has no colon. The server reads plain digits as seconds (`SECONDS = /^\d{1,4}$/` in `GamesText.ts`), so "106" typed for 1:06 is stored as 106 seconds, 1:46, with no error [states-games-register, E1].
- A result logged on the wrong game cannot be removed. Blank rows are skipped, Guardar is off when every row is blank, and the server has no delete path (`ImportGameResults`, `RecordGameResult`).
- Typed times are lost on an outside tap, Escape, Back, a 401 redirect to login, or a reload. A save that times out after the write landed reports "No se pudo guardar." [states-games-register, E6, E7].
- An average typed beside a blank time is dropped without a message (`filled()` in `games-register.ts`).
- Server row errors are written for pasted text ("mis segundos no válidos") and name a column the sheet does not have [copy-games-register].
- The sheet fails screen-reader and low-vision use in several places: errors not tied to fields, format only in a placeholder, field borders at 1.49:1, Guardar looking enabled when disabled [accessibility-games-register].

## Opportunity

A wrong or lost entry corrupts every Games reading without any sign on screen, and manual entry is now the only source. The daily task is short, so friction and silent errors decide whether the log stays complete. One person uses it, so the change can be exact and small.

## Goals

- Log or correct today's results from Hoy in one sitting, with one tap to reach the sheet.
- The value on screen is the value stored.
- Typed input survives interruption: dismissing, going offline, session expiry, reload.
- A stored result can be removed and the removal can be undone before saving.
- The sheet is usable with a keyboard, a screen reader and voice control.

## Constraints

- One owner; Free-plan Worker CPU and D1 write budget. A save is one request and one appended version per changed day.
- Day versions are append-only; removal appends a version without the game.
- Production data is read only with a fresh grant from the owner.
- The pasted-text format and its seconds shorthand stay as they are; changes apply to the sheet.
- Spanish copy; the app has a single dark theme.

## Guiding Principles

- What the person sees in the field is what is stored.
- Nothing typed is lost without being asked.
- A change is reversible until Guardar and correctable after it.
- One sheet, two entry points: Hoy and Games behave the same.

## Key Assumptions & Open Questions

Assumptions:
- The owner logs once a day, mostly on the phone, reading the times off LinkedIn's result screen.
- Plain-digit entries ("106" for 1:06) could distort readings. The history shows none: 0 of 872 stored scores, and the 78 entered since 2026-11-09 are all m:ss [production read 2026-11-16]. The stored data does not say whether they came from the sheet or the paste box, so the phone keypad case is untested.

Open questions:
- Should removal also exist for past days, which are reached only through the paste box?
- Does the paste box get the same removal and field-level errors as the sheet?

## Proposed Scope (Phase 1)

In:
- Hoy: "Registrar hoy" / "Editar lo de hoy" beside the Games row, outside the link area, opening the same sheet; a status region for the save result.
- Sheet: time mask and format description, removal with undo, unsaved-changes bar naming the games, draft kept in session storage, midnight prompt, save failure states, pinned save row, row errors tied to fields.
- Server: removal command (new version without the game) and a field code on every row error.
- Shared error block with a manual "Reintentar" on Hoy, Games and Qué cambió; skeletons on Hoy.
- Accessibility fixes in the accessibility file's High and Medium lists, and the copy and naming changes in the copy deck.

Deferred:
- Light theme and `rem` type sizes.
- Offline queue for unsaved results.
- Removal for past days.
- Usage measurement of the sheet (needs `/measure` first).
