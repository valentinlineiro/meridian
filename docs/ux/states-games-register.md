## State Inventory

Scope: the register sheet for LinkedIn Games (as designed in `journey-games-register.html`) and the "No disponible" dead ends on Hoy, Games and Qué cambió. The journey already draws: clean, edited, row marked for removal, row error, saving, saved, nothing changed, save failed. Rows below are the states it does not.

| # | Where | State | What the user sees | What they can do | Recovery |
|---|---|---|---|---|---|
| S1 | Sheet | Stored day could not be read (the `day` request failed; rows start empty today) | Rows empty, with a line above them: "No pudimos leer lo guardado de hoy. Lo que escribas se añadirá o cambiará; no se borra nada." | Type and save as usual; removal hints are off | "Volver a leer" re-requests the day and fills the rows, keeping anything already typed |
| S2 | Sheet | Guardar disabled because every row is empty | Guardar greyed, with "Escribe al menos un tiempo" under it | Type a time | Enabled by the first valid-looking time |
| S3 | Sheet | Save timed out or no connection (request error with no answer) | "No sabemos si se guardó. Tus tiempos siguen aquí; pulsa Guardar otra vez, no se duplica." | Guardar again, or Cerrar (the unsaved bar applies) | The server treats a repeat of the same text as "sin cambios", so a second save is safe |
| S4 | Sheet | Saved, but the page refresh failed | Sheet closes; the page's status line says "Guardado. No pudimos actualizar esta página." with Reintentar | Reintentar | Re-requests the summary only |
| S5 | Sheet | Session ended while open (401) | Today the browser jumps to login and the typed times are gone. Target: after login the user lands back on the page, the sheet reopens, and the times are back (see R2) | Sign in | Draft restored |
| S6 | Sheet | Midnight passed while open | Title still shows yesterday's date; the save goes to the new day | Nothing today | Target: on save, if the date differs from the title, ask: "Ya es [nuevo día]. ¿Guardar en [nuevo día] o en [día del título]?" |
| S7 | Sheet | Another device saved today after this sheet opened | Rows show old stored values | Save overwrites only the games typed here | Target: show nothing extra; the result note says what changed, which reveals a surprise. Low frequency (single owner) |
| S8 | Hoy | Loading | Today dashes ("—") that look like empty data | Wait | Target: skeleton blocks per row, replaced by values or "No disponible" |
| S9 | Hoy | One domain unavailable | Row shows "No disponible" | Nothing | One "Reintentar" under the rows when any row is unavailable. One request in flight at a time, disabled while loading |
| S10 | Games, Qué cambió | Section unavailable | Bare "No disponible" | Nothing | Same block as S9: what failed in words ("No pudimos cargar tus juegos") + Reintentar |
| S11 | Hoy | A Games row whose button cannot prefill (day unavailable) | Button reads "Registrar hoy" | Opens the sheet in state S1 | As S1 |

## Edge Case Catalog

| # | Category | Scenario | Current behaviour | Recommended | Priority |
|---|---|---|---|---|---|
| E1 | Content | Typing "1:06" on a numeric phone keyboard (`inputmode="numeric"`) | Most numeric keypads have no colon. The parser accepts plain digits as **seconds** (`^\d{1,4}$`), so "106" is stored as 106 seconds (1:46) with no error | In the sheet, mask as you type (digits become `m:ss`: "106" shows "1:06") and print the reading under the field ("1:06"). Keep the server rule for pasted text | Critical |
| E2 | Content | Seconds above 59 or malformed ("1:6", "1:75", "abc") | Row error from the server, after tapping Guardar | Validate on blur with the same message; keep the server error as backstop | Minor |
| E3 | Content | Pasted text with spaces, NBSP or a trailing unit ("0:48 s") into one field | Server rejects the row, message is the parser's | Strip spaces and NBSP on input; unit text keeps the row error | Minor |
| E4 | Content | A time that is plausible in format but not in value (0:01, 9999 s) | Accepted | Do not block; show the reading under the field, and ask nothing | Cosmetic |
| E5 | Volume | Six games all filled and all with averages | Fits | Check the 320px layout (three columns plus error text) wraps, with Guardar pinned | Minor |
| E6 | Time | Request takes more than 10 s (client timeout) | Generic "No se pudo guardar." though the write may have landed | State S3 | Major |
| E7 | Time | Session expires with the sheet open | Redirect to login, draft lost | R2 | Major |
| E8 | Network | Offline in the installed app | Same generic message as E6 | S3 wording, plus "Sin conexión" when `navigator.onLine` is false. No offline queue: the data is a handful of times, retyping costs seconds, and a queue would need conflict rules | Minor |
| E9 | Device | Virtual keyboard open on a phone | Guardar can sit under the keyboard | Pin the save row to the bottom of the sheet; the focused field scrolls into view above it | Major |
| E10 | Device | 200% zoom or 320px width | Not verified in the source | Sheet scrolls inside itself; nothing hidden behind the Cerrar button | Minor |
| E11 | User behaviour | Double tap on Guardar | Disabled while saving, so safe | Keep | — |
| E12 | User behaviour | Back button / system Back with the sheet open | The sheet is a native `<dialog>`; Back leaves the page and drops the draft | Treat Back like Cerrar (same unsaved bar), as the Más sheet already does | Minor |
| E13 | User behaviour | Two tabs with the sheet open | Last save wins per game; no conflict notice | Accept (single owner); S7 | Cosmetic |
| E14 | Server | Removing a game | **No delete path exists.** The import only adds or changes ("the text wins for the games it mentions; the rest is kept"), and the per-game endpoint takes a score | Needs a new command that appends a version without the game (versions are append-only, so history stays) before the removal hint can ship | Critical (blocks the journey) |

## Stress Test Results

Failures only.

- E1: the numeric keypad makes the most common time ("1:06") impossible to type, and the nearest thing that is accepted ("106") is a wrong value that passes validation. Silent data corruption feeding the verdicts.
- E14: removal as designed cannot work on today's server.
- E6 and E7: both lose the user's input, and E6 tells them the write failed when it may not have.
- S6 (midnight): the dialog's title and the save target can disagree.
- S8: loading and unavailable look alike (dashes on Hoy versus "No disponible" later), so a slow load reads as missing data.

Not settled by reading the code (open questions): how the sheet lays out at 320px and with the keyboard open (E9, E10); whether `<dialog closedby="any">` behaves the same in the installed iOS app as in a browser tab.

## Resilience Recommendations

**Critical**
- E1: input mask and echoed reading for times in the sheet.
- E14: a server command to remove a game from a day (a new version without it), before the removal hint ships.

**Major**
- E6 / S3: timeout and offline say "No sabemos si se guardó" and keep the values; repeat save is safe.
- E7 / S5 (R2): keep the draft in `sessionStorage`, keyed by date, wrapped in try/catch; restore on reopen; clear on save or Descartar. Covers a 401 redirect and an accidental reload.
- E9: pinned save row above the keyboard.
- S9 / S10: one shared error block with Reintentar. No automatic retries: the D1 overload incident showed a retry storm is worse than a dead end, so the retry is manual, one at a time, disabled while loading.

**Minor**
- S1 / S11: the "no pudimos leer lo guardado" line.
- S2: say why Guardar is off.
- S4: say the save worked even when the refresh did not.
- S6: midnight rollover question on save.
- S8: skeletons on Hoy.
- E2, E3, E5, E10, E12.

**Cosmetic**
- E4, E13, S7.

The error and empty wording is for /articulate; the removal command is for /blueprint; the 320px and keyboard behaviour needs a check on a real phone (/include).
