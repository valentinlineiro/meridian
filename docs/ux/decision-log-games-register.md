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

## 2026-11-17 Project ethical stance is maximum user protection

Decided by: Claude, default; the owner has not answered.
Why: a single-owner personal tool has no engagement or revenue goal that would justify less.
Rejected: leaving the stance unwritten.
Rests on: context-meridian.md, README design principles.

## 2026-11-17 Artifacts for this project: the Games register package, then a chess evaluation

Decided by: Claude, default; the owner has not answered.
Why: the Games register package exists and the build is next; chess is the main use [mobile UX plan 2026-11-03] and has no evaluation of its own.
Rejected: new artifacts for languages or Qué cambió, which the 2026-11-16 evaluation already covered.
Rests on: context-meridian.md.

## 2026-11-17 The chess evaluation reads the code and not the running app

Decided by: Claude, default; the owner has not answered.
Why: no prod read or device session was granted; the code shows every state the screen can reach.
Rejected: a Playwright pass on a phone viewport; it would add rendering findings but needs the app served with data.
Rests on: web/src/app/features/chess, docs/audits/evaluation-chess-2026-11-17.md. Not covered: visual rendering, the Openings block (`openings.ts`), the engine-profile layout below the KPIs, and any behaviour on real data.

## 2026-11-17 Chess failed cards retry one request each, by hand, with the shared error block

Decided by: Claude, default; the owner has not answered.
Why: the block already disables the button while loading and asks for a minute after a second failure, which keeps a retry from repeating the D1 overload.
Rejected: automatic retry with backoff (the 2026-11-11 overload came from retries); one page-level retry for every card (it repeats the 7 requests that worked).
Rests on: web/src/app/shared/error-block.ts, d1-overload-500s-2026-11-11.

## 2026-11-17 The chess evaluation's major finding is narrowed to the independent requests

Decided by: Claude.
Why: the bundle route returns all seven stats or fails whole (`handleStatsBundle`), so the ELO, colour, opponents and results cards cannot fail alone.
Rejected: keeping the first wording, which named those cards.
Rests on: src/api/stats.ts, web/src/app/core/stats.service.ts.

## 2026-11-17 ELO bounds apply on blur or Enter and "Filtrar" is removed

Decided by: Claude, default; the owner has not answered.
Why: one rule for every control (it changes the list when the person is done with it); a number typed key by key would otherwise send a request for "1", "12", "120".
Rejected: a 300 ms pause as search has (partial numbers reach D1); keeping "Filtrar" for the bounds only (a button that matters for two fields of eight).
Rests on: web/src/app/features/chess/components/matches-table.ts, services/matches.service.ts, evaluation-chess-2026-11-17.md.

## 2026-11-17 A row without moves says so when tapped and is not marked

Decided by: Claude, default; the owner has not answered.
Why: the share of games without stored moves is unknown, so marking the exception could mark most rows; the "›" marks the rows that open.
Rejected: dimming or labelling every row without moves.
Rests on: matches-table.ts (`id` is set only for a game with ply_count).

## 2026-11-17 The full-list button is renamed "Ver todas y filtrar"

Decided by: Claude, default; the owner has not answered.
Why: the filters for ending, phase, opening and ELO appear only after it, and "Ver todas las partidas" names browsing.
Rejected: showing the filters in the 10-game view (it repeats the filter bar above ten rows).
Rests on: matches-table.ts (`compact()`).

## 2026-11-17 Chess failures are worded "No pudimos cargar …", and the offline state waits for a tap

Decided by: Claude, default; the owner has not answered.
Why: the shared error block and Games already say "No pudimos cargar tus juegos."; the chess strings said "No se pudo…" in four forms. An automatic load on reconnect would be the one retry that nobody asked for, against the manual-only rule.
Rejected: keeping the chess wording; loading once when the browser reports online (the first states draft).
Rests on: web/src/app/shared/error-block.ts, games.html, states-chess-2026-11-17.md.

## 2026-11-17 The clear button is "Limpiar filtros" in the bar and in the empty line

