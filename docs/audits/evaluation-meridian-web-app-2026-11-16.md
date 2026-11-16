# Meridian web app (Angular SPA): Hoy, Qué cambió, Ajedrez, Idiomas, LinkedIn Games, Configuración

## Anti-Pattern Verdict
Clean. No prechecked consent, fake urgency, confirmshaming, roach motel or engagement nagging. Streaks (Idiomas, Games) are shown as information, with no notification or penalty mechanic. Missing data shows "No disponible" instead of a zero, which is the opposite of a dark pattern.

## Priority Issues

### Critical
None. Every core task (read today's state, log a result, sync, check chess form) completes.

### Major

**A game result cannot be removed from the register dialog.**
Where: Games, "Registrar hoy" / "Editar lo de hoy" (`games-register.ts`). Empty rows are skipped (`filled()` keeps only rows with a time) and Guardar is disabled when every row is empty. The copy says "Deja vacío el que no hayas jugado", which reads as "clearing a row clears the entry".
Why it matters: a result typed on the wrong game or day stays in the data, and it feeds the verdicts, the loss map and the adjusted form. The person editing sees nothing happen and has no hint why.
Heuristic: user control and freedom.
Change: let clearing a previously stored row delete it (with a one-line "Se quitará X" in the dialog), or add an explicit "Quitar" per row.

**Hoy, Games and Qué cambió fail with a bare "No disponible" and no way to retry.**
Where: Hoy (every row), Games, Qué cambió (`Evaluaciones`, `Actividad`) and the game report. Only Ajedrez and Idiomas offer "Reintentar" in an error box. On the phone, where the person mostly is, a transient D1/Worker 503 leaves a page of dashes until a manual reload.
Why it matters: the D1 overload incidents (503s) are exactly the case this covers. The state is honest, but it is a dead end.
Heuristic: help users recognize, diagnose and recover from errors.
Change: one shared error block (what failed in plain words, "Reintentar") used on every screen, as Ajedrez and Idiomas already do.

### Minor

**Qué cambió shows developer text and UTC times.**
Where: `ERR_HTTP` = "Error al cargar cambios (/api/what-changed)." and the window header "Desde tu última visita (2026-11-16 14:05 UTC)". Spanish readers get an endpoint path in an error and timestamps in UTC instead of their local time.
Heuristic: match between system and real world.
Change: drop the path from the message; show local date and time ("hoy 15:05", "ayer 22:10").

**The Languages empty state points to a path the app no longer shows.**
Where: `languages.html:6`, "Sin datos de Languages — sincroniza con la extensión." The visible way to sync is the "Sincronizar" button, and the rest of the app writes "Idiomas".
Heuristic: help and documentation, consistency and standards.
Change: "Aún no hay datos de Idiomas. Pulsa Sincronizar para traerlos." (same pattern #206 applied to chess).

**The sync hint leaves chess out.**
Where: sync button tooltip and hint, "Fuentes conectadas (Duolingo) · Games manual". Chess is the section the person uses most, and chess data arrives through the same sync, but the hint names only Duolingo and Games.
Heuristic: visibility of system status, match with the real world.
Change: say what each domain's freshness depends on ("Ajedrez e Idiomas se sincronizan; Games es manual").

**The register dialog discards typed times on an accidental dismiss.**
Where: `<dialog closedby="any">` plus `open()` resetting rows from the stored day. On the phone bottom sheet one stray tap outside, or Escape, drops up to six entries with no warning.
Heuristic: error prevention.
Change: dismiss on outside tap only when nothing was typed; otherwise keep the draft or ask once.

**The daily action takes three taps from Hoy.**
Where: Hoy → LinkedIn Games → "Registrar hoy". Hoy answers "how am I doing" for each domain but offers no action; the one recurring manual task is two screens away.
Heuristic: flexibility and efficiency of use.
Change: on the Games row of Hoy, a "Registrar hoy" / "Editar lo de hoy" button next to the verdict, opening the same dialog.

**The same thing has different names.**
Where: Qué cambió (nav, tab title) vs "¿Qué ha cambiado?" (h1); "Games" (phone tab) vs "LinkedIn Games" (sidebar, titles); in Ajedrez, "Evolución" is the jump button, the "Evolución · ELO" card and the "Evolución y detalle" section, and the jump button lands on the last one.
Heuristic: consistency and standards.
Change: one name per destination, and name the jump targets after their content ("Resultados y ELO del rival").

**Hover is the only way to reach some information on a phone.**
Where: the loss-map help says "Pasa el ratón por encima…"; per-cell `title` text in the loss map and difficulty calendar; result bar `title`s in Ajedrez.
Heuristic: flexibility and efficiency, help and documentation.
Change: tap to reveal the cell detail (or print it below the table), and word the help for touch.

**Ajedrez stacks many things on one scroll.**
Where: hero, patterns card, jump index, KPIs, evolution, form, three collapsed sections, engine profile, the full match table and the methodology. The win rate appears in the hero (last 50) and again in "Forma actual" (default 50).
Heuristic: aesthetic and minimalist design.
Change: let the hero carry the win rate and have "Forma actual" show only what the hero does not (before vs now); keep the collapsed sections as they are.

**Manual sync ends with a full page reload.**
Where: `sync.service.ts` reloads 800 ms after "✓ Sincronizado". It is deliberate (partial refreshes left stale data), but it drops scroll position, open sections and a half-filled form.
Heuristic: user control and freedom.
Change: keep the reload only if a re-fetch cannot be made reliable; otherwise refresh the visible resources in place. Until then, tell the person the page is about to refresh.

### Cosmetic

**The save error in Configuración can read "No se pudo guardar: 200".** When the server answers without `ok` and without an `error` string, the fallback prints the status number. Replace with "No se pudo guardar. Inténtalo de nuevo."

**Five of six screens hide their h1 (`sr-only`) while Hoy and Qué cambió show it.** Sighted users get a hero card instead of a title on Ajedrez, Idiomas, Games and Configuración. Fine for orientation (the nav marks the section), but the pattern is uneven.

## Heuristic Verdicts
- Visibility of system status: strained. The sync hint leaves chess out.
- Match between system and real world: strained. Qué cambió shows an endpoint path and UTC times.
- User control and freedom: broken. A game result cannot be removed from the register dialog.
- Consistency and standards: strained. The same destination has several names.
- Error prevention: strained. The register dialog discards typed times on an accidental dismiss.
- Recognition rather than recall: holds.
- Flexibility and efficiency of use: strained. The daily action takes three taps from Hoy.
- Aesthetic and minimalist design: strained. Ajedrez stacks many things on one scroll.
- Help users recognize, diagnose and recover from errors: broken. Hoy, Games and Qué cambió fail with no retry.
- Help and documentation: strained. The Languages empty state points to a path the app no longer shows.

## Cognitive Walkthrough Results

Task: log today's LinkedIn Games result from Hoy on a phone.

| Step | Motivation | Visibility | Understanding | Feedback | Rating | Finding |
|---|---|---|---|---|---|---|
| Find where to log | yes | no | yes | yes | Hesitation | The daily action takes three taps from Hoy |
| Leave a wrongly typed game blank to remove it | yes | yes | no | no | Failure | A game result cannot be removed from the register dialog |
| Tap outside while typing | yes | n/a | n/a | no | Hesitation | The register dialog discards typed times on an accidental dismiss |

Task: recover after a failed load on Hoy.

| Step | Motivation | Visibility | Understanding | Feedback | Rating | Finding |
|---|---|---|---|---|---|---|
| Notice a row says "No disponible" | yes | yes | no | no | Hesitation | Hoy, Games and Qué cambió fail with no retry |
| Retry | yes | no | n/a | n/a | Failure | Hoy, Games and Qué cambió fail with no retry |

## Positive Findings
- Honest degradation: every request fails on its own into "No disponible", never into a zero or an empty chart.
- Navigation basics are done: skip link, focus moved to the new h1, `aria-current`, a phone "Más" sheet with a focus trap whose system Back closes only the sheet, and a real 404 page that keeps the address.
- Sync survives leaving the page (run id stored, resumed on return), separates "failed" from "collector unavailable", and says the daily run is unaffected.
- "¿Cómo sabemos esto?" and the "Cómo leerlo" blocks explain the numbers in the person's terms, and charts have an equivalent data table.
- Settings guards against the silent-delete case: a failed load disables Guardar so an empty field cannot erase the stored goal.
- Legacy URLs and `/trajectory` land on the right place, and the period lives in the URL (`?w=`), so Back and shared links work.

## Recommended Actions
1. A game result cannot be removed from the register dialog
2. Hoy, Games and Qué cambió fail with no retry
3. The register dialog discards typed times on an accidental dismiss
4. The daily action takes three taps from Hoy
5. The Languages empty state points to a path the app no longer shows
6. The sync hint leaves chess out
7. Qué cambió shows developer text and UTC times
8. Hover is the only way to reach some information on a phone
9. The same thing has different names
10. Ajedrez stacks many things on one scroll
11. Manual sync ends with a full page reload
