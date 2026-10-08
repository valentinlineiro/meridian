import { describe, it, expect } from "vitest";
import { DASHBOARD_HTML } from "../src/frontend.ts";
import { createDashboardRuntime } from "./helpers/dom.ts";

const langs = (currentCourseId: string | null) => ({
  totalXp: 100000, streak: 12, currentCourseId, updatedAt: new Date().toISOString(),
  courses: [
    { courseId: "XB_EN", title: "Demo Beta", xp: 94000, fromLanguage: "en", learningLanguage: "xb" },
    { courseId: "XC_EN", title: "Demo Gamma", xp: 6000, fromLanguage: "en", learningLanguage: "xc" },
  ],
});

describe("Overview states which entity each number measures (P1 #5)", () => {
  it("shouldCallTheCourseSelectedNotFeaturedAndTagItAsCourseScope", () => {
    expect(DASHBOARD_HTML).not.toContain("Curso destacado");
    expect(DASHBOARD_HTML).toMatch(/Curso seleccionado<\/div><span class="pill pill-scope">CURSO<\/span>/);
  });

  it("shouldTagAccountScopedNumbersAsCuenta", () => {
    expect(DASHBOARD_HTML).toMatch(/id="overviewStreak"[^>]*>🔥 —<\/span><span class="pill pill-scope">CUENTA<\/span>/);
    expect(DASHBOARD_HTML).toMatch(/Todos los cursos <span class="pill pill-scope">CUENTA<\/span>/);
    expect(DASHBOARD_HTML).toMatch(/Cuenta · últimos 7 días <span class="pill pill-scope">CUENTA<\/span>/);
  });

  it("shouldStateTheWindowAndTheEntityOfTheChessNumbers", () => {
    expect(DASHBOARD_HTML).toContain("Ajedrez · últimos 7 días");
    expect(DASHBOARD_HTML).toContain("ELO observado");
    expect(DASHBOARD_HTML).toContain("Win rate (últimas 50 partidas, todos los rivales)");
  });

  it("shouldSayWhatDuolingoReportsWhenItDiffersFromTheSelectedCourse", () => {
    const rt = createDashboardRuntime("/overview");
    const l = langs("XC_EN");
    rt.renderLanguagesView(l, null, { summaries: [] }, null); // selects the most-XP course: XB_EN
    rt.renderOverviewLangCard(l, null);
    expect(rt.getEl("#overviewLangActiveCourse").textContent).toContain("Demo Beta");
    expect(rt.getEl("#overviewLangSourceCourse").textContent).toBe("Último curso en Duolingo: Demo Gamma");
  });

  it("shouldStaySilentWhenDuolingoReportsTheSelectedCourse", () => {
    const rt = createDashboardRuntime("/overview");
    const l = langs("XB_EN");
    rt.renderLanguagesView(l, null, { summaries: [] }, null);
    rt.renderOverviewLangCard(l, null);
    expect(rt.getEl("#overviewLangSourceCourse").textContent).toBe("");
  });

  it("shouldDateTheEloByTheLastChessSnapshot", () => {
    const rt = createDashboardRuntime("/overview");
    rt.sandbox.renderOverview({ langs: langs(null), stats: { currentElo: 900 }, lastChessSyncedAt: new Date(Date.now() - 2 * 864e5).toISOString(), matches: [], xp_summaries: [], recent: {} });
    expect(rt.getEl("#overviewChessElo").textContent).toBe("900 ELO");
    expect(rt.getEl("#overviewChessEloMeta").textContent).toBe("último snapshot de Chess: hace 2d");
  });

  it("shouldNotDateAnEloThatDoesNotExist", () => {
    const rt = createDashboardRuntime("/overview");
    rt.sandbox.renderOverview({ langs: langs(null), stats: {}, lastChessSyncedAt: new Date().toISOString(), matches: [], xp_summaries: [], recent: {} });
    expect(rt.getEl("#overviewChessEloMeta").textContent).toBe("");
  });
});
