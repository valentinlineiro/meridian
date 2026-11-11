# Navigation audit (2026-11-11)

Scope: the shell (`shell/shell.ts`, `side-nav.ts`, `tab-bar.ts`), `app.routes.ts` and the in-page navigation of each view. Measured on production at 390 px, read-only, plus code reading. No code changed. Standards used as the yardstick: WCAG 2.2 (2.4.1 Bypass Blocks, 2.4.3 Focus Order, 2.4.4 Link Purpose, 2.4.8 Location, 2.5.8 Target Size, 3.2.3 Consistent Navigation), WAI-ARIA APG (disclosure/dialog patterns), the bottom-navigation guidance of Material 3 and iOS HIG (3–5 destinations, one overflow entry), and Angular's router guidance for SPA scroll/focus.

## What is already right

- One tab bar (phones, ≤760 px) and one sidebar (desktop) with the same destinations, in the same order; the inactive one is `display:none`, so assistive tech sees a single "Secciones" nav.
- `aria-current="page"`, a distinct `<title>` per route, one `<h1>` per view, `<main>` landmark, deep-linkable routes (`/games/queens`, `/languages/:course`).
- Four tabs + "Más" (within the 3–5 guidance); the system Back button closes the "Más" sheet instead of leaving the page; Escape closes it and returns focus to its trigger.
- Tap targets in the bar and sheet ≥ 44–48 px.

## Findings

| # | Finding | Evidence | Standard | Impact | Cost |
|---|---------|----------|----------|--------|------|
| N1 | **Scroll is not reset on navigation.** Scrolled 900 px in Games, tapped "Ajedrez": the new page opens at 900 px. Opening a game report from the list lands at 586 px, not the top. `provideRouter` has no scroll option. | `app.config.ts`; measured | Angular router `scrollPositionRestoration`; orientation (2.4.8) | High | Low |
| N2 | **Focus is not moved on navigation.** After a route change focus stays on the tapped tab/link; keyboard and screen-reader users are not taken to the new content and nothing announces the change. | measured (`activeElement` = the tab) | 2.4.3, SPA route announcements | High | Low–Med |
| N3 | **No skip link.** Sidebar (desktop) puts ~9 links before the content on every page. | no `a[href^="#"]` | 2.4.1 | High (keyboard) | Low |
| N4 | **"Más" sheet is a dialog that is not modal.** `role="dialog"` without `aria-modal`, background not inert, and Tab leaves the sheet into the page (reached "✓ Queens" behind the scrim). `shared/modal.ts` already has a focus trap the sheet does not use. | measured; `tab-bar.ts` | APG dialog | Medium | Low |
| N5 | **Secondary destinations are hidden.** "Qué cambió" and "Trayectoria" (group *Resumen*, the same as *Hoy*) are only in "Más" on phones, while Hoy is a tab: the group is split across two places; "Más" mixes pages with account actions (Sincronizar, Configuración, Salir). | `tab-bar.ts` | discoverability; 3.2.3 | Medium | Medium (IA decision) |
| N6 | **Brand is not a link.** No one-tap route home from a deep page on desktop or when scrolled; "Hoy" is the only way. | `shell.ts` | convention | Low | Low |
| N7 | **Menu semantics.** Group labels ("Resumen", "Dominios", "Cuenta") are `<div>`s, items are not in a list, so assistive tech announces neither grouping nor count. | `side-nav.ts` | 1.3.1 | Low–Med | Low |
| N8 | **In-page navigation is not addressable.** Ajedrez's section index (`.cindex`) is buttons that reveal sections: not in the URL, no deep link, Back does not undo. Games report: the period is not in the URL. | `chess.html`, `games.html` | location/back-button expectations | Medium | Medium |
| N9 | **Unknown routes redirect silently** to Hoy (`**` → overview; `/games/:other` → `/games`); no "not found" feedback. | `app.routes.ts` | error identification | Low | Low |
| N10 | **Report back-navigation is a lone text link** ("← Todos los juegos") with no breadcrumb/parent context in the sidebar (Games stays active, good) — acceptable, noted for 2.4.8. | `games.html:3` | | Low | — |

## Proposed order (each its own small PR, tests first, checked at 390/768/1200 px)

1. **Fundamentals (N1, N2, N3, N6, N9):** `scrollPositionRestoration: 'enabled'` + `anchorScrolling`; on `NavigationEnd` move focus to `<main>`/`<h1>` (`tabindex="-1"`) and announce via a polite live region; skip link; brand as a link; a small "no encontrada" page.
2. **Sheet and menu semantics (N4, N7):** make the "Más" sheet truly modal by reusing `shared/modal.ts`'s trap + `aria-modal`/inert; menu groups as `<ul>` with `aria-labelledby` headings.
3. **Information architecture (N5), needs a decision:** options in the PR description; recommended: keep four tabs + "Más", but make "Más" a clear two-section menu (**Resumen**: Qué cambió, Trayectoria · **Cuenta**: Sincronizar, Configuración, Salir) and show a dot/active state when a Resumen page is open (already true for `secondary`).
4. **Addressable in-page state (N8):** section and period as URL fragments/query params so Back and links work.

Not covered: pointer/gesture navigation (swipe between tabs), which neither guidance recommends for a data dashboard.
