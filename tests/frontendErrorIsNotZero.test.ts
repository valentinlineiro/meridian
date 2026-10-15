import { describe, it, expect } from "vitest";
import { createDashboardRuntime, emptyAccountPayload, fetchOnly } from "./helpers/dom.ts";

// A request that failed is "no disponible", never an observed zero or an empty list (Meridian: unknown is not converted to 0).
const settle = async () => { for (let i = 0; i < 300; i++) await Promise.resolve(); };
const http500 = async () => ({ ok: false, status: 500, json: async () => ({ ok: false, error: "internal error" }) });
const offline = async () => { throw new TypeError("network"); };
const ok = (body: unknown) => async () => ({ ok: true, status: 200, json: async () => body });
const text = (rt: any, sel: string): string => rt.getEl(sel).textContent;

const langs = { totalXp: 10, streak: 1, currentCourseId: "XB_EN", updatedAt: new Date().toISOString(),
  courses: [{ courseId: "XB_EN", title: "Demo Beta", xp: 10, fromLanguage: "en", learningLanguage: "xb" }] };

describe("overview: a failed request is not an observed zero", () => {
  it("shouldSayNoDisponibleWhenTheXpRequestFails", async () => {
    const rt = createDashboardRuntime("/overview", undefined, fetchOnly(["/api/languages/xp"], http500));
    await settle();
    expect(text(rt, "#overviewLangWeekSummary")).toBe("No disponible");
  });

  it("shouldSayNoDisponibleWhenTheMatchesRequestFails", async () => {
    const rt = createDashboardRuntime("/overview", undefined, fetchOnly(["/api/matches"], http500));
    await settle();
    expect(text(rt, "#overviewChessWeekSummary")).toBe("No disponible");
  });

  it("shouldNotPrintZeroWinsLossesDrawsWhenTheRecentFormIsUnavailable", async () => {
    const rt = createDashboardRuntime("/overview", undefined, fetchOnly(["/api/stats/bundle", "/api/stats/recent"], http500));
    await settle();
    expect(text(rt, "#overviewChessWrMeta")).toBe("—");
  });
});

describe("languages: a failed request is not an empty history", () => {
  const api = (xp: () => Promise<unknown>) => fetchOnly(["/api/languages"], async (url: string) =>
    url.startsWith("/api/languages/xp") ? xp()
    : url.startsWith("/api/languages/courses/") ? ok({ course: langs.courses[0], sections: [] })()
    : url.startsWith("/api/languages/analytics") ? http500()
    : ok(langs)());

  it("shouldSayNoDisponibleInsteadOfSinActividadWhenTheNinetyDayXpFails", async () => {
    const rt = createDashboardRuntime("/languages", undefined, api(http500));
    await settle();
    expect(text(rt, "#langXpTimeline")).toContain("No disponible");
    expect(text(rt, "#langXpTimeline")).not.toContain("Sin actividad");
  });

  it("shouldKeepZeroXpOnlyForDaysThatReportedIt", async () => {
    const rt = createDashboardRuntime("/languages", undefined, api(http500));
    await settle();
    expect(text(rt, "#langWeekSummary")).toBe("No disponible");
    expect(rt.getEl("#langActivityStrip").innerHTML).not.toContain("0 XP");
  });

  it("shouldShowTheCourseXpAsDashWhenItIsNull", () => {
    const rt = createDashboardRuntime("/languages");
    rt.renderLanguagesView({ ...langs, courses: [{ ...langs.courses[0], xp: null }] }, null, { summaries: [] }, null);
    expect(rt.getEl("#langCourseSelect").innerHTML).toContain("(— XP)");
    expect(rt.getEl("#langCoursesList").innerHTML).toContain("— XP");
  });
});

describe("chess: one failing card does not take the tab down", () => {
  it("shouldKeepTheKpisWhenOpeningsCannotBeRead", async () => {
    const rt = createDashboardRuntime("/chess", undefined, fetchOnly(["/api/stats/openings"], offline));
    await settle();
    expect(rt.getEl("#kpis").innerHTML).toContain("Partidas");
    expect(rt.getEl("#kpis").innerHTML).not.toContain("Error");
  });

  it("shouldKeepTheKpisWhenPhasesCannotBeRead", async () => {
    const rt = createDashboardRuntime("/chess", undefined, fetchOnly(["/api/stats/phases"], http500));
    await settle();
    expect(rt.getEl("#kpis").innerHTML).toContain("Partidas");
  });

  it("shouldSayTheMatchesCouldNotBeLoadedInsteadOfSinPartidasWhenTheRequestFails", async () => {
    const rt = createDashboardRuntime("/chess", undefined, fetchOnly(["/api/matches"], http500));
    await settle();
    expect(text(rt, "#empty")).toMatch(/No se pudieron cargar/);
    expect(rt.getEl("#empty").style.display).toBe("block");
  });

  it("shouldNotShowZeroForAStreakOrMedianTheSourceDidNotReport", async () => {
    const summary = { games: 5, wins: 2, losses: 2, draws: 1, winRate: 0.4, scoreRate: 0.5, currentElo: 1000, firstElo: 1000, currentStreak: 0, longestWin: null, longestLoss: null };
    const bundle = { ...(emptyAccountPayload("/api/stats/bundle") as object), summary };
    const phases = { phases: [], medianPlies: null, population: { hydrated: null } };
    const rt = createDashboardRuntime("/chess", undefined, fetchOnly(["/api/stats/bundle", "/api/stats/phases"], async (url: string) =>
      url.startsWith("/api/stats/phases") ? ok(phases)() : ok(bundle)()));
    await settle();
    expect(text(rt, "#streak")).toContain("Mejor racha: —");
    expect(text(rt, "#phasesMeta")).toBe("Mediana: — plies · Hidratadas: — partidas");
  });
});

