# Ajedrez screen (hero, form, comparisons, openings, engine profile, games table, game viewer)

## Anti-Pattern Verdict

Clean. The streak pill ("🔥 3 victorias consecutivas") is a description of the last results, with no loss threat, reminder or reward behind it; it is not Streak Manipulation. One tone issue is listed under Minor. Missing Feedback appears once, as the major finding below.

## Priority Issues

### Critical

None. Every core task completes: read current ELO and form, open the suggested game, browse and filter games.

### Major

**A card that failed to load says "No disponible", the same as a card with nothing to show, and offers no retry.**
Where: Forma actual (when the chosen window fails), the suggested-game line at the top ("Partida sugerida para revisión: No disponible"), the engine profile, the mates and threats blocks, and the openings and phases blocks (each independent request in `chess.ts`). The summary, results, colour, opponents, ELO and timeline cards come from one bundle request and fail together with the summary, so they are covered by the page error box.
Why it matters: only the summary has an error box with "Reintentar". On the phone a transient D1 or Worker 503 on one of the independent requests leaves a card that looks like missing data. The person cannot tell "wait and retry" from "there is nothing here", and the only recovery is a full reload (re-picking the selected window sends nothing).
Heuristic: visibility of system status; help users recover from errors.
Change: separate "no data" ("Sin lecturas de ELO") from "no se pudo cargar" per card, and put one "Reintentar" on any card that failed, reloading only that request.

### Minor

**A game with no stored moves looks the same as one that opens.**
Where: Partidas table. The rival name is a button (`.rowbtn`, `all: inherit`), so it reads as plain text on a phone; only rows with moves open the viewer, and the "Ver partida" cue is a hover tooltip.
Why it matters: tapping a row that cannot open does nothing and says nothing.
Heuristic: recognition rather than recall.
Change: mark rows that open (a "Ver" affordance or chevron) and dim or label rows that have no moves ("Sin jugadas guardadas").

**The "Fin" filter cannot select a loss on time, insufficient material or fifty moves.**
Where: `ends` in `matches-table.ts` lists 5 of the 8 endings the table itself displays. The Resultados card says "N por tiempo" and the person cannot list those games.
Why it matters: a number on one card has no way into its games.
Heuristic: consistency and standards.
Change: offer all eight endings in the filter, in the same words as the table pills.

**The ELO bounds wait for "Filtrar" while every chip and select filters at once.**
Where: "ELO mín" / "ELO máx" use a draft; chips, selects and search apply immediately.
Why it matters: typing a range and seeing the list unchanged reads as a broken filter.
Heuristic: consistency and standards.
Change: apply the bounds when the field loses focus or after a short pause, as search does, and drop "Filtrar".

**The game viewer and the profile give the same loss in different units.**
Where: viewer "pierdes 180 cp; el motor prefería…" and "pérdida media 42 cp"; engine profile "pérdida media: 0,4 peones por jugada".
Why it matters: "cp" is an engine term the profile deliberately avoids, and the person must convert between the two to compare a game with their profile.
Heuristic: match between system and real world.
Change: use pawns in the viewer, with one decimal.

**The viewer's loading and error states are not announced, and moves are links.**
Where: `#gErr` has no live region; the title changes to "Cargando partida…"; each move is `<a href="#">` with a click handler.
Why it matters: a screen reader user opening a game without stored moves hears nothing, and moves are announced as links that navigate.
Heuristic: visibility of system status.
Change: give the error line `role="status"`, and make each move a button with its move number in the label.

**A losing run carries the same flame as a winning one.**
Where: hero pill, "🔥 3 derrotas consecutivas".
Why it matters: the flame reads as celebration on a result the person wants to understand, not be cheered for.
Heuristic: match between system and real world.
Change: use the flame only for a winning run; show a loss run with the loss pill colour and no icon.

### Cosmetic

**The hero and "Forma actual" show the same window by default.**
Where: the hero's "% de victorias en las últimas 50 partidas" and the Forma actual card opened on 50.
Change: start Forma actual on 20, or fold the hero line into the card.

**An empty `#formMeta` span sits beside the window selector.**
Change: delete it.

## Heuristic Verdicts

- Visibility of system status: broken (a failed card says "No disponible" and offers no retry).
- Match between system and real world: strained (centipawns in the viewer, pawns in the profile).
- User control and freedom: holds.
- Consistency and standards: strained (ELO bounds wait for "Filtrar"; the ending filter has 5 of 8 endings).
- Error prevention: holds.
- Recognition rather than recall: strained (rows that open look like rows that do not).
- Flexibility and efficiency of use: holds.
- Aesthetic and minimalist design: strained (the hero and the form card repeat the same window).
- Help users recognize, diagnose, and recover from errors: broken (a failed card says "No disponible" and offers no retry).
- Help and documentation: holds.

## Cognitive Walkthrough Results

| Task | Step | Motivation | Visibility | Understanding | Feedback | Rating | Finding |
|---|---|---|---|---|---|---|---|
| Open a game from the table | Tap a row | yes | no | no | no | Failure | A game with no stored moves looks the same as one that opens |
| List the games lost on time | Open "Fin" filter | yes | no | yes | no | Failure | The "Fin" filter cannot select a loss on time |
| Narrow to an ELO range | Type "ELO máx" | yes | yes | no | no | Failure | The ELO bounds wait for "Filtrar" |
| Recover from a card that did not load | Look at "Forma actual" | no | no | no | no | Failure | A card that failed to load says "No disponible" |
| Review the suggested game | Tap "Revisar vs…" | yes | yes | yes | yes | Pass | |

## Positive Findings

- Every rate that comes from few games shows its interval or says how few there are ("sin histórico comparable", the 50-move floor per phase, the bots-only caveat); protect this when the page is simplified.
- The suggested-game line leads from the top of the page to a board in one tap, and says why the list is empty when the engine has not run.
- The page index writes its block into the URL, so Back and shared links return to the same place.
- A failed games request says so instead of showing an empty table, and the empty state names the cause ("Sin partidas con esos filtros").
- Row buttons grow to 44px on a phone and the table becomes labelled cards.
- "¿Cómo sabemos esto?" explains the three questions the person is likely to ask: result, bots versus people, and where ELO comes from.

## Recommended Actions

1. A card that failed to load says "No disponible", the same as a card with nothing to show, and offers no retry
2. The "Fin" filter cannot select a loss on time, insufficient material or fifty moves
3. A game with no stored moves looks the same as one that opens
4. The ELO bounds wait for "Filtrar" while every chip and select filters at once
5. The game viewer and the profile give the same loss in different units
6. The viewer's loading and error states are not announced, and moves are links
7. A losing run carries the same flame as a winning one
8. The hero and "Forma actual" show the same window by default
9. An empty `#formMeta` span sits beside the window selector
