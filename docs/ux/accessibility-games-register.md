## Accessibility Audit — Per WCAG Principle

Method: styles and templates read, contrast computed from the tokens in `styles.css`. Nothing was run in a browser or with a screen reader, so every "test" below is what to do to confirm the fix, and the findings about behaviour (focus, announcements) come from reading the code and the platform's `<dialog>` defaults. The app has a single dark theme.

### Perceivable

**Time fields have no visible boundary (1.4.11 Non-text contrast).**
The fields are the whole point of the sheet. Their border is `--line-strong` (#2a3d56) on `--surface` (#131f33): 1.49:1, and their `--sunken` fill barely differs from the surface. Someone with low vision, or on a phone in sunlight, cannot find where to tap.
Change: border `--sq-dark` (#5b7a9e), 3.7:1 on the surface and 3.9:1 on the field fill. The input rule is global (`styles.css:60`), so this also fixes Settings and the course picker.
Done when: a contrast checker reads at least 3:1 between the field border and the card behind it, on Hoy-sheet, Games sheet and Configuración.

**Disabled primary buttons look enabled (1.4.1 Use of color, 3.3.2 Labels or instructions).**
Only `.btn-g` has a disabled style (`opacity:.5`). Guardar in the sheet with every row blank, Sincronizar while a run is going, and Guardar in Configuración look identical to their enabled selves. The person taps and nothing happens.
Change: give `.btn-p:disabled` the same dimming and `cursor:default`, and add the visible reason under the button ("Escribe al menos un tiempo"), linked with `aria-describedby`.
Done when: with all rows blank, Guardar is visibly dimmed, VoiceOver/NVDA announce it as dimmed or unavailable, and its description is read.

**Primary button text drops below 4.5:1 on hover (1.4.3 Contrast).**
White on `--accent` is 4.63:1, but `--accent-hover` (#2a7bff) lightens the fill and white on it is 3.91:1, at 13px bold. Mostly seen on desktop with a pointer.
Change: hover goes darker than the base blue, not lighter.
Done when: white text on the hover fill is at least 4.5:1.

**"Se quitará al guardar" must not rely on dimming or strikethrough alone (1.4.1).**
This is a new state from the journey. If a removed row is only greyed out, colour-blind and low-vision users cannot tell it from an empty one.
Change: the words are the signal, as designed; add a "Quitar" glyph or label in the row, not only a style change.
Done when: the row is distinguishable in a greyscale screenshot.

### Operable

**The sheet opens with focus on "Cerrar", not on the first field (2.4.3 Focus order).**
`showModal()` focuses the first focusable element, which is the Cerrar button in the header. A screen reader user hears "Cerrar" and then has to move forward to reach the first time; the journey promised the first empty time field.
Change: mark that input `autofocus` (works inside `<dialog>`) or focus it right after `showModal()`. On a phone this raises the keyboard at once, which is wanted here because the next action is typing; the pinned Guardar row keeps the button reachable.
Done when: opening the sheet announces "Zip: tu tiempo" (or the first empty game) and, with a keyboard, typing starts immediately.

**Escape and system Back must run the same unsaved-changes check as Cerrar (2.1.2, 3.3.4 Error prevention).**
A native `<dialog>` closes itself on Escape and `closedby="any"` also closes on a backdrop tap. Hooking only Cerrar leaves the other two paths throwing the draft away.
Change: listen to the dialog's `cancel` event and call `preventDefault()` when the sheet is dirty, showing the bar; set `closedby="closerequest"` so the backdrop does nothing. Treat Back as in the Más sheet (push a history entry while open).
Done when: with a typed time, Escape, a backdrop tap and Back each show "Tienes cambios sin guardar." with focus on "Seguir editando"; with a clean sheet, each closes it.

**Cerrar is small and far from the thumb (2.5.8 Target size, best practice).**
It is a `.btn` at 13px text: about 36px tall. That passes the 24px minimum but is the only way out of a bottom sheet that takes up to 90% of the screen.
Change: 44px minimum height for Cerrar and for the new "Registrar hoy" button on Hoy, with at least 8px between the button and the card's link area.
Done when: the tappable area measures at least 44×44 CSS px.

### Understandable

**Row errors are not tied to their fields (3.3.1 Error identification, 3.3.3 Error suggestion, 4.1.3 Status messages).**
After a failed save each message is a `role="alert"` div, but the input has no `aria-invalid` or `aria-describedby`, and focus stays on Guardar. With two bad rows a screen reader reads two alerts back to back and the user must hunt for which field each belongs to.
Change: on failure, set `aria-invalid="true"` and `aria-describedby` to the row's error id, announce one summary in the existing status line ("2 tiempos no se entienden"), and move focus to the first invalid field. Clear both on edit.
Done when: after a bad save, focus is on the first bad input and the screen reader reads its name, "no válido" and the reason; fixing it removes the attribute.

**The time format lives only in a placeholder (3.3.2).**
"mm:ss" disappears when typing starts, and the column headers are `aria-hidden`, so non-visual users never hear the format or the "Tu tiempo / Media" distinction beyond the field's own name.
Change: point every field's `aria-describedby` at the intro line, which states the format ("Escribe el tiempo como m:ss, por ejemplo 1:06"). The echoed reading from the fortify work ("1:06") is also in the description and is spoken when the field loses focus, not on every keystroke.
Done when: focusing a field reads its name, then the format sentence.

**The time mask must not fight assistive technology (3.3.2, 2.5.3 Label in name).**
The mask recommended against the numeric-keypad problem changes the field's text while the user types, which is where caret jumps and repeated announcements come from.
Change: keep the caret at the end after each digit; Backspace removes a digit, not the colon; paste of "1:06" and of "106" both produce "1:06"; dictation results ("uno cero seis" → "106" or "1:06") go through the same path; no live announcement per keystroke.
Done when: typing, pasting and dictating the same time on a phone leave "1:06", with VoiceOver and TalkBack announcing nothing extra while typing.

**The six "Deshacer" buttons are indistinguishable (2.4.6, 2.5.3).**
Each removal hint will have the same visible word. A voice-control user saying "Pulsar Deshacer" is offered six numbered choices; a screen reader's button list reads "Deshacer" six times.
Change: accessible name "Deshacer: quitar Zip" (visible text "Deshacer" stays inside the name).
Done when: the button list shows one distinct name per game.

**Domains on Hoy are bold text, not headings (1.3.1 Info and relationships).**
Each card's title is a `<b>` inside a link. Heading navigation on Hoy lists only "Hoy". Link names are the whole card (title, verdict, chip, number, sentence), which is a long string to hear.
Change: make each title an `h2`; name the link from it (`aria-labelledby`) and describe it with the sentence line (`aria-describedby`); the "Registrar hoy" button sits beside the link, not inside it.
Done when: the headings list shows Ajedrez, Idiomas, LinkedIn Games, and the links list reads "Ajedrez", "Idiomas", "LinkedIn Games".

**Small fixed type and a single dark theme (best practice).**
Error text in the sheet is 12px, pills 11px, and everything is in `px` so the browser's default text size is ignored (zoom still works). There is no light theme and no `prefers-color-scheme` handling. Glare outdoors, or a low-vision reader who needs a light page, has no way to get one.
Change: row errors and hints at 14px, sizes in `rem`, and a light token set behind `prefers-color-scheme`. The rest can wait; the errors cannot.
Done when: the sheet's error text is 14px and scales with the browser's default size setting.

### Robust

**A save from Hoy would be silent (4.1.3 Status messages).**
On Games, the result sits in `#gamesNote` (`role="status"`). Hoy has no such region, so after saving from there nothing is announced and the row changes without a word.
Change: one persistent `role="status"` region on Hoy, filled with the result note ("Guardado: Zip 0:48."), present in the DOM before the save.
Done when: saving from Hoy makes the screen reader say what was saved, without moving focus.

**Automated checks skip the sheet (robustness of the regression net).**
`tests/e2e/a11y.spec.ts` scans each route after load. The sheet, its error state, the removal state and the discard bar are never open during a scan.
Change: add scans with the sheet open, after a failed save, with a row marked for removal and with the discard bar shown.
Done when: the four states run through axe (WCAG 2 A/AA) in CI with no violations.

## Screen Reader Flow Documentation

Reading order matches the visual order everywhere in the sheet. Landmarks: the sheet is a modal `<dialog>` named by its heading ("Hoy, 16 nov"); the page behind it is inert while open.

| Event | Announcement | Politeness | Where focus goes |
|---|---|---|---|
| Sheet opens | "Hoy, 16 nov, diálogo", then the first empty game's field ("Zip: tu tiempo, edición") and its description (format) | — | First empty time field |
| Time field loses focus with a value | Reading ("1:06") is part of the field's description, read when the field is next focused | none | Unchanged |
| Row emptied (stored entry) | "Zip: se quitará al guardar" | polite (`role="status"`) | Unchanged; "Deshacer: quitar Zip" is next in tab order |
| Deshacer pressed | "Zip: se mantiene" | polite | Back on the Zip time field |
| Dismiss attempt with edits | "Tienes cambios sin guardar." | focus move is the announcement | "Seguir editando" |
| Guardar pressed | "Guardando…" | polite | Unchanged (button disabled) |
| Save fails with row errors | "2 tiempos no se entienden" (summary), then on the field: name, "no válido", reason | summary polite; field read on focus | First invalid field |
| Save times out or offline | "No sabemos si se guardó. Tus tiempos siguen aquí." | assertive (`role="alert"`) | Guardar |
| Save succeeds | Sheet closes; the page status says "Guardado: Zip 0:48. Quitado: Queens." | polite | The button that opened the sheet |

The page behind the sheet on Hoy needs the status region from the Robust finding above.

## Keyboard Navigation Map

- Tab order inside the sheet: first row's fields in row order (time, then average), through the six rows, then Guardar, then "Pegar texto o varias fechas", then Cerrar last. Visually Cerrar is first, so move it earlier in the DOM or accept the departure and document it: recommended, Cerrar first in DOM, so DOM order equals visual order.
- Removal "Deshacer" sits directly after its own row's average field.
- Native `<dialog>` already traps focus; the custom Más sheet's own trap is unchanged.
- Escape: closes a clean sheet; on a dirty sheet shows the discard bar. Escape inside the discard bar returns to "Seguir editando".
- Focus returns to the opening button on close (native dialog behaviour). On Hoy the button's row re-renders after the refresh, so check the opener still exists in the DOM afterwards; if it was replaced, focus goes to the Games heading.
- Tab stops on Hoy after the change: each card's link, then the "Registrar hoy" button next to the Games link.

## Remediation Plan

### Critical — Blocks access for some users
None found by reading. Confirm with a screen reader pass on a real phone before accepting that.

### High — Significantly degrades the experience
- Row errors are not tied to their fields
- A save from Hoy would be silent
- The time format lives only in a placeholder

### Medium — Below WCAG AA compliance
- Time fields have no visible boundary
- The sheet opens with focus on "Cerrar", not on the first field
- Escape and system Back must run the same unsaved-changes check as Cerrar
- Disabled primary buttons look enabled
- The time mask must not fight assistive technology
- Domains on Hoy are bold text, not headings
- The six "Deshacer" buttons are indistinguishable
- Automated checks skip the sheet
- Primary button text drops below 4.5:1 on hover

### Low — Below best practices
- "Se quitará al guardar" must not rely on dimming or strikethrough alone
- Cerrar is small and far from the thumb
- Small fixed type and a single dark theme
