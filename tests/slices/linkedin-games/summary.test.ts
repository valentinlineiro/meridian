import { describe, it, expect } from "vitest";
import { summarize } from "../../../src/slices/linkedin-games/domain/GameStats.ts";
import type { DayRecord } from "../../../src/slices/linkedin-games/domain/LinkedinGames.ts";

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const entry = (score: number, avg?: number) => ({ number: null, score: `0:${score}`, scoreSeconds: score, ...(avg !== undefined ? { avg: `0:${avg}`, avgSeconds: avg } : {}) });
const day = (date: string, games: Record<string, unknown>): DayRecord => ({ schema: 1, date, games });
// one record per day for `count` days ending at `end`, game `g`, built by `make(i)` where i=0 is the oldest
const run = (g: string, end: string, count: number, make: (i: number) => ReturnType<typeof entry>) =>
  Array.from({ length: count }, (_, i) => day(addDays(end, i - count + 1), { [g]: make(i) }));

const TODAY = "2026-11-03";

describe("summarize", () => {
  it("shouldReturnEmptySummaryWhenThereAreNoDays", () => {
    expect(summarize([], TODAY)).toEqual({ days: 0, from: null, to: null, playStreak: { current: 0, max: 0 }, games: {} });
  });

  it("shouldComputeEfficiencyAsAvgOverScoreWhenBothPresent", () => {
    const s = summarize([day(TODAY, { zip: entry(10, 25) })], TODAY);
    expect(s.games.zip!.series).toEqual([{ date: TODAY, eff: 2.5, roll: 2.5 }]);
  });

  it("shouldIgnoreGamesWithoutAvgInEfficiencyAndBeatRateButKeepThemForBestMark", () => {
    const s = summarize([day("2026-11-02", { zip: entry(9) }), day(TODAY, { zip: entry(10, 20) })], TODAY);
    const z = s.games.zip!;
    expect([z.n, z.nWithAvg, z.beatAvgRate, z.series.length]).toEqual([2, 1, 1, 1]);
    expect(z.best).toEqual({ seconds: 9, date: "2026-11-02" });
  });

  it("shouldCountATieAsNotBeatingTheAverage", () => {
    expect(summarize([day(TODAY, { zip: entry(20, 20) })], TODAY).games.zip!.beatAvgRate).toBe(0);
  });

  it("shouldSkipUnplayedGamesAndTakeTheEarliestDateForTheBestMark", () => {
    const s = summarize([day("2026-11-01", { zip: entry(8, 20) }), day("2026-11-02", { zip: { unplayed: true } }), day(TODAY, { zip: entry(8, 20) })], TODAY);
    expect(s.games.zip!.n).toBe(2);
    expect(s.games.zip!.best).toEqual({ seconds: 8, date: "2026-11-01" });
  });

  it("shouldBreakTheDayStreakWhenADateIsMissing", () => {
    const days = [...run("zip", "2026-10-20", 5, () => entry(10, 20)), ...run("zip", TODAY, 3, () => entry(10, 20))];
    expect(summarize(days, TODAY).playStreak).toEqual({ current: 3, max: 5 });
  });

  it("shouldKeepTheStreakAliveWhenLastDateIsYesterdayAndDropItWhenOlder", () => {
    const days = run("zip", "2026-11-02", 4, () => entry(10, 20));
    expect(summarize(days, TODAY).playStreak.current).toBe(4);
    expect(summarize(days, "2026-11-04").playStreak.current).toBe(0);
    expect(summarize(days, "2026-11-04").playStreak.max).toBe(4);
  });

  it("shouldBreakTheGameStreakWhenADayHasNoAvgOrDoesNotBeatIt", () => {
    const days = run("zip", TODAY, 6, (i) => (i === 2 ? entry(10) : i === 4 ? entry(30, 20) : entry(10, 20)));
    const z = summarize(days, TODAY).games.zip!;
    expect(z.beatStreak).toEqual({ current: 1, max: 2 });
  });

  it("shouldBreakTheGameStreakWhenThatGameWasNotRecordedOnADayOthersWere", () => {
    const days = [day("2026-11-01", { zip: entry(10, 20) }), day("2026-11-02", { tango: entry(10, 20) }), day(TODAY, { zip: entry(10, 20) })];
    expect(summarize(days, TODAY).games.zip!.beatStreak).toEqual({ current: 1, max: 1 });
    expect(summarize(days, TODAY).playStreak).toEqual({ current: 3, max: 3 });
  });

  it("shouldReportChangeAgainstThePreviousWindowWhenBothWindowsHaveData", () => {
    const days = [...run("tango", addDays(TODAY, -28), 10, () => entry(10, 20)), ...run("tango", TODAY, 10, () => entry(10, 16))];
    const e = summarize(days, TODAY).games.tango!.efficiency;
    expect(e.prev28).toBe(2);
    expect(e.last28).toBe(1.6);
    expect(e.change).toBeCloseTo(-0.2, 10);
  });

  // The 10 % rule (>= 10 % drop, >= 10 samples) is retired (P1): `regression` now only mirrors the calibrated label.
  it("shouldNotFlagRegressionForATenPercentDropThatIsInsideTheNoise", () => {
    const days = [...run("zip", addDays(TODAY, -28), 10, () => entry(10, 20)), ...run("zip", TODAY, 10, () => entry(10, 18))];
    expect(summarize(days, TODAY).games.zip!.regression).toBe(false);
  });

  it("shouldKeepTheRegressionFlagEqualToTheDeteriorationLabel", () => {
    const g = summarize(run("zip", TODAY, 40, () => entry(10, 20)), TODAY).games.zip!;
    expect(g.regression).toBe(g.interpretation.label === "deterioro");
  });

  it("shouldLeaveChangeNullWhenThereIsNoPreviousWindow", () => {
    const e = summarize(run("tango", TODAY, 12, () => entry(10, 20)), TODAY).games.tango!.efficiency;
    expect(e).toMatchObject({ last28: 2, prev28: null, change: null });
  });

  it("shouldKeepOnePointPerDayAndUseARollingMedianOverTheLast28Days", () => {
    const days = run("zip", TODAY, 3, (i) => entry(10, [20, 40, 30][i]!));
    const s = summarize(days, TODAY).games.zip!.series;
    expect(s.map((p) => p.eff)).toEqual([2, 4, 3]);
    expect(s.map((p) => p.roll)).toEqual([2, 3, 3]);
  });
});
