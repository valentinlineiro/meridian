import { describe, it, expect } from "vitest";
import { windowDelta, type MeasureSpec, type Observation } from "../src/domain/observation.ts";
import { getWhatChangedUseCase } from "../src/application/getWhatChangedUseCase.ts";
import type { WhatChangedPort } from "../src/ports/whatChangedPort.ts";

const obs = (key: string, measures: Record<string, number>, source = "s"): Observation => ({ key, source, observedAt: "2026-09-01T00:00:00.000Z", measures });
const higher: MeasureSpec = { measure: "m", unit: "", direction: "higher" };
const lower: MeasureSpec = { measure: "m", unit: "s", direction: "lower" };

describe("windowDelta", () => {
  it("shouldReportBetterWhenHigherIsBetterAndMeanRises", () => {
    expect(windowDelta([obs("a", { m: 1 }), obs("b", { m: 3 })], [obs("c", { m: 5 })], higher)).toEqual({ before: 2, after: 5, delta: 3, verdict: "better" });
  });

  it("shouldReportBetterWhenLowerIsBetterAndMeanFalls", () => {
    expect(windowDelta([obs("a", { m: 60 })], [obs("b", { m: 45 })], lower)).toMatchObject({ delta: -15, verdict: "better" });
  });

  it("shouldReportWorseWhenLowerIsBetterAndMeanRises", () => {
    expect(windowDelta([obs("a", { m: 45 })], [obs("b", { m: 60 })], lower).verdict).toBe("worse");
  });

  it("shouldReportUnchangedWhenMeansMatch", () => {
    expect(windowDelta([obs("a", { m: 2 })], [obs("b", { m: 2 })], higher).verdict).toBe("unchanged");
  });

  it("shouldReturnNullDeltaWhenEitherWindowLacksTheMeasure", () => {
    expect(windowDelta([], [obs("a", { m: 1 })], higher)).toEqual({ before: null, after: 1, delta: null, verdict: null });
    expect(windowDelta([obs("a", { other: 1 })], [obs("b", { m: 1 })], higher).delta).toBeNull();
  });

  it("shouldBehaveIdenticallyForAnySourceWhenMeasuresMatch", () => {
    const a = windowDelta([obs("1", { m: 1 }, "x")], [obs("2", { m: 2 }, "x")], higher);
    const b = windowDelta([obs("1", { m: 1 }, "y")], [obs("2", { m: 2 }, "y")], higher);
    expect(a).toEqual(b);
  });
});

// Characterisation: the generic delta reproduces the existing chess win-rate delta (percentage points).
describe("windowDelta vs existing chess win-rate delta", () => {
  const winRate: MeasureSpec = { measure: "win", unit: "%", direction: "higher" };
  const games = (wins: number, total: number, prefix: string) =>
    Array.from({ length: total }, (_, i) => obs(`${prefix}${i}`, { win: i < wins ? 1 : 0 }, "chess"));

  type Counts = [wins: number, total: number];
  it.each<{ lifetime: Counts; interval: Counts }>([
    { lifetime: [25, 50], interval: [6, 10] },
    { lifetime: [3, 7], interval: [1, 9] },
    { lifetime: [40, 40], interval: [0, 5] },
  ])("shouldMatchUseCaseWhenLifetime$lifetimeAndInterval$interval", async ({ lifetime, interval }) => {
    const port = {
      resolveUserId: async () => "u",
      getChessBaseline: async () => ({ status: "exactOrPrevious", data: { rating: 800, ratingAt: null, lifetimeGames: lifetime[1], lifetimeDecided: lifetime[1], lifetimeWins: lifetime[0], observedAt: "2026-09-24T00:00:00.000Z" } }),
      getChessInterval: async () => ({ gamesCount: interval[1], decidedCount: interval[1], wins: interval[0], whiteGames: 0, whiteDecided: 0, whiteWins: 0, blackGames: 0, blackDecided: 0, blackWins: 0, latestRating: 800, latestRatingAt: null }),
      getLanguagesBaseline: async () => ({ status: "unavailable", data: null }),
      getLanguagesTarget: async () => ({ status: "unavailable", data: null }),
      getLanguagesInterval: async () => ({ xpGained: 0, sessionsCount: 0, totalSessionMinutes: 0, daysWithActivity: 0 }),
      getHistoricalDailyXpRate: async () => 0,
    } as unknown as WhatChangedPort;
    const existing = await getWhatChangedUseCase(port, { since: "2026-09-24T00:00:00.000Z", until: "2026-10-01T00:00:00.000Z", userId: "u" });
    const generic = windowDelta(games(lifetime[0], lifetime[1], "p"), games(interval[0], interval[1], "i"), winRate);
    expect(generic.delta! * 100).toBeCloseTo(existing.chess.historicalWinRateDelta!, 9);
  });
});

// Second application: a synthetic daily-puzzle source where lower is better. Same function, no branching on source.
describe("windowDelta on a synthetic zip-like source", () => {
  const solveTime: MeasureSpec = { measure: "solveTime", unit: "seconds", direction: "lower" };
  const run = (key: string, seconds?: number) => obs(key, seconds === undefined ? {} : { solveTime: seconds }, "zip-like");
  const week1 = [run("d1", 80), run("d2", 100), run("d3", 90)]; // mean 90
  const faster = [run("d8", 60), run("d9", 70)]; // mean 65
  const slower = [run("d8", 110), run("d9", 130)]; // mean 120
  const same = [run("d8", 85), run("d9", 95)]; // mean 90

  it("shouldReportBetterWhenSolveTimeFalls", () => {
    expect(windowDelta(week1, faster, solveTime)).toEqual({ before: 90, after: 65, delta: -25, verdict: "better" });
  });

  it("shouldReportWorseWhenSolveTimeRises", () => {
    expect(windowDelta(week1, slower, solveTime)).toEqual({ before: 90, after: 120, delta: 30, verdict: "worse" });
  });

  it("shouldReportUnchangedWhenMeanSolveTimeMatches", () => {
    expect(windowDelta(week1, same, solveTime).verdict).toBe("unchanged");
  });

  it("shouldIgnoreRunsWithoutSolveTimeWhenAveraging", () => {
    expect(windowDelta([...week1, run("d4")], faster, solveTime)).toMatchObject({ before: 90, delta: -25 });
  });

  it("shouldReturnNullDeltaWhenWindowHasOnlyUnsolvedRuns", () => {
    expect(windowDelta(week1, [run("d8"), run("d9")], solveTime)).toEqual({ before: 90, after: null, delta: null, verdict: null });
  });
});
