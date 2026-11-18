---
name: Meridian
description: Personal longitudinal analytics, a single dark navy theme, Spanish, phone first.
colors:
  bg: "#0e141c"
  surface: "#131f33"
  sunken: "#0d1b2a"
  hover: "#16263c"
  selected: "#1c2d42"
  selected-line: "#38577a"
  line: "#1e2e44"
  line-strong: "#2a3d56"
  line-ui: "#5b7699"
  text: "#e6edf3"
  text-2: "#c8d7ea"
  muted: "#8ea0b8"
  accent: "#1f6feb"
  accent-hover: "#2a7bff"
  link: "#7aa7e6"
  info: "#58a6ff"
  ok: "#2ea043"
  err: "#d15a5a"
  warn: "#e3b341"
  orange: "#d98a4a"
  neutral: "#6e7a8e"
  win-bg: "#12291e"
  win-fg: "#7ee2a0"
  loss-bg: "#2a1616"
  loss-fg: "#e89a9a"
  draw-bg: "#1e2430"
  draw-fg: "#b9c2d0"
  warn-bg: "#2b2210"
  warn-fg: "#f0c674"
  board-dark: "#5b7a9e"
typography:
  display:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.1
  headline:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.4
  title:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.06em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-ghost:
    backgroundColor: "{colors.line}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "16px"
  input:
    backgroundColor: "{colors.sunken}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.md}"
    padding: "8px 10px"
  pill:
    textColor: "{colors.text-2}"
    rounded: "{rounded.pill}"
    padding: "2px 7px"
---

# Design System: Meridian

## Overview

**Creative North Star: "The Lab Notebook"**

A quiet dark ledger the owner reads in thirty seconds at the end of a day. Status comes first (a verdict pill, one big number, the date of the data), the evidence sits one line below it, and the detail is one tap further down. One navy theme, system fonts, flat tonal surfaces and 1px rules; colour is spent on verdicts, never on decoration.

It is read on a phone, often outdoors, in Spanish. Density is moderate: cards of 12 to 16px padding on a 1120px column, a sidebar on desktop and a bottom tab bar on phones. Nothing animates for attention and nothing pulls the owner back (no streaks or loss framing; see PRODUCT.md). When data is old or missing the card says so in a pill ("datos de hace 41 días") instead of showing a stale number as current.

**Key Characteristics:**
- One dark theme (`color-scheme: dark`); no light mode.
- Flat, tonal, restrained: depth from surface tints and borders.
- Verdict colours are a fixed vocabulary shared by chess, languages and Games.
- Status first: verdict pill, one big number, then the evidence line.
- Small uppercase labels over large plain numbers.
- Staleness is shown, never hidden: a pill carries the age of the data.
- Touch targets grow to 44px on phones; text never drops below 12px there.

## Colors

Deep navy ground with one saturated blue for the single primary action and active state.

### Primary
- **Signal Blue** (`#1f6feb`, hover `#2a7bff`): primary buttons, the active nav item's left rule, the active tab's top rule. Never used for body text.

### Secondary
- **Link Periwinkle** (`#7aa7e6`): links, focus rings and secondary actions. **Info Blue** (`#58a6ff`) draws the weekly XP bars.

### Neutral
- **Night Ground** (`#0e141c`): page background. **Panel Navy** (`#131f33`): cards, header, tab bar. **Sunken Ink** (`#0d1b2a`): inputs and disclosure boxes. **Hover** (`#16263c`) and **Selected** (`#1c2d42`, line `#38577a`) mark rows and the active item.
- **Hairline** (`#1e2e44`) for card and row dividers; **Strong Hairline** (`#2a3d56`) for emphasis; **UI Edge** (`#5b7699`) for ghost-button and field borders (at least 3:1).
- **Text** `#e6edf3`, **Text 2** `#c8d7ea`, **Muted** `#8ea0b8` for labels and secondary copy.

### Verdicts
- **Win** green `#2ea043` bars, `#12291e` ground, `#7ee2a0` text. **Loss** `#d15a5a`, `#2a1616`, `#e89a9a`. **Draw** `#6e7a8e`, `#1e2430`, `#b9c2d0`. **Warning** `#e3b341`, `#2b2210`, `#f0c674`. **Error-weak** orange `#d98a4a` for engine-error bars.

### Named Rules
**The Verdict Vocabulary Rule.** Win, loss, draw and warning each own one triple (ground, line, text). Reuse the triple; never invent a new status colour.

**The Evidence Colour Rule.** Colour marks a finding's verdict, not its category. Decorative colour is out.

## Typography

**Font:** the platform stack (`system-ui, -apple-system, Segoe UI, Roboto, sans-serif`), no web fonts. Buttons inherit it through a base `button{font-family:inherit}` rule.

**Character:** neutral and instrumental. Hierarchy comes from size, weight and uppercase tracking, not from a second family.

### Hierarchy
- **Display** (700, 26px, 1.1): KPI numbers and the big figure of a game report (800).
- **Headline** (700, 20px): brand and page `h1`.
- **Title** (600 to 700, 14 to 16px): card titles (on Hoy and Games the card title is 16px bold, not the uppercase label), hero win rate (16px, tabular figures).
- **Body** (400, 16px base on `body`; 13px in tables, rows and prose via `--fs-md`; 1.4): prose caps at 65ch.
- **Label** (600, 11px, +0.06em, uppercase): KPI captions, table heads, card `h2`, group headers. Raised to 12px on phones.

### Named Rules
**The Tabular Figures Rule.** Numbers that line up in columns or compare across rows use `font-variant-numeric: tabular-nums`.

## Layout

