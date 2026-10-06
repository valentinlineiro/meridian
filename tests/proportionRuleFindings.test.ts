import { describe, it, expect } from "vitest";
import { getWhatChangedUseCase } from "../src/application/getWhatChangedUseCase.ts";
import { evaluateSignificantChanges, type WhatChangedDeltas } from "../src/domain/whatChanged.ts";
import { evaluateTrajectoryPatterns, type TrajectoryInput } from "../src/domain/trajectory.ts";
import type { WhatChangedPort } from "../src/ports/whatChangedPort.ts";

const SINCE = "2026-09-20T00:00:00.000Z", UNTIL = "2026-09-27T00:00:00.000Z";

// ---- What-changed: acceptance cases through the use case -------------------------------------------------
function port(interval: Record<string, number>): WhatChangedPort {
  const none = { status: "unavailable", data: null } as const;
  return {
    resolveUserId: async () => "u1",
    getChessBaseline: async () => ({ status: "exactOrPrevious", data: { rating: 800, observedAt: SINCE, lifetimeGames: 100, lifetimeDecided: 100, lifetimeWins: 50 } }),
    getChessInterval: async () => ({ gamesCount: 0, decidedCount: 0, wins: 0, whiteGames: 0, whiteDecided: 0, whiteWins: 0, blackGames: 0, blackDecided: 0, blackWins: 0, latestRating: null, ...interval }),
    getLanguagesBaseline: async () => none, getLanguagesTarget: async () => none,
    getLanguagesInterval: async () => ({ xpGained: 0, sessionsCount: 0, totalSessionMinutes: 0, daysWithActivity: 0 }),
    getHistoricalDailyXpRate: async () => 0,
  };
}
const asym = (r: any) => r.findings.find((f: any) => f.id === "CHESS_COLOR_ASYMMETRY");
const run = (i: Record<string, number>) => getWhatChangedUseCase(port(i), { since: SINCE, until: UNTIL });

describe("what-changed color asymmetry: n + effect + interval", () => {
  it("shouldNotEmitWhenFiveVsFiveDecidedEvenWithFortyPointGap", async () => {
    const r = await run({ gamesCount: 10, decidedCount: 10, wins: 6, whiteGames: 5, whiteDecided: 5, whiteWins: 4, blackGames: 5, blackDecided: 5, blackWins: 2 });
    expect(r.chess.colorDelta!.diff).toBeCloseTo(40, 6);
    expect(r.chess.colorDelta!.lower).toBeCloseTo(-16.3, 1);
    expect(r.chess.colorDelta!.upper).toBeCloseTo(72.6, 1);
    expect(asym(r)).toBeUndefined(); // n gate and effect threshold pass; only the interval blocks
  });

  it("shouldEmitWhenTwentyVsTwentyHasAClearGap", async () => {
    const r = await run({ gamesCount: 40, decidedCount: 40, wins: 25, whiteGames: 20, whiteDecided: 20, whiteWins: 15, blackGames: 20, blackDecided: 20, blackWins: 5 });
    const f = asym(r);
    expect(f).toBeDefined();
    expect(f.metrics.diffCiLower).toBeGreaterThan(0);
    expect(f.metrics.diffPp).toBeCloseTo(50, 6);
  });

  it("shouldReportTheIntervalOfTheHistoricalDeltaInPercent", async () => {
    const r = await run({ gamesCount: 20, decidedCount: 20, wins: 14 }); // 70% vs lifetime 50%
    expect(r.chess.historicalDelta!.diff).toBeCloseTo(20, 6);
    expect(r.chess.historicalDelta!.lower).toBeLessThan(r.chess.historicalDelta!.diff);
    expect(r.chess.historicalDelta!.upper).toBeGreaterThan(r.chess.historicalDelta!.diff);
  });

  it("shouldReturnNullDeltasWhenAColorHasNoDecidedGames", async () => {
    const r = await run({ gamesCount: 5, decidedCount: 5, wins: 3, whiteGames: 5, whiteDecided: 5, whiteWins: 3 });
    expect(r.chess.colorDelta).toBeNull();
  });
});

