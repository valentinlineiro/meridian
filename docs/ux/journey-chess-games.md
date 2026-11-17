## Problem Statement

The person has seen a number about their chess games (a result by ending, an ELO range) and wants the games behind it, then wants to open one and read it. Today the path has three breaks [evaluation-chess-2026-11-17]:

- The ending filter offers 5 of the 8 endings the table shows, so a loss on time, insufficient material or fifty moves cannot be listed.
- ELO bounds wait for "Filtrar" while every chip and select applies at once.
- Rows that open the viewer look the same as rows that do not, and a tap on the second kind does nothing.

Success: from the 10 recent games, any ending listed and a game open in 4 taps, with every control doing what its neighbours do.

## User Context & Variations

One person, on a phone, who reads their own games to find what went wrong (the review line at the top already serves "which game first") [mobile UX plan 2026-11-03].

- Entry from Partidas with the 10 recent games, a chip or select already changed, or an ELO range typed.
- Rows with stored moves open the viewer; rows without do not.

## Screen-by-Screen Flow

**1. Partidas, 10 recent games.** The filters for ending, phase, opening and ELO are hidden until the full list opens, and the button that opens it is named for browsing. The button now says what the person came to do: "Ver todas y filtrar".

**2. Full list with filters.** Focus moves to "Buscar rival" when the list opens. Ending, phase and opening apply when picked. The ELO bounds apply when the field loses focus or on Enter, so the list changes after the person finishes a number. "Filtrar" is removed: with it gone, one rule remains, a control changes the list when the person has finished with it.

**3. Filtered list.**
- The counter ("1–50 de 123") is read out when it changes, so a screen reader hears the effect of a filter.
- With no match, the empty line carries its own "Limpiar filtros" button, so the way out is where the person is looking.
- With ELO mín above ELO máx, no request is sent and the field says why; the other filters still apply.

**4. A row.** A row with stored moves shows the rival as a link with a trailing "›", and the whole row opens the viewer. A row without moves keeps plain text with no "›". Tapping it shows a status line: "Esta partida no tiene jugadas guardadas."

**5. Viewer.** Unchanged: board, moves, engine errors. Closing returns focus to the row button that opened it, with the filters and page as they were.

## Device Variants

Phone (under 760 px): the table is a stack of labelled cards, each with a third line for the ending and "Revisada" when set (the filter's reason shows on the card); the "›" sits at the end of the rival line and the card is the tap target (44 px minimum). The status line appears under the table's heading, above the cards, so it is on screen when the person taps a card.

Desktop: the "›" sits at the end of the rival cell; the hover tooltip "Ver partida" stays.

## Copy Specifications

| Where | String |
|---|---|
| Button that opens the full list | Ver todas y filtrar |
| Ending filter, first option | Fin: Todos |
| Ending filter, options | Mate · Desconexión · Ahogado · Repetición · Rendición · Material insuficiente · Tiempo · 50 jugadas |
| ELO bounds inverted | ELO mín no puede ser mayor que ELO máx. |
| No match | Sin partidas con esos filtros · button: Limpiar filtros |
| Tap on a row without moves | Esta partida no tiene jugadas guardadas. |

## Interaction Specifications

- ELO fields (`#fMin`, `#fMax`): the value applies on blur when it changed, and on Enter. A change that leaves the value as it was sends no request. Digits only; other characters are ignored on input.
- Inverted bounds: both fields keep what was typed; the message sits under the pair, tied to the fields with `aria-describedby`, and clears as soon as the bounds are in order.
- Counter (`#mc`): a polite live region. It does not announce while a page is loading.
- "Limpiar filtros" clears every filter and the search text, returns to page 1 and puts focus on the first chip.
- Status line for a row without moves: `role="status"`, 4 s on screen, cleared early by the next filter change.
- Viewer close: focus returns to the opening row (existing behaviour, kept).
- Chips, selects and search keep the instant apply they have now (search waits 300 ms).

## Flow Metrics & Success Criteria

| Task | Steps now | Steps after |
|---|---|---|
| List games lost on time and open one | cannot be done | Ver todas y filtrar · Fin · Tiempo · tap row (4 taps) |
| Set an ELO range | tap min, type, tap max, type, tap Filtrar | tap min, type, tap max, type |

The step counts are estimated. The page records no use of the table, so completion is not measured; a measurement plan is for `/measure` [decision-log-games-register: no usage measurement].

## Open Questions

- Should the counts on the Resultados card ("12 por tiempo") open the list already filtered?
- Should the viewer step to the previous and next game of the filtered list?
- Should the filters live in the URL, so Back and a shared link keep them?
- What share of games has stored moves? It decides how often the status line appears, and needs a production read.
