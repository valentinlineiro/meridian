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
