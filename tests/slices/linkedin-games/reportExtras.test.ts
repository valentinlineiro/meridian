import { describe, it, expect } from "vitest";
import { summarize } from "../../../src/slices/linkedin-games/domain/GameStats.ts";
import type { DayRecord } from "../../../src/slices/linkedin-games/domain/LinkedinGames.ts";

// Phase 2 of the individual game report (docs/superpowers/specs/2026-11-10-games-individual-report-design.md §5):
// additive fields on GameSummary. Efficiency = avg / own time; a day "saves" avg - own seconds.
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const entry = (score: number, avg?: number) => ({ number: null, score: `0:${score}`, scoreSeconds: score, ...(avg !== undefined ? { avg: `0:${avg}`, avgSeconds: avg } : {}) });
const day = (date: string, games: Record<string, unknown>): DayRecord => ({ schema: 1, date, games });
const run = (end: string, count: number, make: (i: number) => ReturnType<typeof entry>) =>
  Array.from({ length: count }, (_, i) => day(addDays(end, i - count + 1), { zip: make(i) }));
const TODAY = "2026-11-03"; // a Tuesday
const zip = (days: DayRecord[]) => summarize(days, TODAY).games.zip!;

describe("weekly series in seconds", () => {
  it("shouldGroupByMondayWithOwnAndReferenceMedianSecondsWhenThereAreSeveralWeeks", () => {
    const z = zip([day("2026-10-26", { zip: entry(10, 20) }), day("2026-10-28", { zip: entry(20, 20) }), day("2026-11-02", { zip: entry(5, 20) })]);
    expect(z.weekly).toEqual([
      { weekStart: "2026-10-26", n: 2, nWithAvg: 2, medianSec: 15, medianAvgSec: 20, medianEff: 1.5 },
      { weekStart: "2026-11-02", n: 1, nWithAvg: 1, medianSec: 5, medianAvgSec: 20, medianEff: 4 },
    ]);
  });

  it("shouldLeaveReferenceAndEfficiencyNullInAWeekWithoutAnyAverage", () => {
    const z = zip([day("2026-11-02", { zip: entry(9) })]);
    expect(z.weekly).toEqual([{ weekStart: "2026-11-02", n: 1, nWithAvg: 0, medianSec: 9, medianAvgSec: null, medianEff: null }]);
  });
});

describe("savings against the published average", () => {
  it("shouldGiveMedianAndTotalSecondsSavedOverTheDaysWithAnAverage", () => {
    const z = zip([day("2026-10-26", { zip: entry(10, 20) }), day("2026-10-28", { zip: entry(20, 20) }), day("2026-11-02", { zip: entry(5, 20) }), day("2026-11-01", { zip: entry(9) })]);
    expect(z.savings).toEqual({ medianSec: 10, totalSec: 25, n: 3 });
  });

  it("shouldBeNegativeWhenSlowerThanTheAverageAndNullWithoutAnyAverage", () => {
    expect(zip([day(TODAY, { zip: entry(30, 20) })]).savings).toEqual({ medianSec: -10, totalSec: -10, n: 1 });
    expect(zip([day(TODAY, { zip: entry(30) })]).savings).toBeNull();
  });
});

describe("spread of efficiency", () => {
  it("shouldGiveP25P75AndTheirRatioWithTheSampleSize", () => {
    const z = zip([day("2026-10-26", { zip: entry(10, 20) }), day("2026-10-28", { zip: entry(20, 20) }), day("2026-11-02", { zip: entry(5, 20) })]);
    expect(z.effSpread).toEqual({ p25: 1.5, p75: 3, ratio: 2, n: 3 });
  });

  it("shouldBeNullWhenNoDayHasAnAverage", () => {
    expect(zip([day(TODAY, { zip: entry(10) })]).effSpread).toBeNull();
  });
});

describe("outlier days by efficiency (log scale, modified z-score > 3.5, at least 20 days)", () => {
  const base = (i: number) => entry(10, 20 + (i % 3)); // efficiency 2.0, 2.1, 2.2

  it("shouldSeparateUnusuallyGoodAndBadDaysByEfficiency", () => {
    const days = run(TODAY, 24, (i) => (i === 5 ? entry(2, 20) : i === 7 ? entry(40, 20) : base(i)));
    const o = zip(days).outliers;
    expect(o.n).toBe(24);
    expect(o.minN).toBe(20);
    expect(o.good).toEqual([{ date: addDays(TODAY, 5 - 23), eff: 10 }]);
    expect(o.bad).toEqual([{ date: addDays(TODAY, 7 - 23), eff: 0.5 }]);
  });

  it("shouldFlagNothingBelowTheMinimumSampleEvenWithAnExtremeDay", () => {
    const o = zip(run(TODAY, 5, (i) => (i === 2 ? entry(1, 20) : base(i)))).outliers;
    expect(o).toEqual({ n: 5, minN: 20, good: [], bad: [] });
  });

  it("shouldFlagNothingWhenEveryDayIsTheSameBecauseTheSpreadIsZero", () => {
    const o = zip(run(TODAY, 24, () => entry(10, 20))).outliers;
    expect([o.good, o.bad]).toEqual([[], []]);
  });
});

describe("date of the longest streak beating the average", () => {
  it("shouldReportTheLastDayOfTheLongestRun", () => {
    const beat = entry(10, 20), lose = entry(30, 20);
    const z = zip(run(TODAY, 8, (i) => (i === 5 ? lose : beat))); // days 10-27..11-03: five beats, a loss, two beats
    expect(z.beatStreak).toEqual({ current: 2, max: 5, maxDate: "2026-10-31" });
  });

  it("shouldHaveNoDateWhenThereIsNoRunAtAll", () => {
    expect(zip([day(TODAY, { zip: entry(30, 20) })]).beatStreak).toEqual({ current: 0, max: 0, maxDate: null });
  });
});
