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
});
