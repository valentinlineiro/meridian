## Voice Rules Used

- Spanish, second person singular ("tu tiempo", "pulsa"), as the rest of the app.
- A sentence says what happened or what to do, in that order, with the data in guillemets «» when the person typed it.
- No exclamation marks, no apologies, no "ups". An error names the field or section and ends on the action.
- Names are not concatenated: lists of games use the locale's list format, dates and "hoy / ayer" are built from timestamps at render time, and each section has its own full error sentence.

## Copy Deck

### Hoy

| Surface | String | Notes |
|---|---|---|
| Games row button | "Registrar hoy" / "Editar lo de hoy" | Same words as the Games page button. Switches when something is stored for today |
| Games row link | Accessible name: "LinkedIn Games" (from the heading); description: the sentence line | See the accessibility file |
| Loading | Skeleton per row; status text for screen readers "Cargando tu resumen" | Replaces the dashes that look like missing data |
| Row unavailable | "No disponible" | Unchanged |
| Block under the rows when any row failed | "Algunas secciones no cargaron." + button "Reintentar" | One block, not one per row |
| Retry in progress | Button label "Cargando…", disabled | |
| Retry failed again | "Sigue sin cargar. Inténtalo en un minuto." | Honest about waiting; no automatic retry |
| Result of a save from Hoy | Status region: the "Guardado…" note below | Same strings as the sheet's result note |

### Hoy, Games row (strings the row already has)

| Part | String | Source |
|---|---|---|
| Size and caption | "−6 %" · "Zip · más rápido que la media" | `focusOf` in `overview.model.ts` |
| Verdict line | "Zip: Mejorando · 1 sin cambios" | `gamesRow().line`: head game and verdict, then counts of the other games |
| Streak line | "Racha: 5 días seguidos"; without a streak, "Sin registro desde 14 nov · registro manual" | `gamesRow().streak` |
| Tag | "registro manual" | header of the card |
| Nothing logged ever | "Sin partidas registradas aún" | `gamesRow()` |

The row needs no sentence about today. The button label says whether today has an entry ("Registrar hoy" / "Editar lo de hoy"), and the streak line already says when the last entry was. Choosing the label compares the summary's `to` (the last day with a played game) with today's date; filling the sheet's rows still needs the day request.

### Register sheet

| Surface | String | Notes |
|---|---|---|
| Title | "Hoy, 16 nov" | Date from the timestamp, locale format |
| Intro | "Tu tiempo y la media de LinkedIn de cada juego, como m:ss (por ejemplo 1:06). Deja vacío el que no hayas jugado; vacía uno ya guardado para quitarlo." | The format sits here because the placeholder disappears; every field points to this line |
| Column headers | "Tu tiempo" · "Media" | Unchanged |
| Placeholder | "m:ss" | Was "mm:ss"; the parser takes one-digit minutes |
| Field names (screen reader) | "Zip: tu tiempo" · "Zip: media de LinkedIn" | Unchanged pattern |
| Stored data could not be read | "No pudimos leer lo guardado de hoy. Lo que escribas se añade o cambia; no se borra nada." + "Volver a leer" | |
| Draft restored after login or reload | "Recuperamos lo que habías escrito." | One line above the rows, gone on the first edit |
| Row marked for removal | "Se quitará al guardar" + button "Deshacer" | Button name for assistive tech: "Deshacer: quitar Zip" |
| Removal undone (screen reader) | "Zip: se mantiene" | Status |
| Guardar disabled | "Escribe al menos un tiempo." | Under the button, linked with `aria-describedby` |
| Saving | Button "Guardando…" | |
| Close with unsaved edits | "Tienes cambios sin guardar: Zip, Queens." + "Seguir editando" (default) · "Descartar cambios" | The games with edits are named, so the loss is concrete. "Descartar" alone does not name what is lost. Screen reader reads the same sentence |
| Midnight passed | "Ya es 17 nov." + "Guardar en 17 nov" · "Guardar en 16 nov" | Two buttons that name the outcome; no "Cancelar" |
| Row error, time not valid | "«1:6» no es un tiempo. Escríbelo como m:ss, por ejemplo 1:06." | |
| Row error, average not valid | "«x» no es una media válida. Escríbela como m:ss, por ejemplo 0:53." | |
| Row error, average without time | "Falta tu tiempo. La media sola no se guarda." | Today an average with a blank time is dropped without a word |
| Summary after a failed save | "Revisa: Zip, Queens." | Names, not a count; read as the status when focus lands on the first bad field |
| Saved | Page status: "Guardado: Zip 0:48, Queens 1:12. Quitado: Mini Sudoku." | The "Quitado" part appears only when something was removed |
| Nothing changed | "Sin cambios: ya estaba guardado." | Unchanged |
| Save, no answer or timeout | "No sabemos si se guardó. Tus tiempos siguen aquí; pulsa Guardar otra vez, no se duplica." | Safe because the server treats the same text as "sin cambios" |
| Save, offline | "Sin conexión. Tus tiempos siguen aquí; guarda cuando vuelva la red." | Shown when the browser reports offline |
| Save, server error | "No pudimos guardar. Tus tiempos siguen aquí; inténtalo de nuevo." | |
| Saved, page refresh failed | "Guardado. No pudimos actualizar esta página." + "Reintentar" | |
| Paste option | "Pegar texto o varias fechas" | Unchanged |

