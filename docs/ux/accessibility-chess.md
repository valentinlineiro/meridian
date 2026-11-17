## Accessibility Audit — Per WCAG Principle

### Perceivable

**The filter fields have no visible boundary (1.4.11 Non-text contrast).**
Search, "ELO mín", "ELO máx" and the four selects use the global input rule: border `--line-strong` (#2a3d56) on the card (#131f33), 1.49:1. On a phone in sunlight the fields read as plain text.
Change: the same fix as the Games register, one rule in `styles.css:60`: border #5b7a9e, 3.7:1 on the card. Chess needs no separate change [accessibility-games-register].
Done when: a contrast checker reads at least 3:1 between each filter field's border and the card behind it.

**The board is 64 glyphs with no name and says nothing about the position (1.1.1 Non-text content, 1.3.1).**
`m-chess-board` renders one `<i>` per square. A screen reader reads each piece glyph in turn, or skips them, and a blind user never learns where the pieces are. The move list works as text, but the board next to it is noise.
Change: the board is `role="img"` with an `aria-label` such as "Posición tras la jugada 12, Cxd4. Blancas: rey g1, dama d2, … Negras: rey g8, …", built from the FEN in Spanish piece names; the squares are `aria-hidden`. The label is read when the user reaches the board; stepping announces only the move (see the live-region table).
Done when: VoiceOver reads one item for the board, its label changes when the move changes, and the start position reads "Posición inicial".

**Graphics repeat the text beside them and are read as graphics or emoji (1.1.1).**
The ELO line (`m-sparkline`), the results ring (`m-donut`) and the win/loss/draw bar (`#chessHeroDist`, with hover-only `title`s) carry no alternative, while `#evoNote`, the legend and `#chessHeroDistMeta` say the same in text. The flame in "🔥 3 victorias consecutivas" is read as "fuego".
Change: `aria-hidden="true"` on the three graphics and on the flame; the adjacent text stays as the alternative. Same for the "›" the journey adds to openable rows.
Done when: a screen reader reading the hero and Evolución announces no graphic and no emoji name.

### Operable

**Focus is lost when the full list opens (2.4.3 Focus order).**
"Ver todas y filtrar" is replaced in the template by the pager when `compact()` turns false, so the focused button leaves the DOM and focus falls to the start of the document. A keyboard or screen reader user must tab through the whole page again to reach the filters that just appeared.
Change: after the list opens, focus the search field ("Buscar rival"). On a phone this raises the keyboard; if that is unwanted, focus the first chip group instead, whose label "Rival" names the area.
Done when: pressing Enter on the button leaves focus on the first filter control and the screen reader reads its name.

**The page index and the retry buttons leave focus behind (2.4.3).**
The four jump buttons scroll and open a section but focus stays on the button; the screen reader user is not taken to what opened. A successful "Reintentar" removes the button and focus falls to the start of the page.
Change: `reveal()` and the "Partidas" jump move focus to the section's `summary` or to the card heading (`tabindex="-1"`, as `focusPage` does for page headings). After a retry that succeeds, focus goes to the heading of the card that loaded.
Done when: activating "Aperturas" leaves focus on that section's summary, and a successful retry leaves focus on the card's heading.

**Scrolling is smooth whatever the system setting (2.3.3, best practice).**
`scrollIntoView({ behavior: 'smooth' })` in `section.ts`, `chess.ts` and the viewer ignores "reduce motion".
Change: `behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'` in the three places.
Done when: with reduce motion on, a jump lands without animation.

### Understandable

**On the phone the cards hide the ending, so a filtered list does not show why its rows are there (1.3.1, and the journey's purpose).**
`styles.css` hides Tipo, Fin and Rev. in the phone cards. After filtering by Fin = Tiempo, the cards show date, ELO, colour and result, never "Tiempo". The person sees the filter chose them and cannot confirm it.
Change: a third card line with the ending pill at the left and "Revisada" at the right when set. Tipo stays hidden; the rival already says Bot or PvP.
Done when: on a 320 px viewport every card shows its ending.

**The filter controls take their names from placeholders and the first option (3.3.2, 4.1.2, 2.5.3 Label in name).**
"Buscar rival" is a placeholder; the four selects are announced by their current option ("Fin: Todos"), which stops being a name once another option is picked.
Change: `aria-label` on each, containing the visible word: "Buscar rival", "Rival", "Fin de la partida", "Fase", "Apertura", "ELO mínimo del rival", "ELO máximo del rival".
Done when: voice control "tocar Fin" focuses the ending select, and the select is announced with its name after a choice.

**Results are written "12W · 8L · 5D" in a Spanish page (3.1.2 Language of parts, best practice).**
`distMeta` and the form detail use W, L and D. A Spanish voice reads "doce uve" or spells the letters.
Change: "12 victorias · 8 derrotas · 5 tablas" in `distMeta` and the form detail; the copy deck owns the final wording.
Done when: no W/L/D letters remain in chess strings.

### Robust

**Moves are `<a href="#">` links and the current one is styled only (4.1.2, 4.1.3).**
Each move is an anchor with a click handler. The current one is marked by `.gm.on` (background and weight), and the "n / total" counter is a plain span.
Change: each move a `<button>` named with its number ("Jugada 12, Cxd4"); `aria-current="step"` on the current one; the counter a polite live region reading "Jugada 12 de 40: Cxd4".
Done when: stepping with ‹ › announces the new move once, and the move list shows its current item to a screen reader.

**The viewer's loading and error text is silent (4.1.3 Status messages).**
`#gErr` and the "Cargando partida…" title are not live regions.
Change: `role="status"` on the line that holds loading, failure and "Esta partida no tiene jugadas guardadas."; "Reintentar" is a button inside it.
Done when: opening a game that fails is announced without moving focus, and the retry button is reachable by Tab.

**Several error blocks at once interrupt each other (4.1.3).**
`ErrorBlock` is always `role="alert"`. When independent requests fail together, up to six assertive messages stack.
Change: a `role` input on `ErrorBlock`; the page-level block stays `alert`, the card-level ones use `status`.
Done when: three cards failing together produce one assertive announcement and two polite ones.

**The phone cards give assistive technology no column names (1.3.1).**
Below 760 px rows and cells become `display:block` or `grid`, the header row is `display:none`, and the CSS labels use `content: attr(data-l) / ""`, the form with an empty alternative. Values are read without "Fecha", "ELO" or "Resultado".
Change: keep the header row in the DOM, visually hidden (clip, not `display:none`), and put `role="table"`, `row`, `columnheader`, `cell` on the elements that carry them.
Done when: the screen reader's table navigation lists the games table and announces each cell with its column on a 320 px viewport.

## Screen Reader Flow Documentation

| Event | Announcement | Politeness | Focus |
|---|---|---|---|
| Page loading | "Cargando tu ajedrez" | polite, once | stays |
| Page failed | "No pudimos cargar tus estadísticas de ajedrez." + button | assertive | stays; Reintentar is the next Tab stop |
| A card failed (suggested game, Forma actual, engine, mates, threats, openings, phases, table) | The card's failure sentence | polite | stays |
| Retry succeeded | Nothing | — | the card's heading |
| Retry failed again | "Sigue sin cargar. Inténtalo en un minuto." | polite | stays on the button |
| Window changed | "Últimas 100: 54,0 % de victorias" (the card's head and rate) | polite, after the load | stays on the chip |
| Filter changed or cleared | The counter, "1–50 de 123" or "0 partidas" | polite, after the load | stays; after "Limpiar filtros", the first chip |
| ELO bounds inverted | "ELO mín no puede ser mayor que ELO máx." | polite | stays on the field |
| Tap on a row without moves | "Esta partida no tiene jugadas guardadas." | polite, 4 s | stays |
| Viewer opens | Dialog name ("vs Neural · blancas") then "Cargando partida…" | status | the close button |
| Viewer step | "Jugada 12 de 40: Cxd4" | polite | stays on ‹ or › |
| Viewer failed | "No pudimos cargar la partida." | polite | stays; Reintentar next |

## Keyboard Navigation Map

Tab order follows the visual order down the page: suggested-game button, the four section buttons, "Reintentar" when a block failed, Forma actual chips, each section's summary, then the Partidas controls (three chip groups, search, the four selects, the two ELO fields, "Limpiar filtros"), the row buttons, the pager.

Departures: none from the visual order.

Focus management:
- "Ver todas y filtrar" → focus on "Buscar rival".
- Section buttons → focus on the section's summary; "Partidas" → focus on its heading.
- A successful "Reintentar" → focus on the loaded card's heading.
- "Limpiar filtros" → focus on the first chip of the "Rival" group.
- Viewer: Tab trapped in the dialog, Escape closes it and focus returns to the row button that opened it; ← and → step the position.
- The 44 px minimum on phones already covers chips, buttons, selects, the filter fields, summaries and row buttons (`styles.css:148`, `:338`).

## Remediation Plan

### Critical

None. Every task can be completed with a keyboard and a screen reader; the move list stands in for the board.

### High

- Focus is lost when the full list opens
- On the phone the cards hide the ending, so a filtered list does not show why its rows are there

### Medium

- The board is 64 glyphs with no name and says nothing about the position
- Moves are `<a href="#">` links and the current one is styled only
- The viewer's loading and error text is silent
- The filter controls take their names from placeholders and the first option
- The page index and the retry buttons leave focus behind
- Several error blocks at once interrupt each other
- The phone cards give assistive technology no column names
- The filter fields have no visible boundary

### Low

- Graphics repeat the text beside them and are read as graphics or emoji
- Results are written "12W · 8L · 5D" in a Spanish page
- Scrolling is smooth whatever the system setting
