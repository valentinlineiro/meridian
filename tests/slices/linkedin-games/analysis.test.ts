import { describe, it, expect } from "vitest";
import { summarize } from "../../../src/slices/linkedin-games/domain/GameStats.ts";
import type { DayRecord } from "../../../src/slices/linkedin-games/domain/LinkedinGames.ts";

const TODAY = "2026-11-03"; // a Tuesday
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const entry = (score: number, avg?: number) => ({ number: null, score: `0:${score}`, scoreSeconds: score, ...(avg !== undefined ? { avg: `0:${avg}`, avgSeconds: avg } : {}) });
const day = (date: string, games: Record<string, unknown>): DayRecord => ({ schema: 1, date, games });
// consecutive days ending at `end` (i = 0 is the oldest)
const run = (end: string, count: number, make: (i: number) => ReturnType<typeof entry>, g = "zip") =>
  Array.from({ length: count }, (_, i) => day(addDays(end, i - count + 1), { [g]: make(i) }));
const zip = (days: DayRecord[], today = TODAY) => summarize(days, today).games.zip!;

describe("window metrics", () => {
  it("shouldComputeTheWindowMedianEfficiencyWhenThereAreObservations", () => {
    const w = zip(run(TODAY, 3, (i) => entry(10, [20, 40, 30][i]!))).windows["28"]!;
    expect(w.eff).toEqual({ median: 3, nEff: 3 });
    expect(w.beat).toEqual({ rate: 1, k: 3, nBeat: 3 });
  });

  it("shouldReturnNullRatesWhenTheWindowHasNoObservations", () => {
    const w = zip([day("2026-06-01", { zip: entry(10, 20) })]).windows["7"]!;
    expect(w.eff).toEqual({ median: null, nEff: 0 });
    expect(w.beat).toEqual({ rate: null, k: 0, nBeat: 0 });
    expect(w.time).toEqual({ median: null, p25: null, p75: null, nTime: 0 });
  });

  it("shouldInterpolatePercentilesLinearly", () => {
    // 10,20,30,40,50: R-7 → p25 at h=1 (20), median 30, p75 at h=3 (40)
    expect(zip(run(TODAY, 5, (i) => entry(10 * (i + 1), 100))).windows["28"]!.time).toEqual({ median: 30, p25: 20, p75: 40, nTime: 5 });
    // 10,20,30,40: p25 at h=0.75 → 17.5, median 25, p75 at h=2.25 → 32.5
    expect(zip(run(TODAY, 4, (i) => entry(10 * (i + 1), 100))).windows["28"]!.time).toEqual({ median: 25, p25: 17.5, p75: 32.5, nTime: 4 });
  });

  it("shouldUseTheValueForAllPercentilesWhenThereIsASingleObservation", () => {
    expect(zip([day(TODAY, { zip: entry(12, 24) })]).windows["28"]!.time).toEqual({ median: 12, p25: 12, p75: 12, nTime: 1 });
  });

  it("shouldCountAnObservationWithoutAvgInTimeButNotInEfficiency", () => {
    const w = zip([day("2026-11-02", { zip: entry(9) }), day(TODAY, { zip: entry(10, 20) })]).windows["28"]!;
    expect(w.time.nTime).toBe(2);
    expect([w.eff.nEff, w.beat.nBeat]).toEqual([1, 1]);
  });

  it("shouldCountATieAsNotBeatingTheAverage", () => {
    expect(zip([day(TODAY, { zip: entry(20, 20) })]).windows["28"]!.beat).toEqual({ rate: 0, k: 0, nBeat: 1 });
  });

  it("shouldKeepWindowBoundariesAtTodayMinusWExclusiveAndTodayInclusive", () => {
    const days = [day(addDays(TODAY, -7), { zip: entry(10, 20) }), day(addDays(TODAY, -6), { zip: entry(10, 20) }), day(TODAY, { zip: entry(10, 20) })];
    expect(zip(days).windows["7"]!.eff.nEff).toBe(2); // -7 is outside (today-7, today]
    expect(zip(days).windows["28"]!.eff.nEff).toBe(3);
  });

  it("shouldExposeAllAsTheWholeHistoryWithoutAPreviousWindow", () => {
    const g = zip([day("2026-05-17", { zip: entry(10, 20) }), day(TODAY, { zip: entry(10, 30) })]);
    expect(g.windows.all!.eff.nEff).toBe(2);
    expect(g.windows.all!.prev).toBeNull();
    expect(g.windows.all!.delta).toBeNull();
  });

  it("shouldKeepTheExistingSummaryFieldsUnchangedAndConsistentWith28DayWindow", () => {
    const g = zip(run(TODAY, 10, () => entry(10, 20)));
    expect(Object.keys(g)).toEqual(expect.arrayContaining(["n", "nWithAvg", "beatAvgRate", "efficiency", "best", "beatStreak", "regression", "series", "firstDate", "windows", "trajectory"]));
    expect(g.efficiency.last28).toBe(g.windows["28"]!.eff.median);
  });
});

