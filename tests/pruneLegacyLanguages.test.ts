import { describe, it, expect } from "vitest";
import { DASHBOARD_HTML } from "../src/frontend.ts";
import { createDashboardRuntime } from "./helpers/dom.ts";

// P1 #6: the hidden legacy container was written by renderLang (the /api/stats/lang fallback) and never shown.
describe("legacy languages DOM", () => {
  it("shouldNotCarryTheHiddenLegacyContainerNorItsTargets", () => {
    for (const id of ["langLegacyContainer", "langRitmo", "langRitmoSub", "langEvo", "langEvoNote", "langDist", "langPct", "langForm", "langDaily", "langIdiomas", "langOtros", "langProgress", "langProgressNote"])
      expect(DASHBOARD_HTML, id).not.toContain('id="' + id + '"');
  });

  it("shouldNotKeepHelpersThatOnlyThatOutputUsed", () => {
    for (const fn of ["setLangMetric", "barXp", "sumLast", "pctile", "groupCourses", "friendlyOtherName", "fmtTime"])
      expect(DASHBOARD_HTML, fn).not.toMatch(new RegExp("\\b" + fn + "\\b"));
  });

  it("shouldKeepTheLiveElementsTheFallbackStillFills", () => {
    for (const id of ["langEmpty", "langContent", "langAccountXp", "langAccountStreak", "langAccountDays", "langSyncMeta"])
      expect(DASHBOARD_HTML, id).toContain('id="' + id + '"');
  });

  it("shouldStillShowTheEmptyStateWhenTheFallbackHasNoActivity", () => {
    const rt = createDashboardRuntime("/languages");
    rt.sandbox.renderLang({ totals: { days: 0 }, summaries: [], courses: [] });
    expect(rt.getEl("#langEmpty").style.display).toBe("block");
    expect(rt.getEl("#langContent").style.display).toBe("none");
  });

  it("shouldFillAccountKpisAndSyncMetaWhenTheFallbackHasActivity", () => {
    // renderLang referenced `t` without declaring it, so the fallback threw after the first two KPIs
    const rt = createDashboardRuntime("/languages");
    rt.sandbox.renderLang({ totals: { days: 3, activeDays: 2 }, summaries: [{ date: 1790000000 }], courses: [], totalXp: 100, streak: 3, createdAt: new Date().toISOString(), courseProgressIndex: [] });
    expect(rt.getEl("#langAccountXp").textContent).toContain("100 XP");
    expect(rt.getEl("#langAccountStreak").textContent).toContain("3 días");
    expect(rt.getEl("#langAccountDays").textContent).toBe("2/3 días activos");
    expect(rt.getEl("#langSyncMeta").textContent).toMatch(/^Sincronizado hoy · Actividad hasta /);
  });
});
