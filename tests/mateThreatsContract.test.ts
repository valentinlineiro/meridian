import { describe, it, expect } from "vitest";
import { assertMateThreatsInvariants, InvalidMateThreats, readMateThreats, type MateThreatsOk } from "../src/domain/mateThreats.ts";

const ok = (over: Partial<MateThreatsOk> = {}): MateThreatsOk => ({
  faced: 3, neutralized: 1, missed: 1, unpunished: 1,
  byPhase: { opening: [1, 1, 0], middlegame: [0, 0, 1], endgame: [0, 0, 0] }, missedPlies: [6], ...over,
});
const black = { plyCount: 40, userColor: "black" as const }; // black moves on even plies

describe("assertMateThreatsInvariants", () => {
  it("shouldAcceptAConsistentResult", () => {
    expect(() => assertMateThreatsInvariants(ok(), black)).not.toThrow();
  });

  it("shouldRejectWhenFacedIsNotTheSumOfTheThreeOutcomes", () => {
    expect(() => assertMateThreatsInvariants(ok({ faced: 4 }), black)).toThrow(InvalidMateThreats);
  });

  it("shouldRejectWhenPhaseTalliesDoNotAddUpToTheTotals", () => {
    expect(() => assertMateThreatsInvariants(ok({ byPhase: { opening: [1, 1, 0], middlegame: [0, 0, 0], endgame: [0, 0, 0] } }), black)).toThrow(InvalidMateThreats);
  });

  it("shouldRejectWhenMissedPliesLengthDiffersFromMissed", () => {
    expect(() => assertMateThreatsInvariants(ok({ missedPlies: [] }), black)).toThrow(InvalidMateThreats);
    expect(() => assertMateThreatsInvariants(ok({ missedPlies: [6, 8] }), black)).toThrow(InvalidMateThreats);
  });

  it("shouldRejectNegativeOrNonIntegerCounts", () => {
    expect(() => assertMateThreatsInvariants(ok({ faced: 1.5, neutralized: 0.5, missed: 1, unpunished: 0, byPhase: { opening: [0.5, 1, 0], middlegame: [0, 0, 0], endgame: [0, 0, 0] } }), black)).toThrow(InvalidMateThreats);
  });

  it.each([
    ["outsideTheGame", [42]],
    ["zero", [0]],
    ["ofTheOtherColour", [5]],
    ["notAnInteger", [6.5]],
  ])("shouldRejectMissedPliesThatAre_%s", (_n, plies) => {
    expect(() => assertMateThreatsInvariants(ok({ missedPlies: plies as number[] }), black)).toThrow(InvalidMateThreats);
  });

  it("shouldRejectPliesThatAreNotStrictlyIncreasing", () => {
    const two = ok({ faced: 4, missed: 2, unpunished: 1, neutralized: 1, byPhase: { opening: [1, 2, 1], middlegame: [0, 0, 0], endgame: [0, 0, 0] }, missedPlies: [8, 6] });
    expect(() => assertMateThreatsInvariants(two, black)).toThrow(InvalidMateThreats);
  });

  it("shouldAcceptOddPliesForWhite", () => {
    expect(() => assertMateThreatsInvariants(ok({ missedPlies: [7] }), { plyCount: 40, userColor: "white" })).not.toThrow();
  });

  it("shouldCarryTheStableCode", () => {
    try { assertMateThreatsInvariants(ok({ faced: 9 }), black); } catch (e: any) { expect(e.code).toBe("INVALID_MATE_THREATS"); return; }
    throw new Error("expected a throw");
  });
});

describe("readMateThreats", () => {
  it("shouldReadNullAsPending", () => {
    expect(readMateThreats(null)).toEqual({ state: "pending" });
  });

  it("shouldReadAStoredOkResult", () => {
    const stored = JSON.stringify({ v: 1, status: "ok", ...ok() });
    expect(readMateThreats(stored)).toEqual({ state: "ok", value: ok() });
  });

  it("shouldReadAnOkResultWithNoThreatsAsAnalysedNotPending", () => {
    const none = ok({ faced: 0, neutralized: 0, missed: 0, unpunished: 0, byPhase: { opening: [0, 0, 0], middlegame: [0, 0, 0], endgame: [0, 0, 0] }, missedPlies: [] });
    expect(readMateThreats(JSON.stringify({ v: 1, status: "ok", ...none }))).toEqual({ state: "ok", value: none });
  });

  it("shouldReadAnInvalidMarkerWithItsReason", () => {
    expect(readMateThreats(JSON.stringify({ v: 1, status: "invalid", reason: "illegal_game" }))).toEqual({ state: "invalid", reason: "illegal_game" });
  });

  it.each([
    ["anUnknownVersion", JSON.stringify({ v: 2, status: "ok", ...ok() })],
    ["malformedJson", "{not json"],
    ["aMissingField", JSON.stringify({ v: 1, status: "ok", faced: 1 })],
    ["anUnknownReason", JSON.stringify({ v: 1, status: "invalid", reason: "nope" })],
    ["selfContradictoryCounts", JSON.stringify({ v: 1, status: "ok", ...ok({ faced: 99 }) })],
    ["aNonObject", "42"],
  ])("shouldReadAsUnknownWhenItIs_%s", (_n, raw) => {
    expect(readMateThreats(raw)).toEqual({ state: "unknown" });
  });
});
