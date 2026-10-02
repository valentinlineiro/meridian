import { describe, expect, it } from "vitest";
import { median } from "../src/analytics/median.ts";

describe("median", () => {
  it("shouldAverageTwoCentralValuesForEvenSizedSample", () => {
    expect(median([20, 60, 70, 90])).toBe(65);
  });

  it("shouldReturnCentralValueForOddSizedSample", () => {
    expect(median([90, 20, 70])).toBe(70);
  });
});
