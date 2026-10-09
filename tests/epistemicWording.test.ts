import { describe, it, expect } from "vitest";
import { DASHBOARD_HTML } from "../src/frontend.ts";
import { callDashboard } from "./helpers/dom.ts";
import { evaluateSignificantChanges } from "../src/domain/whatChanged.ts";


describe("epistemic wording", () => {
  it("shouldNeverSaySignificantInTheDashboardOrInFindings", () => {
    expect(DASHBOARD_HTML).not.toMatch(/significativ/i);
    const f = evaluateSignificantChanges({
      chess: { gamesCount: 40, decidedCount: 40, ratingDelta: 0, baselineRating: null, currentRating: null, intervalWinRate: 50, intervalWhiteWinRate: 75, intervalBlackWinRate: 25, historicalWinRateDelta: null, colorDelta: { diff: 50, lower: 28.4, upper: 66.1 }, historicalDelta: null },
      languages: { intervalDays: 7, xpGained: 0, sessionsCount: 0, totalSessionMinutes: 0, baselineCourseId: null, currentCourseId: null, courseChanged: false, dailyXpRate: 0, historicalDailyXpRate: 0 },
      streak: { baselineStreak: null, currentStreak: null, streakDelta: null, status: "active", streakStarted: false, streakMilestone: null },
    }, { userId: "u", baselineAt: "a", until: "b" }).find((x) => x.id === "CHESS_COLOR_ASYMMETRY")!;
    expect(f.claim).not.toMatch(/significativ/i);
    expect(f.claim).toBe("Mayor tasa de victorias con blancas: 50.0 pp de diferencia (IC95 [28, 66] pp, blancas − negras; excluye 0).");
  });

  it("shouldNotFlagSmallSamplesWithAFixedGamesThreshold", () => {
    const render = (g: any[], total: number): string => callDashboard(`renderCompare(${JSON.stringify(g)}, ${total})`).result;
    const g = (games: number) => ({ key: "pvp", games, wins: games, losses: 0, draws: 0, unknown: 0, decided: games, winRate: 1, scoreRate: 1, winRateCi: { lower: 0.5, upper: 1 } });
    expect(render([g(3)], 3)).not.toMatch(/muestra pequeña/);
    expect(render([g(3)], 3)).toContain("[50–100]"); // the interval carries the uncertainty
  });

  it("shouldLabelTheWindowWithTheGamesObservedNotTheRequestedLimit", () => {
    const side = (o: any) => ({ key: "x", games: 0, wins: 0, losses: 0, draws: 0, decided: 0, winRate: null, scoreRate: null, winRateCi: null, ...o });
    const el = callDashboard(`renderForm(${JSON.stringify({ ...side({ limit: 50, games: 12, wins: 6, losses: 6, decided: 12, winRate: 0.5 }), before: side({}), delta: null })})`).els["#form"]!;
    expect(el.innerHTML).toContain("Últimas 12");
    expect(el.innerHTML).not.toContain("Últimas 50");
  });
});
