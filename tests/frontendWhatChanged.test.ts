import { describe, it, expect } from "vitest";
import { parseRoute, DASHBOARD_HTML } from "../src/frontend.ts";
import { createDashboardRuntime } from "./helpers/dom.ts";

describe("Frontend What Changed Navigation & Visual Engine", () => {
  it("shouldParseChangesHashRouteWhenHashIsChanges", () => {
    const route = parseRoute("/overview", "#/changes");
    expect(route.tab).toBe("changes");
    expect(route.canonicalPath).toBe("/changes");
    expect(route.canonicalHash).toBe("#/changes");
  });

  it("shouldParseChangesPathRouteWhenPathIsChanges", () => {
    const route = parseRoute("/changes", "");
    expect(route.tab).toBe("changes");
    expect(route.canonicalPath).toBe("/changes");
  });

  it("shouldIncludeWhatChangedButtonInDashboardTabsWhenRendered", () => {
    expect(DASHBOARD_HTML).toMatch(/<button[^>]+id="tabBtnChanges"[^>]*onclick="showTab\('changes'\)"[^>]*>What Changed\?<\/button>/);
  });

  it("shouldIncludeChangesTabSectionWithRequiredContainersWhenRendered", () => {
    expect(DASHBOARD_HTML).toMatch(/<section[^>]+id="changesTab"[^>]*class="tab-panel"[^>]*hidden/);
    expect(DASHBOARD_HTML).toMatch(/id="changesHeader"/);
    expect(DASHBOARD_HTML).toMatch(/id="changesFindings"/);
    expect(DASHBOARD_HTML).toMatch(/id="changesActivity"/);
    expect(DASHBOARD_HTML).toMatch(/id="changesEmpty"/);
  });

  it("shouldActivateChangesTabWhenShowTabIsInvokedWithChanges", () => {
    const rt = createDashboardRuntime("/overview");
    rt.sandbox.showTab("changes");

    expect((rt.getEl("#overviewTab") as any).hidden).toBe(true);
    expect((rt.getEl("#langTab") as any).hidden).toBe(true);
    expect((rt.getEl("#chessTab") as any).hidden).toBe(true);
    expect((rt.getEl("#changesTab") as any).hidden).toBe(false);
    expect(rt.getEl("#changesTab").classList.contains("active")).toBe(true);
    expect(rt.getEl("#tabBtnChanges").className).toContain("btn-p");
    expect(rt.getEl("#tabBtnOverview").className).toContain("btn-g");
  });

  it("shouldRenderEmptyStateWhenNoActivityRecordedInInterval", () => {
    const rt = createDashboardRuntime("/changes");
    const emptyPayload = {
      userId: "1000001",
      interval: {
        since: "2026-09-24T00:00:00.000Z",
        until: "2026-10-01T00:00:00.000Z",
      },
      baseline: { status: "exactOrPrevious", observedAt: "2026-09-24T00:00:00.000Z" },
      chess: {
        gamesCount: 0,
        ratingDelta: 0,
        baselineRating: 1200,
        currentRating: 1200,
        intervalWinRate: null,
        whiteWinRate: null,
        blackWinRate: null,
        historicalWinRateDelta: null,
      },
      languages: {
        xpGained: 0,
        sessionsCount: 0,
        totalSessionMinutes: 0,
        baselineCourseId: "DUOLINGO_EN_ES",
        currentCourseId: "DUOLINGO_EN_ES",
        courseChanged: false,
      },
      streak: {
        baselineStreak: 50,
        currentStreak: 50,
        streakDelta: 0,
        status: "active" as const,
        streakStarted: false,
        streakMilestone: null,
      },
      findings: [],
    };

    rt.sandbox.renderWhatChanged(emptyPayload);

    const emptyEl = rt.getEl("#changesEmpty");
    expect(emptyEl.style.display).toBe("block");
    expect(emptyEl.textContent).toBe(
      "No hay actividad registrada entre 2026-09-24T00:00:00.000Z y 2026-10-01T00:00:00.000Z."
    );
    expect(rt.getEl("#changesFindings").innerHTML).toBe("");
    expect(rt.getEl("#changesActivity").innerHTML).toBe("");
  });

  it("shouldRenderDeltaCardsAndFindingsWhenActivityExistsInInterval", () => {
    const rt = createDashboardRuntime("/changes");
    const activePayload = {
      userId: "1000001",
      interval: {
        since: "2026-09-24T00:00:00.000Z",
        until: "2026-10-01T00:00:00.000Z",
      },
      baseline: { status: "exactOrPrevious", observedAt: "2026-09-24T00:00:00.000Z" },
      chess: {
        gamesCount: 15,
        ratingDelta: 35,
        baselineRating: 1200,
        currentRating: 1235,
        intervalWinRate: 60.0,
        whiteWinRate: 66.7,
        blackWinRate: 50.0,
        historicalWinRateDelta: 5.2,
      },
      languages: {
        xpGained: 450,
        sessionsCount: 6,
        totalSessionMinutes: 35,
        baselineCourseId: "DUOLINGO_EN_ES",
        currentCourseId: "DUOLINGO_XC_ES",
        courseChanged: true,
      },
      streak: {
        baselineStreak: 45,
        currentStreak: 52,
        streakDelta: 7,
        status: "active" as const,
        streakStarted: false,
        streakMilestone: 50,
      },
      findings: [
        {
          id: "CHESS_RATING_JUMP",
          category: "chess" as const,
          title: "Salto de ELO",
          claim: "Incremento notable de rating (+35)",
          evidence: "Rating inicial 1200 subió a 1235",
          baselineAt: "2026-09-24T00:00:00.000Z",
          until: "2026-10-01T00:00:00.000Z",
          metrics: { delta: 35 },
        },
      ],
    };

    rt.sandbox.renderWhatChanged(activePayload);

    expect(rt.getEl("#changesEmpty").style.display).toBe("none");

    const findingsHtml = rt.getEl("#changesFindings").innerHTML;
    expect(findingsHtml).toContain("Salto de ELO");
    expect(findingsHtml).toContain("CHESS");
    expect(findingsHtml).toContain("Incremento notable de rating (+35)");
    expect(findingsHtml).toContain("Rating inicial 1200 subió a 1235");

    const activityHtml = rt.getEl("#changesActivity").innerHTML;
    expect(activityHtml).toContain("Actividad en la ventana");
    // chess
    expect(activityHtml).toContain("Partidas jugadas");
    expect(activityHtml).toContain("15");
    expect(activityHtml).toContain("60.0%");
    // languages
    expect(activityHtml).toContain("450");
    expect(activityHtml).toContain("6");
    expect(activityHtml).toContain("35 min");
    expect(activityHtml).toContain("DUOLINGO_EN_ES → DUOLINGO_XC_ES");
    // streak
    expect(activityHtml).toContain("52");
    expect(activityHtml).toContain("45");
    expect(activityHtml).toContain("+7");
    expect(activityHtml).toContain("active");
    // already stated by an evaluation: not repeated as a second representation
    expect(activityHtml).not.toContain("Delta ELO");
    expect(activityHtml).not.toContain("Blancas vs Negras");
    expect(activityHtml).not.toContain("66.7%");
  });

  it("shouldRenderASingleActivityCardWithChessLanguagesAndStreakBlocks", () => {
    const rt = createDashboardRuntime("/changes");
    rt.sandbox.renderWhatChanged({
      userId: "1000001",
      interval: { since: "2026-09-24T00:00:00.000Z", until: "2026-10-01T00:00:00.000Z" },
      baseline: { status: "exactOrPrevious", observedAt: "2026-09-24T00:00:00.000Z" },
      chess: { gamesCount: 3, ratingDelta: null, baselineRating: 800, currentRating: null, intervalWinRate: null, whiteWinRate: null, blackWinRate: null, historicalWinRateDelta: null, historicalDelta: null },
      languages: { xpGained: 0, sessionsCount: 2, totalSessionMinutes: 4, baselineCourseId: null, currentCourseId: null, courseChanged: false },
      streak: { baselineStreak: null, currentStreak: null, streakDelta: null, status: "active", streakStarted: false, streakMilestone: null },
      findings: [],
    });
    const html = rt.getEl("#changesActivity").innerHTML;
    expect((html.match(/<h2>/g) || []).length).toBe(1);
    for (const title of ["Ajedrez", "Idiomas", "Racha"]) expect(html).toContain(">" + title + "</div>");
  });

  it("shouldUpdateLastVisitedAtWhenMarkAsSeenNowIsClicked", async () => {
    const rt = createDashboardRuntime("/changes");
    const fakeNow = new Date("2026-10-01T12:00:00.000Z");
    const realDate = globalThis.Date;

    let requestedUrl = "";
    rt.sandbox.fetch = async (url: string) => {
      if (url.includes("/api/what-changed")) {
        requestedUrl = url;
      }
      return {
        ok: true,
        json: async () => ({
          userId: "1000001",
          interval: { since: "2026-10-01T12:00:00.000Z", until: "2026-10-01T12:00:01.000Z" },
          baseline: { status: "exactOrPrevious", observedAt: "2026-10-01T12:00:00.000Z" },
          chess: { gamesCount: 0, ratingDelta: 0, baselineRating: null, currentRating: null, intervalWinRate: null, whiteWinRate: null, blackWinRate: null, historicalWinRateDelta: null },
          languages: { xpGained: 0, sessionsCount: 0, totalSessionMinutes: 0, baselineCourseId: null, currentCourseId: null, courseChanged: false },
          streak: { baselineStreak: null, currentStreak: null, streakDelta: 0, status: "active", streakStarted: false, streakMilestone: null },
          findings: [],
        }),
      };
    };

    rt.sandbox.markChangesAsSeenNow();
    const stored = rt.sandbox.localStorage.getItem("lastVisitedAt");
    expect(stored).toBeTruthy();
    expect(new Date(stored!).getTime()).not.toBeNaN();
    expect(requestedUrl).toContain("/api/what-changed");
  });

  it("shouldFetchWhatChangedWithSevenDayBaselineWhenNoStoredVisitTimestampExists", async () => {
    const rt = createDashboardRuntime("/changes");
    rt.sandbox.localStorage.clear();

    let capturedUrl = "";
    rt.sandbox.fetch = async (url: string) => {
      if (url.includes("/api/what-changed")) {
        capturedUrl = url;
      }
      return {
        ok: true,
        json: async () => ({
          userId: "1000001",
          interval: { since: "2026-09-24T00:00:00.000Z", until: "2026-10-01T00:00:00.000Z" },
          baseline: { status: "exactOrPrevious", observedAt: "2026-09-24T00:00:00.000Z" },
          chess: { gamesCount: 0, ratingDelta: 0, baselineRating: null, currentRating: null, intervalWinRate: null, whiteWinRate: null, blackWinRate: null, historicalWinRateDelta: null },
          languages: { xpGained: 0, sessionsCount: 0, totalSessionMinutes: 0, baselineCourseId: null, currentCourseId: null, courseChanged: false },
          streak: { baselineStreak: null, currentStreak: null, streakDelta: 0, status: "active", streakStarted: false, streakMilestone: null },
          findings: [],
        }),
      };
    };

    await rt.sandbox.fetchWhatChanged();
    expect(capturedUrl).toContain("/api/what-changed?since=");
    expect(rt.getEl("#changesHeader").innerHTML).toContain("Marcar como visto ahora");
    expect(rt.getEl("#changesHeader").innerHTML).toContain("Últimos 7 días");
    expect(rt.getEl("#changesHeader").innerHTML).toContain("Últimos 30 días");
    expect(rt.getEl("#changesHeader").innerHTML).toContain("Desde última visita");
  });
});
