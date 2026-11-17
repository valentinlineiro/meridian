## Voice Rules Used

- Spanish, second person singular ("tus mates", "pulsa"), as the rest of the app.
- A failure says what did not load, in the app's own form "No pudimos cargar …", and ends on the action. No apology, no "ups", no exclamation marks.
- Retry wording is the shared error block's: the button is "Reintentar", "Cargando…" and disabled while it runs, then "Sigue sin cargar. Inténtalo en un minuto." Nothing retries by itself.
- Engine losses are said in pawns with one decimal, as the profile says them. "cp" does not appear.
- One action has one name. Dates, counts and window sizes are built from the data at render time; no string is concatenated from fragments.

## Copy Deck

### Page, first load and failure

| Surface | String | Notes |
|---|---|---|
| Skeleton, for screen readers | "Cargando tu ajedrez" | Same pattern as Hoy ("Cargando tu resumen") |
| Visible line under the hero after 3 s | "Cargando tu ajedrez…" | Also the status text; removed when the data arrives |
| Page failed (summary or bundle) | "No pudimos cargar tus estadísticas de ajedrez." + button "Reintentar" | Replaces "No se pudieron cargar las estadísticas de ajedrez." and the dashes in the hero |
| Retry running | Button "Cargando…", disabled | |
| Retry failed again | "Sigue sin cargar. Inténtalo en un minuto." | |
| Device offline | "Sin conexión. Pulsa Reintentar cuando vuelva la red." | Shown when the browser reports offline; same button |
| Streak, winning run | "🔥 3 victorias consecutivas" · singular "🔥 1 victoria consecutiva" | The flame stays for wins only |
| Streak, losing run | "3 derrotas consecutivas" | No icon; the pill keeps the loss colour |
| Streak, none | "Sin racha activa" | No icon |

### Forma actual

| Surface | String | Notes |
|---|---|---|
| No games before the window | "Aún no hay partidas anteriores a las últimas 100 con las que comparar. Elige una ventana menor." | The number is the window picked; the selector stays above |
| The chosen window failed | "No pudimos cargar las últimas 100 partidas." + "Reintentar" | The card keeps the window that loaded; the number is the window picked |

### Suggested game and engine

| Surface | String | Notes |
|---|---|---|
| Suggested-game line failed | "No pudimos cargar la partida sugerida." + "Reintentar" | Replaces "Partida sugerida para revisión: No disponible" |
| Engine profile failed | "No pudimos cargar el análisis del motor." + "Reintentar" | One retry serves this and the line above |

### Blocks of the openings section

| Block | Failed | Notes |
|---|---|---|
| Cómo terminan tus mates | "No pudimos cargar tus mates." + "Reintentar" | The empty case keeps its existing line |
| Amenazas de mate | "No pudimos cargar las amenazas de mate." + "Reintentar" | |
| Repertorio de aperturas | "No pudimos cargar tus aperturas." + "Reintentar" | Replaces "No disponible" |
| Fases de partida | "No pudimos cargar las fases." + "Reintentar" | Replaces "No disponible" |

### Partidas table

| Surface | String | Notes |
|---|---|---|
| Button that opens the full list | "Ver todas y filtrar" | Replaces "Ver todas las partidas" |
| Ending filter, first option | "Fin: Todos" | |
| Ending filter, options | Mate · Desconexión · Ahogado · Repetición · Rendición · Material insuficiente · Tiempo · 50 jugadas | The table pills and the select both say "Material insuficiente" |
| ELO fields, visible placeholder | "ELO mín" · "ELO máx" | Unchanged |
| ELO fields, accessible name | "ELO mínimo del rival" · "ELO máximo del rival" | The placeholder disappears when typing |
| ELO bounds inverted | "ELO mín no puede ser mayor que ELO máx." | Under the pair, linked to both fields |
| Clear button | "Limpiar filtros" | Replaces "Limpiar"; the same words in the bar and in the empty line |
| No match | "Sin partidas con esos filtros." + "Limpiar filtros" | |
| Counter | "1–50 de 123" · "0 partidas" | Polite live region |
| Table failed | "No pudimos cargar las partidas." + "Reintentar" | Replaces "No se pudieron cargar las partidas." |
| Tap on a row without moves | "Esta partida no tiene jugadas guardadas." | Status line, 4 s |
| Row that opens, accessible name | "Ver partida vs Neural, 14 nov" | Unchanged; the "›" is hidden from assistive technology |

### Game viewer

| Surface | String | Notes |
|---|---|---|
| Title while loading | "Cargando partida…" | Unchanged |
| Temporary failure | "No pudimos cargar la partida." + "Reintentar" | Timeout or server error |
| No stored moves | "Esta partida no tiene jugadas guardadas." | Replaces "No hay partida completa guardada para esta partida."; the same sentence as the table's status line |
| Moves that are not a legal game | "Las jugadas guardadas no son una partida válida." | Unchanged |
| Engine summary | "Según el motor: 3 errores graves en 40 jugadas tuyas · pérdida media 0,4 peones por jugada" | Replaces "pérdida media 42 cp" |
| Engine worst move | "Jugada 12 (Cxd4): pierdes 1,8 peones; el motor prefería Dd2" | Replaces "pierdes 180 cp" |

### Accessible names and announcements

| Surface | String | Notes |
|---|---|---|
| Search, rival, ending, phase, opening fields | "Buscar rival" · "Rival" · "Fin de la partida" · "Fase" · "Apertura" | `aria-label`; each contains the visible word |
| Board | "Posición tras la jugada 12, Cxd4. Blancas: rey g1, dama d2. Negras: rey g8." · "Posición inicial" | Spanish piece names (rey, dama, torre, alfil, caballo, peón) from the FEN |
| Move button | "Jugada 12, Cxd4" | Current one `aria-current="step"` |
| Position announcement | "Jugada 12 de 40: Cxd4" | Polite |
| Ending line on the phone card | The ending pill, and "Revisada" when set | Third line of the card |
| Results line | "12 victorias · 8 derrotas · 5 tablas" | Replaces "12W · 8L · 5D" in the hero and in Forma actual |