describe("period comparison", () => {
  it("shouldNotCompareWhenThePreviousWindowIsNotFullyCovered", () => {
    // 20 days of data: the previous 28-day window starts 55 days back, before the first observation
    const g = zip(run(TODAY, 20, () => entry(10, 20)));
    expect(g.windows["28"]!.prev).toBeNull();
    expect(g.windows["28"]!.delta).toBeNull();
  });

  it("shouldCompareWhenTheFirstObservationIsOnTheFirstDayOfThePreviousWindow", () => {
    const first = addDays(TODAY, -55); // previous window = (today-56, today-28] → first day is today-55
    const g = zip([day(first, { zip: entry(10, 20) }), day(TODAY, { zip: entry(10, 20) })]);
    expect(g.windows["28"]!.prev).not.toBeNull();
    expect(zip([day(addDays(TODAY, -54), { zip: entry(10, 20) }), day(TODAY, { zip: entry(10, 20) })]).windows["28"]!.prev).toBeNull();
  });

  it("shouldReportRelativeEfficiencyAndPercentagePointDeltasWithTheirSampleSizes", () => {
    const days = [...run(addDays(TODAY, -28), 10, () => entry(10, 20)), ...run(TODAY, 10, () => entry(10, 16))];
    days.splice(0, 0, day(addDays(TODAY, -55), { zip: entry(10, 20) })); // covers the previous window
    const w = zip(days).windows["28"]!;
    expect(w.delta!.effRel.value).toBeCloseTo(-0.2, 10);
    expect(w.delta!.effRel).toMatchObject({ nCur: 10, nPrev: 11 });
    expect(w.delta!.beatPp.value).toBeCloseTo(0, 10); // both windows always beat the average
    expect(w.delta!.medianSec).toEqual({ value: 0, nCur: 10, nPrev: 11 });
  });

  it("shouldReportPercentagePointDifferenceBetweenBeatRates", () => {
    const prev = run(addDays(TODAY, -28), 4, (i) => (i < 2 ? entry(10, 20) : entry(30, 20))); // 50 %
    const cur = run(TODAY, 4, (i) => (i < 3 ? entry(10, 20) : entry(30, 20))); // 75 %
    const w = zip([day(addDays(TODAY, -55), { zip: entry(10, 20) }), ...prev, ...cur]).windows["28"]!;
    expect(w.prev!.beat.rate).toBeCloseTo(0.6, 10); // 2 of 4 plus the covering day: 3 of 5
    expect(w.delta!.beatPp.value).toBeCloseTo((0.75 - 0.6) * 100, 6);
  });

  it("shouldLeaveTheDeltaValueNullWhenOneSideHasNoObservations", () => {
    const days = [day(addDays(TODAY, -55), { zip: entry(10, 20) }), day(TODAY, { zip: entry(10, 20) })];
    const w = zip(days).windows["28"]!; // previous window has data (the covering day)? it is at -55 → inside (-56,-28]
    expect(w.delta!.effRel.value).toBeCloseTo(0, 10);
    const none = zip([day(addDays(TODAY, -60), { zip: entry(10, 20) }), day(TODAY, { zip: entry(10, 20) })]).windows["28"]!;
    expect(none.prev!.eff).toEqual({ median: null, nEff: 0 });
    expect(none.delta!.effRel).toMatchObject({ value: null, nCur: 1, nPrev: 0 });
  });

  it("shouldKeepNEffNBeatAndNTimeSeparateInTheContract", () => {
    const w = zip([day("2026-11-02", { zip: entry(9) }), day(TODAY, { zip: entry(10, 20) })]).windows["28"]!;
    expect(Object.keys(w.eff)).toContain("nEff");
    expect(Object.keys(w.beat)).toContain("nBeat");
    expect(Object.keys(w.time)).toContain("nTime");
    expect(w.time.nTime).toBeGreaterThan(w.eff.nEff);
  });

  it("shouldCarryNCurAndNPrevInEveryDelta", () => {
    const w = zip([day(addDays(TODAY, -55), { zip: entry(10, 20) }), day(TODAY, { zip: entry(10, 20) })]).windows["28"]!;
    // P1 adds `arrow` and `band` to the effRel of the 28-day window only; every measured field stays
    for (const [k, d] of Object.entries(w.delta!)) expect(Object.keys(d).sort()).toEqual(k === "effRel" ? ["arrow", "band", "nCur", "nPrev", "value"] : ["nCur", "nPrev", "value"]);
  });
});

