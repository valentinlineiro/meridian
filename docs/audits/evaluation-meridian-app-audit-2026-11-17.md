# Meridian web app: Hoy, Qué cambió, Ajedrez, Idiomas, LinkedIn Games, Configuración, sync, installed phone app

## Anti-Pattern Verdict
Clean. No prechecked consent, fake urgency, confirmshaming, roach motel, nagging or engagement notifications. The service worker never stores `/api/*` or the login page, a 401 returns to the same page after login, and there is no third-party analytics. The defects that remain are Missing Feedback and Broken Error Recovery, which the project's context treats as defects.

## Priority Issues

### Critical
None. Every core task completes: read today's state, log or correct a result, sync, check chess form, open a game.

### Major

**A tab left open across a deploy cannot open a new section, and says nothing.**
Where: `app.routes.ts` loads every section lazily (`chunk-*.js`); `app.config.ts` has no navigation error handler; `web/public/sw.js` drops the previous build's cached files when a new index arrives; continuous deploy ships every green push to main (five merges on 2026-11-17).
Why it matters: the installed phone app stays alive in the background for days. After a deploy, tapping a section whose code was not yet loaded asks for a file that no longer exists, the navigation fails and the screen stays as it was. Nothing is shown, so the owner taps again, then concludes the app is broken. Reloading fixes it, and nothing says so.
Heuristic: visibility of system status.
Change: when a section's code fails to load, say "Hay una versión nueva de Meridian" with one "Recargar" button, or reload at the address that was tapped.
Evidence: read from code; not reproduced in a browser.

### Minor

**Offline reads as a failure of the app, except in Ajedrez.**
Where: Hoy ("Algunas secciones no cargaron."), Games ("No pudimos cargar tus juegos."), Idiomas, Qué cambió. Only Ajedrez and the register sheet check `navigator.onLine` and say "Sin conexión". The service worker deliberately opens the app offline, so this is the state the owner meets on a commute.
Heuristic: help users recognize, diagnose and recover from errors.
Change: the shared error block says "Sin conexión. Vuelve a intentarlo cuando tengas red." when the browser is offline, as Ajedrez already does.

**Text fields on a phone are 13 px, which makes an iPhone zoom the page when one is focused.**
Where: `styles.css` sets inputs to `--fs-md` (13 px). Affected: the time fields in the register sheet, the rival search and ELO bounds in Ajedrez, the goal field in Configuración. The app declares itself an iOS home-screen app.
Why it matters: the zoom is not undone when the keyboard closes, so the page stays enlarged and drifts sideways while the owner types the daily times.
Heuristic: flexibility and efficiency of use.
Change: 16 px for inputs and selects under 760 px.
Evidence: from the stylesheet; which phone the owner uses is not known.

**The chess cut-off asks for a game id copied from the address bar.**
Where: Ajedrez, engine profile, "Antes y después de un corte": "Pega el id de la última partida de antes (lo ves en la URL del visor)".
Heuristic: recognition rather than recall.
Change: a "Usar como corte" action inside the game viewer that fills the field.

**The page that follows a sync is not kept.**
Where: `sync.service.ts` reloads the page 800 ms after "✓ Sincronizado", dropping scroll position, open sections, a filtered match list and an open game viewer.
Heuristic: user control and freedom.
Change: refresh the visible resources in place; until then, say "La página se recargará" in the completion note.

**Some information is reachable only by hover.**
Where: the loss-map help ("Pasa el ratón por encima…") and cell `title` text in "Dónde pierdes", the difficulty calendar, the result bars and the engine trend columns in Ajedrez.
Heuristic: flexibility and efficiency of use.
Change: tapping a cell or bar shows its detail below the chart, and the help is worded for touch.

**The same destination has different names.**
Where: Qué cambió (navigation, tab title) against "¿Qué ha cambiado?" (h1); "Games" (phone tab) against "LinkedIn Games" (sidebar, titles); in Ajedrez the "Evolución" jump button, the "Evolución · ELO" card and the "Evolución y detalle" section, with the jump landing on the last one.
Heuristic: consistency and standards.
Change: one name per destination; name jump targets after their content.