describe("what changed / trajectory: absent values are not zero", () => {
  it("shouldNotPrintNullMinutesWhenTheSessionTimeIsUnknown", () => {
    const rt = createDashboardRuntime("/changes");
    rt.sandbox.renderWhatChanged({
      interval: { since: "2026-10-01T00:00:00.000Z", until: "2026-10-08T00:00:00.000Z" },
      chess: { gamesCount: 0, intervalWinRate: null, historicalDelta: null },
      languages: { xpGained: 5, sessionsCount: 1, totalSessionMinutes: null, baselineCourseId: null, currentCourseId: "X", courseChanged: false },
      streak: { baselineStreak: null, currentStreak: null, streakDelta: null, status: "active" },
      findings: [], evaluations: [],
    });
    const html = rt.getEl("#changesActivity").innerHTML;
    expect(html).not.toContain("null");
    expect(html).toMatch(/Tiempo invertido<\/span><b>—<\/b>/);
  });

  it("shouldNotRoundAMissingColourRateToZeroPercent", async () => {
    const body = { evaluations: [], temporalSpan: null, findings: [{ type: "CHESS_COLOR_ASYMMETRY_LONGITUDINAL", sample: { gamesCount: 10 },
      metrics: { dominantColor: "white", globalWhiteWinRate: null, globalBlackWinRate: 40 } }] };
    const rt = createDashboardRuntime("/trajectory", undefined, fetchOnly(["/api/trajectory"], ok(body)));
    await settle();
    expect(rt.getEl("#trajectoryFindings").innerHTML).toContain("— blancas");
    expect(rt.getEl("#trajectoryFindings").innerHTML).not.toContain("0% blancas");
  });
});

describe("review of PR #60: combined fallback and stale state", () => {
  it("shouldKeepTheKpisAndSayNoDisponiblePerCardWhenTheBundleAndEveryOtherStatsRouteFail", async () => {
    const routes = ["/api/stats/bundle", "/api/stats/results", "/api/stats/color", "/api/stats/opponents", "/api/stats/opponent-elo", "/api/stats/timeline", "/api/stats/recent"];
    const summary = { games: 5, wins: 2, losses: 2, draws: 1, winRate: 0.4, scoreRate: 0.5, currentElo: 1000, firstElo: 1000, currentStreak: 0 };
    const rt = createDashboardRuntime("/chess", undefined, fetchOnly([...routes, "/api/stats/summary"], async (url: string) =>
      url.startsWith("/api/stats/summary") ? ok(summary)() : http500()));
    await settle();
    expect(rt.getEl("#kpis").innerHTML).toContain("Partidas");
    for (const sel of ["#col", "#opp", "#evo", "#elo"]) expect(rt.getEl(sel).innerHTML).toContain("No disponible");
  });

  it("shouldNotPrintZeroCountsInTheChessHeroWhenTheRecentFormIsUnavailable", () => {
    const rt = createDashboardRuntime("/chess");
    rt.sandbox.renderChessView({ summary: { games: 3, winRate: 0.5 } }, []);
    expect(text(rt, "#chessHeroDistMeta")).toBe("—");
  });

  it("shouldClearTheOverviewDistributionBarWhenTheRecentFormBecomesUnavailable", () => {
    const rt = createDashboardRuntime("/overview");
    const base = { langs: langs, stats: {}, matches: [], xp_summaries: [] };
    rt.sandbox.renderOverview({ ...base, recent: { wins: 5, losses: 3, draws: 2, games: 10 } });
    expect(rt.getEl("#overviewChessDist").innerHTML).toContain("bar-win");
    rt.sandbox.renderOverview({ ...base, recent: null });
    expect(text(rt, "#overviewChessWrMeta")).toBe("—");
    expect(rt.getEl("#overviewChessDist").innerHTML).not.toContain("bar-win");
  });

  it("shouldNotReuseTheLastXpWhenALaterLoadFails", () => {
    const rt = createDashboardRuntime("/languages");
    const today = Math.floor(Date.now() / 1000);
    rt.renderLanguagesView(langs, null, { summaries: [{ date: today, gainedXp: 50, numSessions: 1, totalSessionTime: 60 }] }, null);
    expect(text(rt, "#langWeekSummary")).toContain("50 XP");
    rt.renderLanguagesView(langs, null, null, null);
    expect(text(rt, "#langWeekSummary")).toBe("No disponible");
  });
});
