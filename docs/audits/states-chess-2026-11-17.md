## State Inventory

Every retry on this screen is manual and uses the shared error block (`error-block.ts`): the button is disabled while the request runs, and a second failure reads "Sigue sin cargar. Inténtalo en un minuto." Nothing retries by itself, because a retry storm made the D1 overload worse [d1-overload-500s-2026-11-11]. The request timeout stays at 10 s (`REQUEST_TIMEOUT_MS`).

| Screen / component | State | What the user sees | What they can do | Recovery / progress |
|---|---|---|---|---|
| Page (hero, KPIs, all cards) | Loading, first 3 s | Grey blocks in the shape of the hero, the two KPIs and the form card; section titles stay | Scroll, use the section index | The cards fill in; no text |
| Page | Loading, after 3 s | The same blocks plus one line under the hero: "Cargando ajedrez…" | Wait | After 10 s the request times out and the error state below replaces the blocks |
| Page (summary or bundle failed) | Error | Error block directly under the hero: "No se pudieron cargar las estadísticas de ajedrez." The hero shows no dashes, only its title; the section index is hidden | "Reintentar" | Button disabled while loading; on a second failure: "Sigue sin cargar. Inténtalo en un minuto." |
| Page, device offline (`navigator.onLine` is false) | Offline | The same block with "Sin conexión. Pulsa Reintentar cuando vuelva la red." | "Reintentar" | Pressing it after the network is back loads the page; nothing loads by itself |
| Forma actual | Empty (no games before the window) | "Aún no hay partidas anteriores a las últimas N para comparar." with the selector | Pick a smaller window | A smaller window with enough earlier games shows the comparison |
| Forma actual | Error (window request failed) | The last window that loaded stays visible, with "No se pudo cargar la ventana de N partidas." and "Reintentar" | "Reintentar" or pick another window | Retry repeats the request for the same window |
| Suggested-game line | Error (profile request failed) | "No se pudo cargar la partida sugerida." and "Reintentar" | "Reintentar" | Reloads the profile for the saved cut |
| Engine profile | Error | The section opens on the error block "No se pudo cargar el análisis del motor." | "Reintentar" | Same request as the suggested-game line; one retry serves both |
| Mates and threats blocks | Error versus empty | Failed: "No se pudieron cargar los mates." with "Reintentar". Empty: "Todavía no hay partidas analizadas con mates." | "Reintentar" on failure only | Retry repeats the one request |
| Partidas table | Error | "No se pudieron cargar las partidas." under the filters, with "Reintentar" beside it | "Reintentar", change a filter | Retry repeats the same page and filters |
| Game viewer | Error, temporary (timeout or 5xx) | Title "Partida"; "No se pudo cargar la partida." and "Reintentar" | "Reintentar", close | Retry repeats the request for the same game |
| Game viewer | Error, permanent (no stored moves, illegal game) | "No hay partida completa guardada para esta partida." (unchanged) | Close | None; the table row stops offering the viewer after the first time |

## Edge Case Catalog

| Scenario | Current behaviour | Recommended behaviour | Priority |
|---|---|---|---|
| Tap "Reintentar" three times during a 503 | The page's own button (`chess.html`) is never disabled; each tap calls `data.reload()` and sends the bundle request again | Replace it with the shared error block, fed with `data.isLoading()` | Major |
| Pick the window already selected in Forma actual after a failure | `recentN.set(n)` with the same value changes nothing, so no request is sent and the card stays "No disponible" | The "Reintentar" in the inventory; the selector stays as it is | Major |
| Open a game while the Worker answers 503 | Any failure becomes "No hay partida completa guardada para esta partida." (`catchError` in `match-detail-modal.ts`), which says the game does not exist | Split the two messages as in the inventory | Major |
| Same window and same cut after a profile failure | The request parameters do not change, so nothing is sent again; only a page reload recovers | Retry in the inventory re-runs the resource | Minor |
| Partidas page 3 fails | "—" in the counter, "‹ Anterior" and "Siguiente ›" disabled, no way to get page 3 back except a chip | Retry in the inventory keeps the offset | Minor |
| 20 games in total, window set to 50 | Forma actual draws nothing under the selector | The empty row in the inventory | Minor |
| Phone on the underground: the summary request times out at 10 s | 10 s of dashes, then the error block | Skeleton at once, the line at 3 s, the error at 10 s | Minor |
| The 401 interceptor sends the person to login with an ELO range typed | The range is lost | Not kept: two numbers retype in seconds [no-offline-queue, decision-log-games-register] | Cosmetic |

## Stress Test Results

- A burst of taps on "Reintentar" sends one request per tap (edge case: tap three times during a 503).
- Re-picking the selected window after a failure sends nothing (edge case: pick the window already selected).
- A 503 on a game reads as a deleted game (inventory: Game viewer, temporary error).
- A history shorter than the window leaves a blank card (inventory: Forma actual, empty).

## Resilience Recommendations

### Critical

None. No state loses data the person typed or stored.

### Major

- Page error block built on the shared error block, disabled while loading
- Forma actual retry for the chosen window
- Game viewer error split into temporary and permanent

### Minor

- Suggested-game line and engine profile retry
- Mates and threats blocks tell failure from empty
- Partidas table retry
- Forma actual empty message
- Skeleton and 3 s line on first load
- Offline message on the page error block

### Cosmetic

- ELO range after a login redirect (left as it is)

## Open Questions

Does the Back gesture on a phone close the game viewer, or leave the Ajedrez page? The viewer has no URL of its own, and `modal.ts` was not read.