describe("trajectory", () => {
  it("shouldBucketByDayForShortRangesAndByIsoWeekForLongOnes", () => {
    const g = zip(run(TODAY, 40, () => entry(10, 20)));
    expect(g.trajectory["7"]).toHaveLength(7);
    expect(g.trajectory["28"]).toHaveLength(28);
    expect(g.trajectory["7"]![6]!.start).toBe(TODAY);
    for (const b of g.trajectory["90"]!) expect(new Date(`${b.start}T00:00:00Z`).getUTCDay()).toBe(1); // Mondays
    expect(g.trajectory["90"]!.at(-1)!.start).toBe("2026-11-02");
  });

  it("shouldEmitEmptyBucketsAsNullWithZeroNWithinCoverage", () => {
    const g = zip([day(addDays(TODAY, -5), { zip: entry(10, 20) }), day(TODAY, { zip: entry(10, 40) })]);
    const t = g.trajectory["7"]!;
    expect(t).toHaveLength(6); // from firstDate to today, dense
    expect(t[0]).toEqual({ start: addDays(TODAY, -5), n: 1, eff: 2, beat: 1 });
    expect(t[1]).toEqual({ start: addDays(TODAY, -4), n: 0, eff: null, beat: null });
    expect(t.at(-1)).toEqual({ start: TODAY, n: 1, eff: 4, beat: 1 });
  });

  it("shouldNotEmitBucketsBeforeTheFirstObservation", () => {
    const g = zip([day(addDays(TODAY, -2), { zip: entry(10, 20) })]);
    expect(g.trajectory["28"]!.map((b) => b.start)).toEqual([addDays(TODAY, -2), addDays(TODAY, -1), TODAY]);
  });

  it("shouldNotCreateObservationsForDaysWithoutPlay", () => {
    const g = zip([day(addDays(TODAY, -3), { zip: entry(10, 20) }), day(TODAY, { zip: entry(10, 20) })]);
    expect(g.windows["28"]!.eff.nEff).toBe(2);
    expect(g.trajectory["7"]!.filter((b) => b.n === 0)).toHaveLength(2);
  });

  it("shouldCountOnlyObservationsWithAvgInABucketAndKeepNullWhenNoneHasIt", () => {
    const g = zip([day(TODAY, { zip: entry(10) })]);
    expect(g.trajectory["7"]).toEqual([{ start: TODAY, n: 0, eff: null, beat: null }]);
  });

  it("shouldDrawTheRawBucketValueWithoutSmoothing", () => {
    const g = zip(run(TODAY, 3, (i) => entry(10, [20, 40, 30][i]!)));
    expect(g.trajectory["7"]!.map((b) => b.eff)).toEqual([2, 4, 3]);
  });

  it("shouldStartTheAllRangeAtTheFirstObservationWeek", () => {
    const g = zip([day("2026-05-20", { zip: entry(10, 20) }), day(TODAY, { zip: entry(10, 20) })]); // 2026-05-20 is a Wednesday
    expect(g.trajectory.all![0]!.start).toBe("2026-05-18");
    expect(g.trajectory.all!.at(-1)!.start).toBe("2026-11-02");
  });

  it("shouldExposeTheFirstDateAsTheStartOfCoverage", () => {
    expect(zip([day("2026-09-07", { zip: entry(10, 20) }), day(TODAY, { zip: entry(10, 20) })]).firstDate).toBe("2026-09-07");
  });
});

describe("contract shape", () => {
  it("shouldNotAddAnyRootLevelAllField", () => {
    const s = summarize(run(TODAY, 3, () => entry(10, 20)), TODAY);
    expect(Object.keys(s).sort()).toEqual(["days", "from", "games", "playStreak", "to", "weekdays"]);
  });

  it("shouldKeepAnAllKeyOnlyInsideWindowsAndTrajectory", () => {
    const g = zip(run(TODAY, 3, () => entry(10, 20)));
    expect(Object.keys(g.windows).sort()).toEqual(["28", "7", "90", "all"]);
    expect(Object.keys(g.trajectory).sort()).toEqual(["28", "7", "90", "all"]);
  });

  it("shouldReturnNoGamesAndNoErrorsWhenThereAreNoDays", () => {
    expect(summarize([], TODAY).games).toEqual({});
  });
});
