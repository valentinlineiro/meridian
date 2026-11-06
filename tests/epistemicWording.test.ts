import { describe, it, expect } from "vitest";
import { evaluateSignificantChanges } from "../src/domain/whatChanged.ts";


describe("epistemic wording", () => {
  // The screen side (no "significativ", no fixed small-sample note, "Últimas <observed>") lives in tests/webCopyInvariants.test.ts
  // and the Chess spec (shouldLabelTheWindowWithTheGamesObservedNotTheRequestedLimit, m-compare intervals).
  it("shouldNeverSaySignificantInFindings", () => {
    const f = evaluateSignificantChanges({
      chess: { gamesCount: 40, decidedCount: 40, ratingDelta: 0, ratingGames: null, baselineRating: null, currentRating: null, intervalWinRate: 50, intervalWhiteWinRate: 75, intervalBlackWinRate: 25, historicalWinRateDelta: null, colorDelta: { diff: 50, lower: 28.4, upper: 66.1 }, historicalDelta: null },
      languages: { intervalDays: 7, observedDays: 1, partialDaysExcluded: 0, historicalObservedDays: 1, historicalSpanDays: null, historicalSpanStart: null, xpGained: 0, sessionsCount: 0, totalSessionMinutes: 0, baselineCourseId: null, currentCourseId: null, courseChanged: false, dailyXpRate: 0, historicalDailyXpRate: 0 },
      streak: { baselineStreak: null, currentStreak: null, streakDelta: null, status: "active", streakStarted: false, streakMilestone: null },
    }, { userId: "u", baselineAt: "a", until: "b" }).find((x) => x.id === "CHESS_COLOR_ASYMMETRY")!;
    expect(f.claim).not.toMatch(/significativ/i);
    // A8: decimal comma in the text a person reads (claim and evidence); a dot between digits would be the old notation
    expect(f.claim + f.evidence).not.toMatch(/\d\.\d/);
    expect(f.evidence).toBe("Blancas: 75,0 % · Negras: 25,0 % en 40 partidas decididas.");
    expect(f.claim).toBe("Mayor tasa de victorias con blancas: 50,0 pp de diferencia (IC95 [28, 66] pp, blancas − negras; excluye 0).");
  });
});
