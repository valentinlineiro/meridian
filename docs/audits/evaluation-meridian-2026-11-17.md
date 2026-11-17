# Meridian web app after the Games register and chess builds: Hoy, Qué cambió, Ajedrez, Idiomas, LinkedIn Games, Configuración

## Anti-Pattern Verdict
Clean. No prechecked consent, fake urgency, confirmshaming, roach motel or engagement nagging. Streaks are information with no reminder or penalty, a losing chess run has no flame, and missing data says "No disponible" or names the failure instead of showing a zero. Missing Feedback, Dead Ends and Broken Error Recovery, which the context treats as defects, were the live ones on 2026-11-16 and are closed on Hoy, Games, Qué cambió and Ajedrez.

## Priority Issues

### Critical
None. Every core task completes: read today's state, log or correct a result, sync, check chess form, open a game.

### Major
None. The two major findings of 2026-11-16 are closed: a stored result is removed from the register sheet ("Se quitará al guardar"), and Hoy, Games, Qué cambió and Ajedrez fail into the shared error block with one manual retry [evaluation-meridian-web-app-2026-11-16] [pr 207] [pr 209].

### Minor

**The sync hint leaves chess out.**
Where: phone tab bar and side nav, "Fuentes conectadas (Duolingo) · Games manual". Chess is the section used most and arrives through the same sync.
Why it matters: the person cannot tell from the sync control that Ajedrez is refreshed too, or how stale it can be.
Heuristic: visibility of system status.
Change: name each domain by how it updates: "Ajedrez e Idiomas se sincronizan · Games es manual".

**The Idiomas empty state points to a path the app no longer shows.**
Where: `languages.html`, "Sin datos de Languages — sincroniza con la extensión." The visible way is the "Sincronizar" button, and the rest of the app writes "Idiomas".
Heuristic: help and documentation, consistency and standards.
Change: "Aún no hay datos de Idiomas. Pulsa Sincronizar para traerlos.", the pattern chess already follows.

**The Idiomas course hero is wider than a 320 px screen.**
Where: Idiomas, "Curso seleccionado" card. At 320 px the page scrolls sideways (376 px wide); at 375 px it overflows by 1 px. The cause is a long course label ("Demo Alpha · EN → XA (14…") on one line.
Why it matters: a sideways page on the smallest phones hides the end of the label and makes the whole page drift under the thumb.
Heuristic: aesthetic and minimalist design, flexibility and efficiency of use.
Change: let the course label wrap or truncate inside the card, and keep the page at the viewport width.

**Qué cambió writes every time in UTC.**
Where: the window header ("Desde tu última visita (2026-11-16 14:05 UTC)") and the quiet message ("Sin actividad registrada de ajedrez ni idiomas entre … UTC y … UTC"). The endpoint path in its error is gone.
Heuristic: match between system and real world.
Change: show the owner's local date and time ("hoy 15:05", "ayer 22:10") in both places.

**Some information is reachable only by hover.**
Where: the loss-map help ("Pasa el ratón por encima…"), per-cell `title` text in the loss map and the difficulty calendar, result-bar `title`s in Ajedrez.
Heuristic: flexibility and efficiency of use, help and documentation.
Change: tap a cell to show its detail below the table, and word the help for touch.

**The same destination has different names.**
Where: Qué cambió (nav, tab title) against "¿Qué ha cambiado?" (h1); "Games" (phone tab) against "LinkedIn Games" (sidebar, titles); in Ajedrez, the "Evolución" jump button, the "Evolución · ELO" card and the "Evolución y detalle" section, with the jump landing on the last one.
Heuristic: consistency and standards.
Change: one name per destination, and name jump targets after their content.

**Ajedrez stacks many things on one scroll.**
Where: hero, patterns card, jump index, KPIs, evolution, form, three collapsed sections, engine profile, the match table and the methodology. The win rate is in the hero (last 50) and again in "Forma actual" (default 50).
Heuristic: aesthetic and minimalist design.
Change: the hero carries the win rate and "Forma actual" shows only what the hero does not (before against now); the collapsed sections stay.

**Manual sync ends with a full page reload.**
Where: `sync.service.ts` reloads 800 ms after "✓ Sincronizado", dropping scroll position, open sections and, now, an open game viewer or filtered list.
Heuristic: user control and freedom.
Change: refresh the visible resources in place; until then say the page is about to refresh.

### Cosmetic

**The Configuración save error can read "No se pudo guardar: 200".** When the server answers without `ok` and without an `error` string, the fallback prints the status number. Say "No se pudo guardar. Inténtalo de nuevo."

**Four of six screens hide their h1.** Ajedrez, Idiomas, Games and Configuración show a hero card instead of a title; Hoy and Qué cambió show it. The nav marks the section, so orientation holds, and the pattern is uneven.

## Heuristic Verdicts
- Visibility of system status: strained. The sync hint leaves chess out.
- Match between system and real world: strained. Qué cambió writes every time in UTC.
- User control and freedom: strained. Manual sync ends with a full page reload.
- Consistency and standards: strained. The same destination has different names.
- Error prevention: holds. The register sheet keeps a draft across an accidental dismiss.
- Recognition rather than recall: holds.
- Flexibility and efficiency of use: strained. Some information is reachable only by hover.
- Aesthetic and minimalist design: strained. Ajedrez stacks many things on one scroll, and the Idiomas hero is wider than a 320 px screen.
- Help users recognize, diagnose and recover from errors: holds. Every load that can fail says what failed and offers one manual retry that cannot be sent twice at once.
- Help and documentation: strained. The Idiomas empty state points to a path the app no longer shows.

## Cognitive Walkthrough Results

Task: log today's LinkedIn Games result from Hoy on a phone.

| Step | Motivation | Visibility | Understanding | Feedback | Rating | Finding |
|---|---|---|---|---|---|---|
| Find where to log | yes | yes | yes | yes | Pass | — |

Task: read the state of Ajedrez, Idiomas and Games after a sync.

| Step | Motivation | Visibility | Understanding | Feedback | Rating | Finding |
|---|---|---|---|---|---|---|
| Learn from the sync control what gets refreshed | yes | no | no | yes | Failure | The sync hint leaves chess out |
| Keep your place after the sync | yes | n/a | n/a | no | Hesitation | Manual sync ends with a full page reload |

## Positive Findings
- Failure handling is one system: the same error block, the same manual retry, a disabled button while it runs, polite status on cards and assertive on the page, and no automatic retry that could feed the 2026-11-11 overload.
- The register sheet takes the daily entry in one sitting: it removes a stored result on request, keeps a draft, and opens from Hoy.
- Chess finds a game from a number: all eight endings, one apply rule for the filters, the ending on phone cards, and a viewer where Back closes only the viewer.
- Navigation basics hold: skip link, focus on the new page heading, `aria-current`, a phone "Más" sheet whose Back closes only the sheet, a real 404 that keeps the address, and the period in the URL.
- Honest numbers: findings state their window, unknown is never zero, and charts have an equivalent table or text.
- Settings refuses to save when its load failed, so an empty field cannot erase the stored goal.
- Every screen loads on a 375 px phone without a console error and with no touch target under 40 px except the 28 px brand link.

## Recommended Actions
1. The sync hint leaves chess out
2. The Idiomas empty state points to a path the app no longer shows
3. The Idiomas course hero is wider than a 320 px screen
4. Some information is reachable only by hover
5. Qué cambió writes every time in UTC
6. The same destination has different names
7. Manual sync ends with a full page reload
8. Ajedrez stacks many things on one scroll
9. The Configuración save error can read "No se pudo guardar: 200"
10. Four of six screens hide their h1