Single column `main` up to 1120px (shell 1360px with a 190px sticky sidebar) centred with 16px gutters (10px under 480px). Grids: `.kpis` 4 up, 2 up under 760px; `.grid2` to one column under 860px; `.grid3` auto-fit from 280px. Gaps are 12px (8px on small phones). Under 760px the sidebar hides and a fixed 56px bottom tab bar (four sections plus "Más" sheet) takes over, with safe-area insets honoured. Data tables become one card per row under 700px, headers kept for assistive technology.

## Elevation & Depth

Flat and tonal. Depth is a surface tint (`bg` < `sunken` < `surface` < `hover` < `selected`) plus 1px hairlines. Shadows exist only where something overlaps: the sticky first column of a wide table (`2px 0 4px rgba(0,0,0,.25)`), table scroll edges, and the modal scrim (`rgba(5,10,18,.75)`).

### Named Rules
**The Flat-At-Rest Rule.** Surfaces carry no shadow at rest. Overlap is shown with a scrim or an edge, not a glow.

## Shapes

Gentle, consistent rounding: 4px for small marks and bar tops, 8px for buttons and fields, 12px for cards and panels, full pill for status chips and progress bars. Borders are always 1px; a 3px coloured rule marks the active nav item and active tab. Legacy: `.loss-note` and `.hl` also use a 3px coloured left rule on a note; do not use that pattern for new work. The last move on the chess board is a 3px inset frame in warning yellow, not only a tint.

## Components

### Buttons
- **Shape:** 8px radius, 8px 14px padding, 13px semibold; 44px minimum on phones.
- **Primary:** Signal Blue ground, white text, lighter blue on hover, 50% opacity when disabled.
- **Ghost:** Hairline ground, Text 2 label, 1px UI Edge border (3:1).
- **Pressed toggle:** `aria-pressed=true` turns a button primary.
- **Small:** `.btn-sm`, 11px, 28px high, desktop only.

### Cards / Containers
12px radius, Panel Navy, 1px Hairline, 16px padding (12px under 480px). Card `h2` is the uppercase muted label; `h3` the card title.

### Inputs / Fields
Sunken Ink ground, Text 2, 1px board-blue border, 8px radius. Focus: 2px Link outline, 1px offset. Phones: 16px text so Safari does not zoom, 44px high.

### Pills and chips
Pill radius, 11px, 1px border; verdict variants use the Verdict triples. Filter chips are buttons of 32px (44px on phones).

### Navigation
Desktop: sticky sidebar, 3px left rule on the active item. Phone: fixed tab bar, 24px stroke icons (1.8px), 11px labels, 3px top rule and Selected ground on the active tab; a bottom sheet holds the secondary links.

### Status block (Hoy cards)
A card per surface: bold 16px title, a verdict pill and a staleness pill on the same line, the big number with its unit, then one evidence sentence. Stale data turns the staleness pill warning-yellow.

### Game row (Games, today first)
A full-width ghost button, 48px high, game name left (600) and state right (tabular, muted "Sin registrar" when empty); two columns from 761px. The whole row opens the register sheet on that game.

### Register sheet
A native `<dialog>`: bottom sheet on phones (full width, 90vh max, 12px top corners), 380px side panel on desktop. Rows are name plus two 44px centred numeric fields; an invalid field takes a loss-coloured border and a 12px message under the row; a full-width 48px primary save button closes it.

### Segmented control
Ghost buttons in a row with `aria-pressed`; the pressed one turns primary. Four periods and a caption fit one row at 390px.

### Disclosure
`<details>` with a muted 600 summary, 24px minimum (44px on phones) and a "Ver criterio" / "Ocultar" hint in link colour. Used for criteria, methodology and chess groups.

### Notes and errors
- **Note:** sunken box, 1px strong hairline, 8px radius. **Loss note** (legacy): warning ground with a 3px left rule; new notes use a warning ground and a 1px border instead.
- **Error box:** loss ground and line, message left, retry button right; it spans the grid. Every section either loads or shows this with a retry.

### Bottom sheet ("Más")
Fixed above the tab bar, 12px top corners, 48px rows at 16px, group labels in 11px uppercase, current page in Text on Selected.

### Chess board (signature)
8x8 grid, light squares Text 2, dark `#5b7a9e`, pieces in ink `#0b1220`, file and rank coordinates in 11px bold inside the corner squares, last move framed.

### Bars and charts
8 to 10px pill bars on a Hairline track; weekly bars with a dashed outline when a week is incomplete. SVG text uses the system stack.

## Do's and Don'ts

### Do:
- **Do** take colours, radii and sizes from the `:root` tokens; add a token before adding a literal.
- **Do** keep 3:1 contrast on field and ghost-button borders and 44px targets on phones.
- **Do** put the observation window beside every figure and show unknown as unknown, never zero.
- **Do** honour `prefers-reduced-motion` and keep focus rings visible (2px Link).
- **Do** lead a surface with status, then evidence, then detail; show the age of data when it is not today's.
- **Do** use native elements (`dialog`, `details`, `button`, `a`) before custom widgets.

### Don't:
- **Don't** add a light theme, web fonts or decorative gradients.
- **Don't** add shadows at rest or glows.
- **Don't** put a thick coloured left or right border on a card or note (`.loss-note`, `.hl` are legacy).
- **Don't** add streaks, loss framing, confetti or progress bars that exploit completion (PRODUCT.md principle 2).
- **Don't** introduce a new status colour outside the Verdict triples.
- **Don't** add new inline styles; extend a named class. The ~80 `u-*` utilities (all `!important`) and the phone overrides keyed on `[style*=...]` or `!important` are legacy from the inline-style cleanup: do not extend them and retire them when a surface is touched.