The masked time field is its own reading, so the separate echo line proposed in the earlier files is dropped.

## Error Message Inventory

| Trigger | Message | Severity and tone |
|---|---|---|
| Time field not in m:ss | See row errors above | Validation: specific, inline, no drama |
| Save fails with no answer | "No sabemos si se guardó…" | Recoverable: honest about the unknown, says the input is safe |
| Session ended | Login page; on return "Recuperamos lo que habías escrito." | Recoverable: the sheet reopens by itself |
| Hoy, section did not load | "Algunas secciones no cargaron." | Recoverable: one action |
| Games did not load | "No pudimos cargar tus juegos." + "Reintentar" | Recoverable |
| Qué cambió, server error | "No pudimos cargar los cambios." + "Reintentar" | Replaces "Error al cargar cambios (/api/what-changed)." |
| Qué cambió, no connection | "Sin conexión. Comprueba la red y pulsa Reintentar." | Replaces "Error de conexión al cargar cambios." |
| Qué cambió, incomplete answer | "Los cambios llegaron incompletos. Pulsa Reintentar." | Replaces the endpoint-path message |
| Configuración, save fails | "No se pudo guardar. Inténtalo de nuevo." | Replaces "No se pudo guardar: 200" |

## Naming and Labels

| Where | Now | Change |
|---|---|---|
| Qué cambió | Nav "Qué cambió", h1 "¿Qué ha cambiado?" | h1 "Qué cambió", as the nav and the page title |
| LinkedIn Games | Tab "Games"; elsewhere "LinkedIn Games" | Headings, titles, sidebar: "LinkedIn Games". Tab bar keeps "Games" (width) with the accessible name "LinkedIn Games" |
| Ajedrez, jump buttons and sections | "Comparativa", "Aperturas", "Evolución" lead to "Comparativa por color y oponente", "Repertorio de aperturas y fases", "Evolución y detalle" | Button and section title are the same words: "Color y oponentes", "Aperturas y fases", "Resultados y ELO del rival". The "Evolución · ELO" card keeps its name |
| Idiomas empty | "Sin datos de Languages — sincroniza con la extensión." | "Aún no hay datos de Idiomas. Pulsa Sincronizar para traerlos." |
| Sync hint and tooltip | "Fuentes conectadas (Duolingo) · Games manual" | "Ajedrez e Idiomas se sincronizan. Games se registra a mano." Tooltip: "Sincroniza Ajedrez e Idiomas (Duolingo). Games se registra a mano." |
| Qué cambió window header | "Desde tu última visita (2026-11-16 14:05 UTC)" | "Desde tu última visita (ayer, 22:10)"; further back "12 nov, 15:05"; local time, built at render |
| Loss map help (touch) | "Pasa el ratón por encima para ver…" | "Toca una casilla para ver el detalle." The detail prints under the table on touch |

## Decisions

- The server returns a field code with each row error (`score`, `avg`, `game`, `line`) next to the existing `reason`. The sheet picks its own sentence from the code, validates with the same rules before sending, and shows the server `reason` only for a code it does not know. Server change, for the same work as the removal command.
- The discard bar names the games with edits.

## Open Questions

- When a pasted multi-date text fails in "Pegar texto o varias fechas", the errors are per line, not per game. Default: that box keeps the server's line sentences, since the person there is writing in the line format they describe. Does it get its own copy instead?
