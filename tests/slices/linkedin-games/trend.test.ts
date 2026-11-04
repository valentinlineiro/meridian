import { describe, it, expect } from "vitest";
import { recent28vBase56, spearman, theilSenSlope, trend112 } from "../../../src/slices/linkedin-games/domain/GameTrend.ts";
import type { Obs } from "../../../src/slices/linkedin-games/domain/GameAnalysis.ts";

const TODAY = "2026-11-03";
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
// offset 0..111 inside the 112-day window: offset 111 is today
const at = (offset: number) => addDays(TODAY, offset - 111);
const obs = (offset: number, score: number, avg: number | null): Obs => ({ date: at(offset), score, avg });

// Reference values computed with scipy.stats.spearmanr and scipy.stats.theilslopes on exactly these inputs.
const REF = {
  x: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], y: [2.0, 2.0, 3.5, 1.0, 3.5, 5.0, 5.0, 4.0, 6.0, 7.5], rho: 0.8746545467392752, slope: 0.5714285714285714,
  days: [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 19, 23, 24, 25, 26, 27, 28, 29, 30, 32, 33, 34, 35, 38, 40, 41, 42, 44, 45, 47, 48, 49, 51, 52, 53, 54, 56, 57, 59, 60, 61, 62, 65, 66, 67, 71, 72, 73, 74, 75, 77, 78, 79, 80, 81, 82, 83, 87, 88, 89, 90, 92, 93, 94, 95, 96, 97, 100, 101, 102, 103, 104, 105, 106, 111],
  score: [20, 26, 8, 13, 10, 21, 17, 26, 26, 24, 9, 21, 19, 22, 9, 29, 12, 16, 12, 21, 24, 8, 17, 27, 9, 22, 15, 27, 14, 20, 11, 29, 21, 12, 18, 12, 20, 27, 15, 21, 29, 28, 14, 8, 23, 28, 23, 17, 9, 28, 9, 10, 12, 24, 25, 16, 25, 19, 12, 23, 18, 28, 18, 13, 19, 14, 11, 23, 29, 12, 9, 12, 16, 16, 23, 10, 20, 15, 16, 28],
  avg: [24, 53, 33, 56, 55, 25, 46, 24, 42, 24, 43, 58, 46, 35, 25, 20, 49, 47, 41, 43, 46, 10, 54, 56, 40, 17, 25, 27, 27, 34, 16, 29, 55, 18, 20, 56, 39, 36, 26, 39, 28, 15, 23, 58, 58, 50, 13, 33, 48, 21, 34, 42, 50, 28, 41, 29, 42, 24, 59, 22, 57, 46, 14, 23, 32, 25, 10, 13, 43, 54, 36, 29, 19, 27, 19, 56, 58, 54, 44, 52],
  trendRho: -0.05021332463674406, trendPct: -3.2983631110154676, recentDelta: 0.04557207498383966, nCur: 18, nBase: 41,
};
const refObs = (): Obs[] => REF.days.map((d, i) => obs(d, REF.score[i]!, REF.avg[i]!));

describe("spearman and theilSenSlope", () => {
  it("shouldMatchScipyWhenThereAreTies", () => {
    expect(spearman(REF.x, REF.y)).toBeCloseTo(REF.rho, 12);
    expect(theilSenSlope(REF.x, REF.y)).toBeCloseTo(REF.slope, 12);
  });

  it("shouldReturnZeroWhenTheSeriesIsConstant", () => {
    expect(spearman([1, 2, 3, 4], [5, 5, 5, 5])).toBe(0);
  });

  it("shouldReturnPlusOneWhenTheSeriesRisesMonotonically", () => {
    expect(spearman([1, 2, 3, 4, 5], [1, 4, 9, 16, 25])).toBeCloseTo(1, 12);
  });
});

describe("trend112", () => {
  it("shouldMatchScipyOnTheReferenceWindow", () => {
    const t = trend112(refObs(), TODAY)!;
    expect(t.n).toBe(REF.days.length);
    expect(t.days).toBe(112);
    expect(t.rho).toBeCloseTo(REF.trendRho, 10);
    expect(t.slopePctPer28d).toBeCloseTo(REF.trendPct, 8);
  });

  it("shouldBeNullWhenFewerThan68DaysHaveAnObservationAndExistWhenThereAre68", () => {
    const make = (n: number) => Array.from({ length: n }, (_, i) => obs(i, 10, 10 + (i % 7)));
    expect(trend112(make(67), TODAY)).toBeNull();
    expect(trend112(make(68), TODAY)).not.toBeNull();
  });

  it("shouldOnlyLookAtTheLast112DaysEdgesIncluded", () => {
    const base = Array.from({ length: 68 }, (_, i) => obs(i + 1, 10, 20)); // offsets 1..68
    expect(trend112([obs(-1, 10, 30), ...base], TODAY)!.n).toBe(68); // offset -1 = today - 112: outside (today-112, today]
    expect(trend112([obs(0, 10, 30), ...base], TODAY)!.n).toBe(69); // offset 0 = today - 111: inside
  });

  it("shouldIgnoreObservationsWithoutAnAverageAndFutureDays", () => {
    const base = Array.from({ length: 68 }, (_, i) => obs(i, 10, 20));
    const t = trend112([...base, obs(70, 10, null), { date: addDays(TODAY, 1), score: 10, avg: 50 }], TODAY)!;
    expect(t.n).toBe(68);
  });

  it("shouldReportAPositiveSlopeAndRhoOneWhenEfficiencyGrowsEveryDay", () => {
    const grow = Array.from({ length: 112 }, (_, i) => obs(i, 10, 10 + i)); // eff 1.0 .. 12.1
    const t = trend112(grow, TODAY)!;
    expect(t.rho).toBeCloseTo(1, 12);
    expect(t.slopePctPer28d).toBeGreaterThan(0);
  });

  it("shouldBeDeterministic", () => {
    expect(trend112(refObs(), TODAY)).toEqual(trend112(refObs(), TODAY));
  });
});

describe("recent28vBase56", () => {
  it("shouldMatchTheReferenceMedians", () => {
    const r = recent28vBase56(refObs(), TODAY)!;
    expect(r.delta).toBeCloseTo(REF.recentDelta, 12);
    expect([r.nCur, r.nBase]).toEqual([REF.nCur, REF.nBase]);
  });

  it("shouldNeed17RecentAnd34BaselineObservations", () => {
    const mk = (cur: number, base: number) => [
      ...Array.from({ length: base }, (_, i) => obs(28 + i, 10, 20)), // baseline offsets 28..83
      ...Array.from({ length: cur }, (_, i) => obs(84 + i, 10, 25)), // recent offsets 84..111
    ];
    expect(recent28vBase56(mk(16, 34), TODAY)).toBeNull();
    expect(recent28vBase56(mk(17, 33), TODAY)).toBeNull();
    expect(recent28vBase56(mk(17, 34), TODAY)).toEqual({ delta: 0.25, nCur: 17, nBase: 34 });
  });

  it("shouldSplitTheWindowsAtTodayMinus28", () => {
    const rows = [...Array.from({ length: 34 }, (_, i) => obs(28 + i, 10, 20)), ...Array.from({ length: 17 }, (_, i) => obs(84 + i, 10, 25)), obs(83, 10, 20), obs(27, 10, 99)];
    const r = recent28vBase56(rows, TODAY)!; // offset 83 is the last baseline day; offset 27 is before the baseline
    expect([r.nCur, r.nBase]).toEqual([17, 35]);
  });
});
