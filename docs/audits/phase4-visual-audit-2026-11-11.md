# Phase 4.1 — visual audit (2026-11-11)

Scope: 7 views (Hoy, Qué cambió, Trayectoria, Ajedrez, Juegos, Idiomas, Configuración; Perfil shares Ajedrez) at 390, 768 and 1200 px, read-only against production. Screenshots are kept outside the repo (they contain personal data); this file holds only measurements. No code changed.

## Backlog (impact / cost)

| # | Finding | Evidence | Impact | Cost |
|---|---------|----------|--------|------|
| 1 | Horizontal overflow at 390 px in Juegos | `table#gamesLoss` right edge 424 px on a 375 px viewport | High | Low |
| 2 | Overflow at 768 px in Idiomas | `.kpi` / `#langAccountCourses` 18 px past the edge | Medium | Low |
| 3 | Inline `style=` as the layout mechanism | languages.html 99, chess.html 43, engine-profile.html 23, course-detail.ts 17, patterns.ts 16 | High (consistency) | Medium |
| 4 | No single type scale | distinct font sizes per view: Juegos 8, Ajedrez/Perfil 7, Idiomas 6–7, Configuración 4 | Medium | Medium |
| 5 | Touch targets < 44 px | 390 px: Juegos 9, Configuración 1; 768 px: 9–54 per view (Juegos 54, Ajedrez/Perfil 42, Idiomas 41) | Medium on touch | Medium |
| 6 | Perfil repeats Ajedrez content | same text length and height at 768/1200 px | Decide: intended? | Low |
| 7 | Hoy sparse on mobile | three link cards only | Low | Low |
| 8 | Colors: 6 hex outside tokens | grep over app/ | Low | Low |

Good already: one `h1` and a distinct `<title>` per view.

## Separate from phase 4: reliability

A burst of 24 sequential page loads produced HTTP 500 on `/api/languages` and several `/api/stats/*` (Hoy showed «—» everywhere). A second pass with 4 s between pages gave 0 errors; each endpoint answers 200 alone (`/api/stats/summary` ≈1.3 s, `/api/stats/bundle` ≈1.1 s). Hypothesis, unverified: Worker CPU/limits on the Free plan under accumulated requests. Needs its own investigation (Worker logs), not a visual fix.

## Proposed order

4.2 fix #1 and #2, then the type scale and spacing tokens (#4, #3 partly); 4.3 shared table/card/notice components; 4.4 per-view hierarchy (#6, #7); 4.5 QA at 390/768/1200 including touch targets (#5).
