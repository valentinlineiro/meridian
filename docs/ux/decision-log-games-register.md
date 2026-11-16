## 2026-11-16 The evaluation covers the whole web app from a fresh pass

Decided by: the owner.
Why: earlier audits existed; the owner asked for a pass that ignores their conclusions.
Rejected: chess only, Games only, changes since #202.
Rests on: evaluation-meridian-web-app-2026-11-16.md.

## 2026-11-16 The server returns a field code with each row error

Decided by: the owner.
Why: the sheet's field is "Tu tiempo" while the server speaks of "mis segundos"; a code lets the sheet use its own sentence without matching text.
Rejected: matching on the server's message text; showing the server text as is.
Rests on: copy-games-register.md.

## 2026-11-16 The unsaved-changes bar names the games with edits

Decided by: the owner.
Why: the loss becomes concrete at the moment of choosing.
Rejected: a generic "tienes cambios sin guardar" line.
Rests on: copy-games-register.md.

## 2026-11-16 Removing a result appends a version without the game

Decided by: Claude, in the journey design; the owner approved the journey scope, not this mechanism.
Why: day records are append-only and the import only adds or changes; a new version keeps history and the existing versioning.
Rejected: a hard delete of the row; a "clear" flag on the entry.
Rests on: ImportGameResults.ts, RecordGameResult.ts, journey-games-register.html.

## 2026-11-16 No offline queue for unsaved results

Decided by: Claude, in the hardening pass.
Why: a day is at most six times; retyping costs seconds and a queue needs conflict rules across devices.
Rejected: queueing saves in the browser and replaying them.
Rests on: states-games-register.md.

## 2026-11-16 The masked field is its own reading; no echo line

Decided by: Claude, in the copy deck.
Why: with the colon added as the person types, the field already shows what will be stored; a second line repeats it for every row.
Rejected: an "1:06" echo under each field (proposed in the hardening and accessibility files).
Rests on: copy-games-register.md.

## 2026-11-16 No manipulative pattern in the register design

Decided by: Claude, in the packaging check.
Why: the streak line on Hoy and Games is information and carries no reminder, loss warning or penalty. The unsaved-changes bar gives both choices a full-width button; Seguir editando is the default because discarding loses typed work. Removing a result needs an explicit action and can be undone before Guardar. The draft kept for a lost session stays in the browser, is cleared on save or discard, and is never sent. The retry block never retries by itself. Logging completeness is measured but not a target, and no reminder or streak-loss copy exists to raise it. Nothing in the flow prompts, repeats a prompt after a decline, or reopens the sheet.
Rejected: evening reminders to log, streak-loss copy, an automatic retry loop.
Rests on: journey-games-register.html, copy-games-register.md, states-games-register.md.

## 2026-11-16 The sheet saves through one structured day call

Decided by: Claude, in the blueprint.
Why: add, change and remove land as one append, so a save is never half applied; errors come back with the game and field, which removes the sheet's mapping of server errors back to rows by line number.
Rejected: removal lines in the pasted-text format (overloads the paste syntax); one DELETE call per removed game (a save becomes several requests with states between them).
Rests on: ImportGameResults.ts, games-register.ts, blueprint-games-register.html.

## 2026-11-16 The day save merges with explicit removals, not replaces the day

Decided by: Claude, in the blueprint.
Why: a sheet opened without the stored day (unreadable) or before another device saved would erase games if it sent the whole day; `set` and `remove` lists only touch what the owner touched.
Rejected: "these are exactly the games for the day".
Rests on: states-games-register.md (S1, S7).

## 2026-11-16 A removed game's key leaves the day; no `unplayed` marker

Decided by: Claude, in the blueprint.
Why: contract L4 reads an absent key as "not collected" and `unplayed: true` as "collected and not played"; a mistaken entry was neither, and every reader already skips absent games.
Rejected: writing `unplayed: true`.
Rests on: the ingestion contract L4, GameStats.ts.

## 2026-11-16 `avg: null` clears a stored average; an absent `avg` keeps it

Decided by: Claude, in the blueprint; the owner accepted the amendment on 2026-11-16 (see the L14 entry).
Why: with L10 as written, emptying an average field changes nothing, so the sheet shows a value that is not stored.
Rejected: keeping L10 for the sheet and telling the owner to remove and re-add the game.
Rests on: the ingestion contract L10, RecordGameResult.ts.

## 2026-11-16 Validation failures answer 422 with `{ game, field, reason }`; the paste box's errors gain `field`

Decided by: Claude, in the blueprint.
Why: the structured call needs stable machine-readable errors; the line-based import keeps its sentences and gains a field code so the sheet and the paste box share one vocabulary.
Rejected: a 200 with `applied: false` as the import does.
Rests on: GamesText.ts, routes.ts.

## 2026-11-16 A new contract rule L14 lets the owner's day save delete a game's key and clear an average

Decided by: the owner.
Why: removal and clearing an average contradict L8 (each capture is the day's cumulative) and L10 (no way to delete a field); without them a mistaken result or a stale average stays in every reading.
Rejected: leaving L8 and L10 as written and correcting by overwriting only.
Rests on: the ingestion contract L8, L10; blueprint-games-register.html.
