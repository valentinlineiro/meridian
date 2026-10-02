import { describe, it, expect } from "vitest";
import { classifyPhase } from "../src/analytics/phases.ts";

describe("classifyPhase", () => {
  it("shouldClassifyUnknownForZeroOrNegativeOrInvalidPlies", () => {
    expect(classifyPhase(0)).toBe("unknown");
    expect(classifyPhase(-5)).toBe("unknown");
    expect(classifyPhase(NaN)).toBe("unknown");
  });

  it("shouldClassifyOpeningForPliesUnderForty", () => {
    expect(classifyPhase(1)).toBe("opening");
    expect(classifyPhase(20)).toBe("opening");
    expect(classifyPhase(39)).toBe("opening");
  });

  it("shouldClassifyMiddlegameForPliesBetweenFortyAndEighty", () => {
    expect(classifyPhase(40)).toBe("middlegame");
    expect(classifyPhase(60)).toBe("middlegame");
    expect(classifyPhase(80)).toBe("middlegame");
  });

  it("shouldClassifyEndgameForPliesAboveEighty", () => {
    expect(classifyPhase(81)).toBe("endgame");
    expect(classifyPhase(120)).toBe("endgame");
    expect(classifyPhase(250)).toBe("endgame");
  });
});