**Ajedrez stacks many things on one scroll.**
Where: hero, patterns card, jump index, KPIs, evolution, form, three collapsed sections, engine profile, match table, methodology. The win rate appears in the hero (last 50) and again in "Forma actual" (default 50).
Heuristic: aesthetic and minimalist design.
Change: the hero carries the win rate; "Forma actual" shows only what the hero does not, before against now.

**The Configuración save error can read "No se pudo guardar: 200".**
Where: `settings.ts`, when the server answers without `ok` and without an error string.
Heuristic: help users recognize, diagnose and recover from errors.
Change: "No se pudo guardar. Inténtalo de nuevo."

### Cosmetic

**Four screens open on a hero card with no visible title.** Ajedrez, Idiomas, Games and Configuración carry an `h1` for assistive technology only; Hoy and Qué cambió show theirs. The navigation marks the section, so orientation holds and the pattern is uneven.

**Labels are 11 px.** KPI captions, section groups in the sidebar, pills and scope tags use the smallest size in uppercase; contrast is fine (muted text 5.7 to 6.9 against its backgrounds), size is the limit.

## Heuristic Verdicts
- Visibility of system status: broken. A tab left open across a deploy cannot open a new section, and says nothing.
- Match between system and real world: holds.
- User control and freedom: strained. The page that follows a sync is not kept.
- Consistency and standards: strained. The same destination has different names.
- Error prevention: holds. The register sheet keeps a draft across an accidental dismiss and Configuración refuses to save when its load failed.
- Recognition rather than recall: strained. The chess cut-off asks for a game id copied from the address bar.
- Flexibility and efficiency of use: strained. Some information is reachable only by hover.
- Aesthetic and minimalist design: strained. Ajedrez stacks many things on one scroll.
- Help users recognize, diagnose and recover from errors: strained. Offline reads as a failure of the app, except in Ajedrez.
- Help and documentation: holds.

## Cognitive Walkthrough Results

Task: open Idiomas from the installed phone app left open since yesterday.

| Step | Motivation | Visibility | Understanding | Feedback | Rating | Finding |
|---|---|---|---|---|---|---|
| Tap "Idiomas" in the tab bar | yes | yes | yes | no | Hesitation | A tab left open across a deploy cannot open a new section, and says nothing |

Task: read Hoy on a train with no signal.

| Step | Motivation | Visibility | Understanding | Feedback | Rating | Finding |
|---|---|---|---|---|---|---|
| Open the installed app | yes | yes | yes | yes | Pass | — |
| Read why the cards are empty | yes | yes | no | yes | Hesitation | Offline reads as a failure of the app, except in Ajedrez |

Task: keep your place after a manual sync.

| Step | Motivation | Visibility | Understanding | Feedback | Rating | Finding |
|---|---|---|---|---|---|---|
| Return to the open match list or game | yes | n/a | n/a | no | Hesitation | The page that follows a sync is not kept |

## Positive Findings
- Failure handling is one system: the same error block, one manual retry that cannot be sent twice at once, no automatic retry that could feed the 2026-11-11 overload.
- The offline shell is built for privacy: private data and the login page are never cached, and a redirected response is never stored as the shell.
- The register sheet takes the daily entry in one sitting, removes a stored result on request and keeps a draft.
- The modal shell traps Tab, closes on Escape and returns focus to what opened it; Back closes only the viewer or sheet.
- Navigation basics hold: skip link, focus on the new heading, `aria-current`, a real 404 that keeps the address, titles per section, period in the URL.
- Honest numbers: findings state their window, unknown is never zero, every chart has an equivalent table or text.
- Phone ergonomics: 44 px targets on row buttons and links, safe-area padding, input borders at 3.7:1, smooth scrolling switched off for reduced motion.

## Recommended Actions
1. A tab left open across a deploy cannot open a new section, and says nothing
2. Offline reads as a failure of the app, except in Ajedrez
3. Text fields on a phone are 13 px, which makes an iPhone zoom the page when one is focused
4. Some information is reachable only by hover
5. The page that follows a sync is not kept
6. The same destination has different names
7. The chess cut-off asks for a game id copied from the address bar
8. Ajedrez stacks many things on one scroll
9. The Configuración save error can read "No se pudo guardar: 200"
10. Four screens open on a hero card with no visible title
11. Labels are 11 px