// ---- What-changed: each condition can block on its own (domain) -----------------------------------------
describe("what-changed gates are independent", () => {
  const ctx = { userId: "u1", baselineAt: SINCE, until: UNTIL };
  const clear = { diff: 30, lower: 5, upper: 55 }, wide = { diff: 30, lower: -5, upper: 65 };
  const d = (decidedCount: number, white: number, black: number, colorDelta: any): WhatChangedDeltas => ({
    chess: { gamesCount: decidedCount, decidedCount, ratingDelta: 0, baselineRating: null, currentRating: null, intervalWinRate: 50, intervalWhiteWinRate: white, intervalBlackWinRate: black, historicalWinRateDelta: null, colorDelta, historicalDelta: null },
    languages: { intervalDays: 7, xpGained: 0, sessionsCount: 0, totalSessionMinutes: 0, baselineCourseId: null, currentCourseId: null, courseChanged: false, dailyXpRate: 0, historicalDailyXpRate: 0 },
    streak: { baselineStreak: null, currentStreak: null, streakDelta: null, status: "active", streakStarted: false, streakMilestone: null },
  });
  const emits = (x: WhatChangedDeltas) => evaluateSignificantChanges(x, ctx).some((f) => f.id === "CHESS_COLOR_ASYMMETRY");

  it("shouldEmitWhenAllThreeConditionsHold", () => expect(emits(d(10, 65, 35, clear))).toBe(true));
  it("shouldBlockWhenOnlyTheSampleGateFails", () => expect(emits(d(9, 65, 35, clear))).toBe(false));
  it("shouldBlockWhenOnlyTheEffectThresholdFails", () => expect(emits(d(10, 55, 45, clear))).toBe(false));
  it("shouldBlockWhenOnlyTheIntervalIncludesZero", () => expect(emits(d(10, 65, 35, wide))).toBe(false));
  it("shouldBlockWhenThereIsNoInterval", () => expect(emits(d(10, 65, 35, null))).toBe(false));
});

// ---- Trajectory ------------------------------------------------------------------------------------------
// Per era per colour: n decided. White wins / black wins per era.
function input(n: number, ww: number, bw: number, h1?: [number, number], h2?: [number, number]): TrajectoryInput {
  const era = (w: number, b: number) => ({ whiteGames: n, whiteDecided: n, whiteWins: w, blackGames: n, blackDecided: n, blackWins: b });
  const [a1, b1] = h1 ?? [ww, bw], [a2, b2] = h2 ?? [ww, bw];
  return {
    chess: {
      startedAt: "2026-05-01T00:00:00.000Z", endedAt: "2026-09-01T00:00:00.000Z", totalGames: 4 * n, activeDays: 75,
      whiteGames: 2 * n, whiteDecided: 2 * n, whiteWins: a1 + a2, blackGames: 2 * n, blackDecided: 2 * n, blackWins: b1 + b2,
      h1: era(a1, b1), h2: era(a2, b2),
    },
    languages: { startedAt: null, endedAt: null, activeDays: 0, h1: { courses: [] }, h2: { courses: [] } },
  };
}
const asymmetry = (i: TrajectoryInput) => evaluateTrajectoryPatterns(i).find((f) => f.type === "CHESS_COLOR_ASYMMETRY_LONGITUDINAL");

describe("trajectory color asymmetry: n + effect + interval on the global difference", () => {
  it("shouldEmitWhenFortyVsFortyHasTwentyFivePointGap", () => {
    // 20/era/colour: white 15+15=30/40, black 10+10=20/40
    const f = asymmetry(input(20, 15, 10));
    expect(f).toBeDefined();
    expect(f!.metrics).toMatchObject({ diffPp: 25 });
    const ci = (f!.metrics as any).diffCi;
    expect(ci.diff).toBeCloseTo(25, 6); expect(ci.lower).toBeCloseTo(3.8, 1); expect(ci.upper).toBeCloseTo(43.3, 1);
  });

  it("shouldNotEmitWhenFortyVsFortyHasOnlyFifteenPointGapDespiteMeetingTheEraThresholds", () => {
    // white 26/40, black 20/40 (+15pp); each era keeps its own >= 10pp gap, so only the interval blocks.
    expect(asymmetry(input(20, 13, 10, [14, 10], [12, 10]))).toBeUndefined();
  });

  it("shouldKeepEraThresholdsWithoutIntervalWhenTheGlobalIntervalExcludesZero", () => {
    // Clear global gap (30/40 vs 20/40) but the second era is under 10pp: the existing persistence rule still blocks.
    expect(asymmetry(input(20, 15, 10, [20, 10], [10, 10]))).toBeUndefined();
  });
});
