import { describe, it, expect } from "vitest";
import { getWhatChangedUseCase } from "../src/application/getWhatChangedUseCase.ts";
import type { WhatChangedPort } from "../src/ports/whatChangedPort.ts";
import { NotFoundError } from "../src/application/errors.ts";

function createMockPort(overrides: Partial<WhatChangedPort> = {}): WhatChangedPort {
  return {
    resolveUserId: async () => "1000001",
    getChessBaseline: async () => ({
      status: "exactOrPrevious",
      data: {
        rating: 800,
        lifetimeGames: 50,
        lifetimeDecided: 50,
        lifetimeWins: 25,
        observedAt: "2026-09-24T00:00:00.000Z",
      },
    }),
    getChessInterval: async () => ({
      gamesCount: 10,
      decidedCount: 10,
      wins: 6,
      whiteGames: 6,
      whiteDecided: 6,
      whiteWins: 4,
      blackGames: 4,
      blackDecided: 4,
      blackWins: 2,
      latestRating: 830,
    }),
    getLanguagesBaseline: async (_userId, since) => {
      if (since <= "2026-09-24T00:00:00.000Z") {
        return {
          status: "exactOrPrevious",
          data: {
            totalXp: 50000,
            activeCourseId: "DUOLINGO_XA_EN",
            streak: 100,
            observedAt: "2026-09-24T00:00:00.000Z",
          },
        };
      }
      return {
        status: "exactOrPrevious",
        data: {
          totalXp: 51200,
          activeCourseId: "DUOLINGO_XA_EN",
          streak: 107,
          observedAt: since,
        },
      };
    },
    getLanguagesTarget: async (_userId, until) => {
      if (until <= "2026-09-24T00:00:00.000Z") {
        return {
          status: "exactOrPrevious",
          data: {
            totalXp: 50000,
            activeCourseId: "DUOLINGO_XA_EN",
            streak: 100,
            observedAt: "2026-09-24T00:00:00.000Z",
          },
        };
      }
      return {
        status: "exactOrPrevious",
        data: {
          totalXp: 51200,
          activeCourseId: "DUOLINGO_XA_EN",
          streak: 107,
          observedAt: until,
        },
      };
    },
    getLanguagesInterval: async () => ({
      xpGained: 1200,
      sessionsCount: 14,
      totalSessionMinutes: 120,
      daysWithActivity: 7,
    }),
    getHistoricalDailyXpRate: async () => 60,
    ...overrides,
  };
}


