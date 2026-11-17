# Meridian's chess games: finding a game and reading it

## Context

Meridian is a single-owner dashboard for chess, Duolingo languages and LinkedIn Games, on a Cloudflare Worker with D1 and an Angular front end. The owner mostly uses it on a phone and mainly for chess [mobile UX plan 2026-11-03]. Chess games arrive through the sync; the engine analyses them by itself after each sync and the profile and the suggested-game line read that analysis.

The Ajedrez screen answers two questions. How am I playing: hero, Forma actual, comparisons, openings, engine profile. Which game do I open to find out why: the suggested-game line, the Partidas table, the viewer. The second question is the one a number on the first one raises ("N por tiempo", an ELO range), and it is where the screen breaks.

## Gap

- The ending filter offers 5 of the 8 endings the table shows, so games lost on time, by insufficient material or by fifty moves cannot be listed [evaluation-chess-2026-11-17].
- The filters appear only after "Ver todas las partidas", a button named for browsing, and activating it removes the focused button, so keyboard and screen reader focus falls to the top of the page [accessibility-chess].
- On the phone the table becomes cards that hide the ending, so a filtered list does not show why its rows are there [accessibility-chess].
- ELO bounds wait for "Filtrar" while chips and selects apply at once. Rows that open the viewer look like rows that do not, and a tap on the second kind does nothing.
- Independent requests (Forma actual window, suggested game, engine profile, mates, threats, openings, phases, the table) fail as "No disponible" with no retry; the page's own "Reintentar" is never disabled, so taps during a 503 each send the bundle request again. Re-picking the selected window sends nothing [states-chess-2026-11-17].
- The viewer reports every failure, including a server error, as "No hay partida completa guardada", which reads as a deleted game.
- The viewer shows losses in centipawns where the profile uses pawns; the board is 64 unnamed glyphs; moves are links styled only by colour [accessibility-chess].

## Opportunity

The engine analysis and the table exist; the path from a number to the game behind it is what is missing. The change is small, touches existing components, and needs no new endpoint: the matches route filters by any stored ending (`api/stats.ts:496`). The failure states matter more than their size: the owner is on a phone, where a D1 or Worker 503 happens [d1-overload-500s-2026-11-11], and today a failed card cannot be told from an empty one.

## Goals

- From the 10 recent games, list any ending and open a game in 4 taps.
- Every filter control changes the list when the person is done with it, by the same rule.
- A failed block names what did not load and offers one manual retry that sends one request at a time.
- A game that cannot load right now is not described as a game that does not exist.
- The filtered phone list shows each game's ending.
- A keyboard or screen reader user reaches the filters after opening the full list, and hears the effect of a filter.

## Constraints

- One owner; Free-plan Worker CPU and D1 write budget. The change adds no write and no endpoint.
- Nothing retries by itself: a retry storm made the 2026-11-11 overload worse.
- Production data is read only with a fresh grant from the owner.
- Spanish copy, second person singular; a single dark theme.
- Delivery already goes through continuous deploy on every green push to main [meridian-two-code-lines].

## Guiding Principles

- A number on one card has a way into its games.
- A failure says what failed and what to do, and never looks like an empty result.
- One action has one name and one rule.
- The move list is the navigable form of a game; the board says where the pieces are.

## Key Assumptions & Open Questions

Assumptions:
- Searching by ending is something the owner does after reading the Resultados card; no usage data exists for the table, and the page records none.
- Transient 503s reach the independent requests on the phone often enough to need per-card retry; the bundle request already has a page-level retry.

Open questions:
- Should the Resultados counts ("12 por tiempo") open the list already filtered?
- Should the viewer step to the previous and next game of the filtered list?
- Should the filters live in the URL, so Back and a shared link keep them?
- What share of games has stored moves? It decides how often "Esta partida no tiene jugadas guardadas." appears, and needs a production read.
- Does the phone's Back gesture close the viewer or leave Ajedrez?

## Proposed Scope (Phase 1)

In:
- Page error block on the shared error block, disabled while loading; card-level retry for Forma actual, suggested game, engine profile, mates, threats, openings, phases and the table; polite `status` role on card-level blocks.
- Viewer: temporary and permanent failures told apart, with "Reintentar" on the first; moves as buttons with `aria-current`; live position; pawns in place of centipawns; a text description of the board.
- Partidas: all eight endings in the filter; ELO bounds apply on blur or Enter and "Filtrar" is removed; "Ver todas y filtrar" with focus on "Buscar rival"; "›" on rows that open and a status line on the rest; "Limpiar filtros" in the empty line; the ending on the phone cards; accessible names and a live counter.
- Loading: skeleton at once, "Cargando tu ajedrez…" after 3 s; the offline message on the page error block.
- Forma actual empty message for short histories; no flame on a losing run; "12 victorias · 8 derrotas · 5 tablas" in place of W/L/D.
- The filter-field border and the other Medium and Low accessibility items in `accessibility-chess.md`, and the strings in `copy-chess.md`.

Deferred:
- Resultados counts as links into the filtered list.
- Previous and next game in the viewer.
- Filters in the URL.
- Usage measurement of the table (needs `/measure` first).
- Light theme.
