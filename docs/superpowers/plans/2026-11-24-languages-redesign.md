# Idiomas rediseñado por utilidad Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (native, inline).

**Goal:** `/languages` is a per-course scoreboard (level, completeness, change, XP) with an account summary by period and one folded detail.

**Architecture:** Front end only. A new pure `scoreboard.ts` builds the rows and the period summary from data the page already loads (`/api/languages`, `/api/languages/xp`, `/api/languages/analytics` with `cefrBreakdown`); `languages.ts`/`.html` render it. The course detail, legacy/empty/failed states and the methodology disclosures stay.

**Spec:** `docs/superpowers/specs/2026-11-24-languages-redesign-design.md`

## Global Constraints
- Spanish; unknown is never zero; level only when every section group with units has a CEFR level (reuse `levelView`), else "—" and the unit count.
- XP of the account is never shown as a course's XP.
- Tests `shouldXWhenY`; gates: typecheck, web:lint, web:test, e2e (axe on /languages). Do not commit `.claude/` or `web/.impeccable/`.

## Review Focus
- Course without curriculum data: row says units unread, no 0 %.
- Section group "Repaso diario" with 0 units must not hide the level.
- 90 d period: no comparison. Prior period with no XP: no percentage (never ÷0).

### Task 1: `scoreboard.ts` (pure)
Files: Create `web/src/app/features/languages/scoreboard.ts`, `scoreboard.spec.ts`.
Produces: `courseRows(courses, curriculum, deltas)`, `periodSummary(xp, days, now)`.
- [ ] Spec first (RED), then implement, then GREEN. Commit.

### Task 2: Page
Files: Modify `languages.html`, `languages.ts`, `languages.spec.ts`.
- [ ] Replace hero/Actividad/Tu cuenta/Tus cursos/Análisis blocks by period selector + summary + rows + folded "cursos completados o sin empezar" + one folded detail (sesiones, día de la semana, esfuerzo por curso) + footer sync line; keep disclosures and course detail; delete dead code; Umami events; rewrite the affected spec tests. Gates, e2e, render check, PR.