describe("Get What Changed Use Case", () => {
  it("shouldThrowNotFoundErrorWhenUserIdCannotBeResolved", async () => {
    const port = createMockPort({ resolveUserId: async () => null });
    await expect(
      getWhatChangedUseCase(port, {
        since: "2026-09-24T00:00:00.000Z",
        until: "2026-10-01T00:00:00.000Z",
      })
    ).rejects.toThrow(NotFoundError);
  });

  it("shouldComputeMathematicalDeltasAndFindingsCorrectlyWhenValidIntervalProvided", async () => {
    const port = createMockPort();
    const res = await getWhatChangedUseCase(port, {
      since: "2026-09-24T00:00:00.000Z",
      until: "2026-10-01T00:00:00.000Z",
      userId: "1000001",
    });

    expect(res.userId).toBe("1000001");
    expect(res.interval.since).toBe("2026-09-24T00:00:00.000Z");
    expect(res.interval.until).toBe("2026-10-01T00:00:00.000Z");
    expect(res.baseline.status).toBe("exactOrPrevious");

    // Chess deltas
    expect(res.chess.gamesCount).toBe(10);
    expect(res.chess.ratingDelta).toBe(30);
    expect(res.chess.intervalWinRate).toBe(60.0);
    expect(res.chess.whiteWinRate).toBeCloseTo(66.67, 1);
    expect(res.chess.blackWinRate).toBe(50.0);

    // Languages deltas
    expect(res.languages.xpGained).toBe(1200);
    expect(res.languages.sessionsCount).toBe(14);
    expect(res.languages.courseChanged).toBe(false);

    // Streak deltas
    expect(res.streak.currentStreak).toBe(107);
    expect(res.streak.streakDelta).toBe(7);
    expect(res.streak.status).toBe("active");

    // Findings
    const jump = res.findings.find((f) => f.id === "CHESS_RATING_JUMP");
    expect(jump).toBeDefined();
    expect(jump?.claim).toContain("+30");
  });

  it("shouldReturnZeroRatingDeltaWhenNoGamesPlayedInInterval", async () => {
    const port = createMockPort({
      getChessInterval: async () => ({
        gamesCount: 0,
        decidedCount: 0,
        wins: 0,
        whiteGames: 0,
        whiteDecided: 0,
        whiteWins: 0,
        blackGames: 0,
        blackDecided: 0,
        blackWins: 0,
        latestRating: null,
      }),
    });
    const res = await getWhatChangedUseCase(port, {
      since: "2026-09-24T00:00:00.000Z",
      until: "2026-10-01T00:00:00.000Z",
    });
    expect(res.chess.gamesCount).toBe(0);
    expect(res.chess.ratingDelta).toBe(0);
    expect(res.chess.intervalWinRate).toBeNull();
  });

  it("shouldClassifyBaselineAsUnavailableWhenBothChessAndLanguagesUnavailable", async () => {
    const port = createMockPort({
      getChessBaseline: async () => ({ status: "unavailable", data: null }),
      getLanguagesBaseline: async () => ({ status: "unavailable", data: null }),
      getLanguagesTarget: async () => ({ status: "unavailable", data: null }),
    });
    const res = await getWhatChangedUseCase(port, {
      since: "2026-09-24T00:00:00.000Z",
      until: "2026-10-01T00:00:00.000Z",
    });
    expect(res.baseline.status).toBe("unavailable");
    expect(res.baseline.observedAt).toBeNull();
  });

  it("shouldClassifyBaselineAsFirstHistoricalWhenEitherChessOrLanguagesFirstHistorical", async () => {
    const port = createMockPort({
      getChessBaseline: async () => ({
        status: "firstHistorical",
        data: {
          rating: 750,
          lifetimeGames: 0,
          lifetimeDecided: 0,
          lifetimeWins: 0,
          observedAt: "2026-09-25T10:00:00.000Z",
        },
      }),
    });
    const res = await getWhatChangedUseCase(port, {
      since: "2026-09-24T00:00:00.000Z",
      until: "2026-10-01T00:00:00.000Z",
    });
    expect(res.baseline.status).toBe("firstHistorical");
    expect(res.chess.historicalWinRateDelta).toBeNull();
  });

  it("shouldDetectBrokenStreakWhenMultiDayStreakCollapsesToOneOrZero", async () => {
    const port = createMockPort({
      getLanguagesBaseline: async () => ({
        status: "exactOrPrevious",
        data: {
          totalXp: 50000,
          activeCourseId: "DUOLINGO_XA_EN",
          streak: 15,
          observedAt: "2026-09-24T00:00:00.000Z",
        },
      }),
      getLanguagesTarget: async () => ({
        status: "exactOrPrevious",
        data: {
          totalXp: 50050,
          activeCourseId: "DUOLINGO_XA_EN",
          streak: 1,
          observedAt: "2026-10-01T00:00:00.000Z",
        },
      }),
    });
    const res = await getWhatChangedUseCase(port, {
      since: "2026-09-24T00:00:00.000Z",
      until: "2026-10-01T00:00:00.000Z",
    });
    expect(res.streak.status).toBe("broken");
    const streakBroken = res.findings.find((f) => f.id === "STREAK_BROKEN");
    expect(streakBroken).toBeDefined();
  });

  it("shouldNotMarkStreakBrokenWhenStreakMerelyFluctuatesAboveOne", async () => {
    const port = createMockPort({
      getLanguagesBaseline: async () => ({
        status: "exactOrPrevious",
        data: {
          totalXp: 50000,
          activeCourseId: "DUOLINGO_XA_EN",
          streak: 15,
          observedAt: "2026-09-24T00:00:00.000Z",
        },
      }),
      getLanguagesTarget: async () => ({
        status: "exactOrPrevious",
        data: {
          totalXp: 50200,
          activeCourseId: "DUOLINGO_XA_EN",
          streak: 12,
          observedAt: "2026-10-01T00:00:00.000Z",
        },
      }),
    });
    const res = await getWhatChangedUseCase(port, {
      since: "2026-09-24T00:00:00.000Z",
      until: "2026-10-01T00:00:00.000Z",
    });
    expect(res.streak.status).toBe("active");
    const streakBroken = res.findings.find((f) => f.id === "STREAK_BROKEN");
    expect(streakBroken).toBeUndefined();
  });

  it("shouldUseHistoricalTargetStateWhenUntilIsInThePast", async () => {
    const port = createMockPort({
      getLanguagesBaseline: async () => ({
        status: "exactOrPrevious",
        data: {
          totalXp: 20000,
          activeCourseId: "DUOLINGO_ES_EN",
          streak: 30,
          observedAt: "2026-08-01T00:00:00.000Z",
        },
      }),
      getLanguagesTarget: async () => ({
        status: "exactOrPrevious",
        data: {
          totalXp: 25000,
          activeCourseId: "DUOLINGO_XA_EN",
          streak: 45,
          observedAt: "2026-08-15T00:00:00.000Z",
        },
      }),
    });

    const res = await getWhatChangedUseCase(port, {
      since: "2026-08-01T00:00:00.000Z",
      until: "2026-08-15T00:00:00.000Z",
    });

    expect(res.languages.baselineCourseId).toBe("DUOLINGO_ES_EN");
    expect(res.languages.currentCourseId).toBe("DUOLINGO_XA_EN");
    expect(res.languages.courseChanged).toBe(true);
    expect(res.streak.baselineStreak).toBe(30);
    expect(res.streak.currentStreak).toBe(45);
    expect(res.streak.streakDelta).toBe(15);
  });

  it("shouldDetectStreakMilestoneWhenCrossingFiftyThreshold", async () => {
    const port = createMockPort({
      getLanguagesBaseline: async () => ({
        status: "exactOrPrevious",
        data: {
          totalXp: 50000,
          activeCourseId: "DUOLINGO_XA_EN",
          streak: 48,
          observedAt: "2026-09-24T00:00:00.000Z",
        },
      }),
      getLanguagesTarget: async () => ({
        status: "exactOrPrevious",
        data: {
          totalXp: 50300,
          activeCourseId: "DUOLINGO_XA_EN",
          streak: 51,
          observedAt: "2026-10-01T00:00:00.000Z",
        },
      }),
    });
    const res = await getWhatChangedUseCase(port, {
      since: "2026-09-24T00:00:00.000Z",
      until: "2026-10-01T00:00:00.000Z",
    });
    expect(res.streak.streakMilestone).toBe(50);
    const milestone = res.findings.find((f) => f.id === "STREAK_MILESTONE");
    expect(milestone).toBeDefined();
    expect(milestone?.claim).toContain("50 días");
  });

  it("shouldNotPolluteTargetCourseOrStreakWhenTargetIsUnavailableAndBaselineIsFirstHistorical", async () => {
    const port = createMockPort({
      getLanguagesBaseline: async () => ({
        status: "firstHistorical",
        data: {
          totalXp: 5000,
          activeCourseId: "DUOLINGO_XD_EN",
          streak: 10,
          observedAt: "2026-10-05T00:00:00.000Z",
        },
      }),
      getLanguagesTarget: async () => ({
        status: "unavailable",
        data: null,
      }),
    });

    const res = await getWhatChangedUseCase(port, {
      since: "2026-08-01T00:00:00.000Z",
      until: "2026-08-15T00:00:00.000Z",
    });

    expect(res.languages.baselineCourseId).toBe("DUOLINGO_XD_EN");
    expect(res.languages.currentCourseId).toBeNull();
    expect(res.languages.courseChanged).toBe(false);
    expect(res.streak.baselineStreak).toBe(10);
    expect(res.streak.currentStreak).toBeNull();
    expect(res.streak.streakDelta).toBeNull();
  });

  it("shouldPassExplicitUserIdToResolveUserIdWhenProvided", async () => {
    let capturedId: string | null | undefined;
    const port = createMockPort({
      resolveUserId: async (id) => {
        capturedId = id;
        return "custom-user";
      },
    });
    const res = await getWhatChangedUseCase(port, {
      since: "2026-09-24T00:00:00.000Z",
      until: "2026-10-01T00:00:00.000Z",
      userId: "custom-user",
    });
    expect(capturedId).toBe("custom-user");
    expect(res.userId).toBe("custom-user");
  });

  it("shouldReturnResultWithZeroDeltasAndUnavailableBaselineWhenExistingUserHasZeroActivity", async () => {
    const port = createMockPort({
      resolveUserId: async () => "zero-activity-user",
      getChessBaseline: async () => ({ status: "unavailable", data: null }),
      getChessInterval: async () => ({
        gamesCount: 0,
        decidedCount: 0,
        wins: 0,
        whiteGames: 0,
        whiteDecided: 0,
        whiteWins: 0,
        blackGames: 0,
        blackDecided: 0,
        blackWins: 0,
        latestRating: null,
      }),
      getLanguagesBaseline: async () => ({ status: "unavailable", data: null }),
      getLanguagesTarget: async () => ({ status: "unavailable", data: null }),
      getLanguagesInterval: async () => ({
        xpGained: 0,
        sessionsCount: 0,
        totalSessionMinutes: 0,
        daysWithActivity: 0,
      }),
      getHistoricalDailyXpRate: async () => 0,
    });

    const res = await getWhatChangedUseCase(port, {
      since: "2026-09-24T00:00:00.000Z",
      until: "2026-10-01T00:00:00.000Z",
      userId: "zero-activity-user",
    });

    expect(res.userId).toBe("zero-activity-user");
    expect(res.baseline.status).toBe("unavailable");
    expect(res.chess.gamesCount).toBe(0);
    expect(res.languages.xpGained).toBe(0);
    expect(res.languages.sessionsCount).toBe(0);
    expect(res.findings).toEqual([]);
  });
});

