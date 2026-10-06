import { describe, it, expect } from "vitest";
import { wilson, Z_95 } from "../src/domain/proportion.ts";
import { summarize } from "../src/domain/result.ts";

describe("wilson", () => {
  it.each([[0, 10, 0, 0.278], [5, 10, 0.237, 0.763], [10, 10, 0.722, 1]])("shouldMatchReferenceIntervalWhen%i/%i", (w, n, lo, hi) => {
    const ci = wilson(w, n)!;
    expect(ci.lower).toBeCloseTo(lo, 3);
    expect(ci.upper).toBeCloseTo(hi, 3);
    expect(ci.p).toBe(w / n);
  });

  it("shouldReturnNullWhenNothingDecided", () => expect(wilson(0, 0)).toBeNull());

  it("shouldPinBoundsExactlyAtTheEdges", () => {
    expect(wilson(0, 7)!.lower).toBe(0);
    expect(wilson(0, 7)!.upper).toBeGreaterThan(0);
    expect(wilson(7, 7)!.upper).toBe(1);
    expect(wilson(7, 7)!.lower).toBeLessThan(1);
  });

  it.each([[-1, 5], [6, 5], [1, 2.5], [1, -3], [NaN, 5]])("shouldThrowRangeErrorWhen%i/%i", (w, n) => {
    expect(() => wilson(w, n)).toThrow(RangeError);
  });

  it("shouldKeepLimitsInUnitIntervalAndAroundPointEstimate", () => {
    for (let n = 1; n <= 60; n++) for (let w = 0; w <= n; w++) {
      const { p, lower, upper } = wilson(w, n)!;
      expect(lower).toBeGreaterThanOrEqual(0);
      expect(upper).toBeLessThanOrEqual(1);
      expect(lower).toBeLessThanOrEqual(p + 1e-12);
      expect(upper).toBeGreaterThanOrEqual(p - 1e-12);
    }
  });

  it("shouldUseTheNinetyFivePercentConstant", () => expect(Z_95).toBe(1.96));
});

describe("summarize winRateCi", () => {
  const rows = (...r: string[]) => r.map((result) => ({ result }));

  it("shouldDeriveIntervalFromDecidedGamesOnly", () => {
    const s = summarize(rows("win", "win", "loss", "draw", "garbage", "garbage"));
    expect(s.winRateCi).toEqual({ lower: wilson(2, 4)!.lower, upper: wilson(2, 4)!.upper });
    expect(s.winRateCi!.lower).toBeLessThanOrEqual(s.winRate!);
    expect(s.winRateCi!.upper).toBeGreaterThanOrEqual(s.winRate!);
  });

  it("shouldReturnNullIntervalWhenNothingDecided", () => {
    expect(summarize([]).winRateCi).toBeNull();
    expect(summarize(rows("garbage")).winRateCi).toBeNull();
  });
});

import { newcombeDiff, distinguishable, scaleDelta } from "../src/domain/proportion.ts";

describe("newcombeDiff", () => {
  const pp = (d: any) => [d.diff, d.lower, d.upper].map((v: number) => Math.round(v * 1000) / 10);

  it.each([
    ["what-changed 4/5 vs 2/5", { wins: 4, n: 5 }, { wins: 2, n: 5 }, [40, -16.3, 72.6]],
    ["trajectory +25pp 30/40 vs 20/40", { wins: 30, n: 40 }, { wins: 20, n: 40 }, [25, 3.8, 43.3]],
    ["trajectory +15pp 26/40 vs 20/40", { wins: 26, n: 40 }, { wins: 20, n: 40 }, [15, -6.4, 34.6]],
    ["demo form 13/20 vs 25/40", { wins: 13, n: 20 }, { wins: 25, n: 40 }, [2.5, -23, 25.4]],
  ] as Array<[string, any, any, [number, number, number]]>)("shouldMatchContractCase %s", (_n, a, b, [d, lo, hi]) => {
    const r = pp(newcombeDiff(a as any, b as any));
    expect(r[0]).toBeCloseTo(d, 1); expect(r[1]).toBeCloseTo(lo, 1); expect(r[2]).toBeCloseTo(hi, 1);
  });

  it("shouldBeAntisymmetricWhenGroupsAreSwapped", () => {
    const ab = newcombeDiff({ wins: 7, n: 13 }, { wins: 30, n: 90 })!, ba = newcombeDiff({ wins: 30, n: 90 }, { wins: 7, n: 13 })!;
    expect(ba.diff).toBeCloseTo(-ab.diff, 12); expect(ba.lower).toBeCloseTo(-ab.upper, 12); expect(ba.upper).toBeCloseTo(-ab.lower, 12);
  });

  it("shouldReturnNullWhenEitherGroupIsEmpty", () => {
    expect(newcombeDiff({ wins: 0, n: 0 }, { wins: 1, n: 2 })).toBeNull();
    expect(newcombeDiff({ wins: 1, n: 2 }, { wins: 0, n: 0 })).toBeNull();
  });
});

describe("distinguishable", () => {
  it("shouldRequireTheIntervalToExcludeZeroStrictly", () => {
    expect(distinguishable({ diff: 1, lower: 0.1, upper: 2 })).toBe(true);
    expect(distinguishable({ diff: -1, lower: -2, upper: -0.1 })).toBe(true);
    expect(distinguishable({ diff: 1, lower: 0, upper: 2 })).toBe(false);
    expect(distinguishable({ diff: 1, lower: -1, upper: 3 })).toBe(false);
    expect(distinguishable(null)).toBe(false);
  });

  it("shouldScaleEveryFieldOfADelta", () => {
    expect(scaleDelta({ diff: 0.1, lower: -0.2, upper: 0.3 }, 100)).toEqual({ diff: 10, lower: -20, upper: 30 });
    expect(scaleDelta(null, 100)).toBeNull();
  });
});