Decided by: Claude, default; the owner has not answered.
Why: one action, one name; "Limpiar" alone does not say what is cleared.
Rejected: "Quitar filtros" in the empty line (the journey's first wording).
Rests on: matches-table.ts, journey-chess-games.md.

## 2026-11-17 The viewer's missing-moves message reuses the table's status line

Decided by: Claude, default; the owner has not answered.
Why: the same fact in two places reads as one fact; "No hay partida completa guardada para esta partida" repeats "partida" three times.
Rejected: keeping both wordings.
Rests on: match-detail-modal.ts (`MISSING`), copy-chess.md.

## 2026-11-17 The chess board gets a text description; no keyboard grid

Decided by: Claude, default; the owner has not answered.
Why: the move list is already the navigable form of a game, so the board only has to say where the pieces are; stepping announces the move, not the 32 pieces.
Rejected: an 8×8 grid with roving tabindex and arrow keys (a second way to move through a game, built for a pointer-free board nobody asked for); announcing the full position on every step (tedious when stepping through 40 moves).
Rests on: chess-board.ts, match-detail-modal.ts, accessibility-chess.md.

## 2026-11-17 Card-level error blocks are polite; the page-level block stays assertive

Decided by: Claude, default; the owner has not answered.
Why: when independent requests fail together, six assertive messages cut each other off.
Rejected: one `role="alert"` for all blocks; a single combined summary block (it hides which cards failed).
Rests on: web/src/app/shared/error-block.ts, states-chess-2026-11-17.md.

## 2026-11-17 The phone cards show the ending

Decided by: Claude, default; the owner has not answered.
Why: with the ending filter complete, a filtered phone list that does not show the ending cannot confirm the filter.
Rejected: showing Tipo and Rev. as well (the rival line already says Bot or PvP).
Rests on: styles.css (phone `.tbl` rules), journey-chess-games.md.

## 2026-11-17 The chess accessibility audit reads code and styles and runs nothing

Decided by: Claude, default; the owner has not answered.
Why: no browser or screen-reader session was part of the request; contrast ratios are computed from the tokens in styles.css.
Rejected: a Playwright and axe pass (it would add programmatic findings but needs the app served with data).
Rests on: accessibility-chess.md. Not covered: the Openings block markup, zoom at 400 %, and any assistive-technology behaviour; the findings on table semantics and live regions are to be confirmed with VoiceOver or NVDA.

## 2026-11-17 The chess change is briefed as finding and reading a game, with the failure states in Phase 1

Decided by: Claude, default; the owner has not answered.
Why: the filter, row, phone-card and viewer problems share one journey, and the failure states sit on the same screen on the device the owner uses most; splitting them would ship a filter that works next to a retry that does not.
Rejected: a brief limited to the three major findings; a brief for the whole Ajedrez page.
Rests on: evaluation-chess-2026-11-17.md, states-chess-2026-11-17.md, journey-chess-games.md.

## 2026-11-17 The four open flow questions stay out of Phase 1

Decided by: Claude, default; the owner has not answered.
Why: each adds a surface (links from a card, a viewer control, URL state) to a change that needs no new endpoint or route, and none has usage data behind it.
Rejected: building the Resultados links in Phase 1 because they are small.
Rests on: journey-chess-games.md, brief-chess-games.md.

## 2026-11-17 The chess wireframes are full-page, with a click-through prototype of the Partidas flow

Decided by: Claude, default; the owner has not answered.
Why: the brief fixes the mechanisms, so the open question is completeness and sequence; the prototype wires the recent list, the filters, the filtered list, the empty line and the viewer.
Rejected: an idea board (no mechanism is in doubt); wiring the failure frames into the prototype (they are reached by a failed request, which a click-through cannot simulate except from the page error block).
Rests on: brief-chess-games.md, journey-chess-games.md, wireframes-chess-games.html.

## 2026-11-17 The wireframes were checked for structure, not rendered

Decided by: Claude, default; the owner has not answered.
Why: starting a local server for a browser check was denied; the file was checked for balanced tags, 14 frames, and every prototype target resolving to a frame.
Rejected: opening the file by file:// (the browser tool blocks it).
Rests on: wireframes-chess-games.html. Not covered: how the kit and viewer render the frames, marker positions, the fold height on each screen.

## 2026-11-17 The chess wireframes were rendered and walked in a browser

Decided by: the owner, who asked for the local server; Claude ran the check.
Why: the structural check could not show the fold, the markers or the viewer.
Rejected: leaving the earlier entry ("checked for structure, not rendered") standing; it no longer holds.
Rests on: wireframes-chess-games.html. Found and fixed: the first frame cut off "Ver todas y filtrar" at the fold, and one marker sat on a badge. Walked in the prototype view: recent list, full list, filtered list, viewer. Not walked: the empty, ELO-error and failure frames; the desktop frame is drawn at 1440 px and reads only in slides.

## 2026-11-17 The chess design is checked against manipulative patterns before packaging

Decided by: Claude, default; the owner has not answered.
Why: the screen reports on the owner's own games, so patterns that act on attention, on loss or on consent are where it could go wrong.
Rejected: none; no pattern is accepted in the design.
Rests on: wireframes-chess-games.html, copy-chess.md, states-chess-2026-11-17.md. Streaks: the run pill describes the last results and carries no reminder, reward or threat, and a losing run has no flame. Loss framing: results are stated as counts and rates with their interval; no copy tells the owner what they are losing. Attention: the screen sends no notification, has no unread badge and no autoplay; the viewer steps only when the owner does. Opaque ranking: the suggested game is ranked by the engine's average loss per move and says so in its line. Completeness bars and nagging: none; the empty and short-history states point at an action and add no prompt. Consent and data: the change collects nothing and reads only what the screen already reads. Missing feedback, dead ends and broken error recovery: each failure says what did not load and offers one manual retry, and a tap that cannot open a game says why.

## 2026-11-17 The chess build keeps three things the design left open

Decided by: Claude, default; the owner has not answered.
Why: the full list with no filter set and no games says "Sin partidas todavía" (there is nothing to clear), and only a set filter says "Sin partidas con esos filtros." with its "Limpiar filtros"; the field border change is one global rule, so it also changes the fields in Games, Idiomas and Configuración; the page error block stays on screen while its retry runs, so "Sigue sin cargar. Inténtalo en un minuto." can appear.
Rejected: a chess-only border (the Games register audit asked for the same rule); showing the filter message with no filter set.
Rests on: web/src/app/features/chess/components/matches-table.ts, web/src/styles.css, web/src/app/shared/error-block.ts.

## 2026-11-17 The row status line and the viewer's missing-moves message stay as a safety net

Decided by: the owner, who granted a production read; Claude ran it.
Why: all 1,727 games in production have stored moves, so "Esta partida no tiene jugadas guardadas." will almost never show. It costs one line and covers a game synced without moves.
Rejected: removing the status line and the permanent viewer error; a later sync can still arrive without moves.
Rests on: a read-only count over matches joined to match_details (no rows read beyond the count). Not checked: whether every stored list is a legal game.

## 2026-11-17 Back closes the viewer, and the ending pill reads "Material insuficiente"

Decided by: the owner.
Why: the viewer is a layer over Ajedrez, so the phone's Back gesture takes it away and leaves the screen as it was; one name for the ending in the pill and the select keeps one action to one name.
Rejected: Back leaving Ajedrez with the viewer open (loses the filters and the place in the list); "Material" in the pill and the long form only in the select.
Rests on: web/src/app/features/chess/services/matches.service.ts (the viewer adds one history entry, like the "Más" sheet in tab-bar.ts), matches-table.ts.

## 2026-11-17 Chess opens on status, the game to review and the list; the statistics sit behind one section

Decided: the owner (shape and the three open decisions, 2026-11-17). Order on the page: hero, "Revisar vs X" as the one filled button with "Última partida" beside it, Partidas, then a single closed "Estadísticas" (Puntuación, Evolución, Forma actual, Comparativa, Aperturas, Resultados, ELO del rival, engine profile, "¿Cómo sabemos esto?"). Closed at every width. The Resultados counts open the full list filtered to those games. The four-button section index is gone; `?s=` links still open Estadísticas and the block.
Why: the owner opens Chess on a phone for "how am I doing" and a game to review; the same ELO, win rate and game count appeared three times and the viewer's entry sat last.
Rejected: "Actualizado" in the hero (the shell header already shows "Ajedrez · actualizado <fecha>" on every width); folding the Forma window selector into the hero (the hero keeps its own last-50 window, pinned by tests); a separate statistics route.
Rests on: web/src/app/features/chess/chess.html, chess.ts, components/review-suggestion.ts, services/matches.service.ts (showEnding, latestId). Not checked in a browser: no dev server was available; the screenshots in docs/ux/screenshots predate this order.

## 2026-11-17 The viewer keeps the position and its controls in view; the errors come before the moves

Decided: the owner (second chess critique, 2026-11-17: priority "Visor", scope P1 and P2). Order in the viewer: board, then ‹ position ›, then the engine's errors, then the move list, then "Descargar PGN". On a phone (up to 700 px wide, at least 640 px tall) the board and its controls stay fixed at the top while the errors and moves scroll under them, in one scroll and without the nested move scroller. Beside it on a wide screen: board left, errors and moves right. The plies the engine lists as worst are underlined in the move list and read as "error grave" to a screen reader.
Why: the errors the owner opens a game for sat below 40+ small move buttons, and the controls were off-screen after the list.
Rejected: marking plies with "?" or "??" (a verdict stronger than "loses at least 3 pawns"); colour alone for the marker; fixing the header with the ✕ (Back, Escape and the backdrop already close the viewer, and a taller fixed area breaks reflow at high zoom, so the fixed board only applies when the screen is tall enough).
Rests on: web/src/app/features/chess/components/match-detail-modal.ts, styles.css (.gamegrid, .gamestage, .gm.err). Checked in a browser on the local worker with a made-up 60-ply game at 390×844 and 1280×800; not yet with real production games or on a touch device.

## 2026-11-17 Partidas: the title wraps clear of its subtitle, filter groups read label over chips on a phone, "Exportar CSV" moves into the filter row

Decided: the owner (second chess critique, scope P1 and P2). The title and "Partidas recientes (N mostradas)" wrap instead of colliding; on a phone each filter group (Rival, Resultado, Color) puts its label above its chips. "Exportar CSV" no longer sits in the card header: it is the last control of the full filter row, so it shows after "Ver todas y filtrar".
Why: the header crowded title, subtitle and button in one row at 390 px, and the export is rare next to the list.
Rejected: keeping the button in the header on a second line (it still competed with the list); hiding the export on phones.
Rests on: web/src/app/features/chess/components/matches-table.ts, styles.css (.matches-head, #matchChips). Checked in a browser on the local worker at 390×844 and 1280×800.

## 2026-11-17 The chess hero keeps ELO, its change, the streak and the recent results; the scope of the data moves into Estadísticas; the flame goes

Decided: the owner (second chess critique: scope P1 and P2, and "Quitar" the flame). The hero shows ELO with its change against the first reading, the streak pill (left-aligned, no flame), the win rate of the last 50 with its victories, defeats and draws, and the bar. "N partidas disputadas · ELO observado en sincronizaciones", "N de M partidas contra bots" and "Historial: X % de victorias" are now the first lines of «Estadísticas».
Why: the hero carried eight facts and an orphaned pill; the flame was the one streak cue left, against "no streak pressure".
Rejected: keeping "contra bots" in the hero (context for a reader, not for the glance); dropping the history rate (it is the reference for the recent window, so it stays one open away).
Rests on: web/src/app/features/chess/chess.ts (hero()), chess.html, chess.spec.ts, copy-chess.md. Checked in a browser on the local worker at 390×844 and 1280×800 (hero 139 px tall at 390 px).

## 2026-11-17 Chess reads one step brighter: --muted is #a3b3c8 inside app-chess

Decided: the owner (second chess critique, P2 "tono apagado en exteriores"; "limitarlo a Chess" accepted). Measured first: the global --muted (#8ea0b8) already gave 6.19:1 on the card and 5.15:1 on a hovered row, so this is legibility in glare, not a WCAG failure. Inside `app-chess` the token is `--muted-bright` (#a3b3c8, declared in :root like every colour) (7.74:1 on the card, 6.43:1 on a hovered row). Every other page keeps #8ea0b8; the uppercase section headings are unchanged.
Why: the owner reads Chess on a phone outdoors and most secondary data (dates, ELO, window counts, scope lines) is --muted at 12-13 px.
Rejected: changing the global token (it moves every page and the verdict vocabulary around it); sentence-case headings only on Chess (a design-system decision, not a Chess one).
Rests on: web/src/styles.css (`--muted-bright` in :root, `app-chess{--muted:var(--muted-bright)}`); tests/webDesignTokens.test.ts forbids raw hex outside :root. Checked in a browser on the local worker: Chess reads rgb(163, 179, 200), Idiomas stays rgb(142, 160, 184).

## 2026-11-17 Forma actual says one sentence about the change, and keeps the interval one open away

Decided: the owner (second chess critique, P2 "Forma actual con una masa de texto"). Under the two halves (Últimas N / Anteriores M) the card now says "Vas mejor que antes…", "Vas peor que antes…" or "Sin diferencia clara con las M partidas anteriores." A direction is named only when the 95 % interval of the win-rate change excludes 0; otherwise the neutral line. The interval and its "sin evidencia suficiente" stay verbatim inside "Detalle del intervalo".
Why: "−20,0 puntos de % (entre −39,9 y +13,4) · sin evidencia suficiente vs anteriores" was an 11-line blob that asked the reader to do the inference themselves.
Rejected: a small interval graphic (more to build and to describe for a screen reader than the sentence needs); naming a direction from the point estimate alone (a verdict stronger than the evidence).
Rests on: web/src/app/features/chess/chess.ts (formVerdict), chess.html, chess.spec.ts. Checked in a browser on the local worker at 390×844: the demo's −20,0 with an interval from −39,9 to +13,4 reads "Sin diferencia clara".

## 2026-11-17 On a phone the games come before the filter chips; empty ELO is not shown; the ELO change says since when

Decided: the owner (third chess critique: P1 "filtros antes que la primera partida", plus the cheap P2s). Up to 760 px wide the Rival / Resultado / Color chips sit behind one "Filtros · <active>" button (closed by default) so the first game appears right under the header; with the full list open ("Ver todas y filtrar") the chips show and the button goes. The ELO column shows only when some row has an opponent ELO (most games are against bots). The hero's change reads "−54 vs primera lectura (20 oct)". The engine's errors in the viewer are rows of at least 44 px.
Why: stacking each label over its chips (#217) fixed the header but made the filter block about 340 px tall on a phone, and the owner mostly scans results, not slices them.
Rejected: one horizontal chip row (hides options off-screen); dropping the chips on phones (the filters stay one tap away).
Rests on: web/src/app/features/chess/components/matches-table.ts (btnFilters, showElo, chipSummary), chess.ts (hero sub), styles.css (.filters-toggle, #gErrors .linkbtn). Checked in a browser on the local worker at 390×844 with mocked games; not yet with the real list.


## Games critique (27/40): draft crash, hero count, sheet focus, card overlap
Decided: the owner ("P1 + P2 + P3"). A sheet draft no longer breaks `/games/<juego>`: the draft reopens only on the hub, the one page that renders the sheet. The hero says "Hoy · sin registrar", "Hoy · faltan 4" or "Hoy · todo registrado", never "N de 6", which the trend headline ("0 de 6 juegos mejoran") already uses. The streak moved from beside the title to the hero footer. The sheet opens with focus on the first empty time, so the keypad is one tap away. In the game rows the name column sizes to its chip and the number column takes the rest, so "Pocos datos" no longer overlaps the caption.
Why: a reload on a game report with an interrupted sheet showed a blank page (NG0951), a silent failure; two "0 de 6" in one card read as "nothing logged" and "nothing improves" at a glance.
Rejected: keeping "N de 6" with a different label (the same glyphs still read as one number); dropping the streak (kept, small, in the footer).
Open: "Registrar hoy" on Hoy sits about 8 px above the bottom nav on first paint at 390×844 (below the fold, reachable by scrolling); desktop touch targets (sidebar, range buttons) and the 1.5:1 ghost-button border are untouched.
Rests on: games.ts (viewChild, draft effect, todayTitle), games.html, games-register.ts (open focus), styles.css (.gc). Checked on the local worker at 390×844 with demo data; tests: draft + report route, focus, title wording.

## Games hub: today first
Decided: the owner ("Hoy primero"). The first block of /games is "Hoy · faltan N" with six rows, one per game, each a button showing today's time, "Solo media" or "Sin registrar" ("No se pudo leer" when the day could not be read, never "Sin registrar"). A row opens the sheet with focus on that game's time; "Registrar hoy" still opens it on the first empty one. The trend moved below as "Cómo vas" (the "N de 6 juegos mejoran" headline, bar and sentence), then the period chooser and "Tus juegos", whose cards still link to each report. Record, dates, streak and CSV are the page footer. The streak stays small in the footer (owner decision: no streak pressure).
Why: the owner opens Games mostly to log; the old first screen was a trend summary and "Registrar hoy" sat below it.
Rejected: a second tap target per row for "Ver informe" (the report stays on its card); the streak beside the title.
Rests on: games.html, games.ts (today), games-register.ts (open(game)), styles.css (.gt, .gt-row, .go). Checked on the local worker at 390×844 with demo data: button bottom at y=492, rows 48 px, foot inside the gutters.
