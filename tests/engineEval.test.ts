import { describe, it, expect } from "vitest";
import { summarizeEngineGame, assertEngineEvalInvariants, readEngineEval, InvalidEngineEval, type EngineEvalOk } from "../src/domain/engineEval.ts";

const bests = (n: number) => Array.from({ length: n }, () => "e2e4" as string | null);
const okOf = (over: Partial<EngineEvalOk> = {}): EngineEvalOk => ({
  moves: 3, loss: 400, byPhase: { opening: [3, 1], middlegame: [0, 0], endgame: [0, 0] }, decisivePly: null,
  sustainedAdv: false, sustainedDis: false, minEval: -400, maxEval: 0, worst: [{ ply: 3, loss: 400, best: "e2e4" }], ...over,
});
const ctx = { plyCount: 5, userColor: "white" as const };

describe("summarizeEngineGame", () => {
  it("shouldCountMovesLossAndSeriousErrorsPerPhaseFromTheOwnersMovesOnly", () => {
    const s = summarizeEngineGame([0, 0, 0, -400, -400], bests(5), "white");
    expect(s.moves).toBe(2); // white moves at positions 0 and 2 (plies 1 and 3)
    expect(s.loss).toBe(400); // ply 3: 0 -> -400
    expect(s.byPhase).toEqual({ opening: [2, 1], middlegame: [0, 0], endgame: [0, 0] });
    expect(s.worst).toEqual([{ ply: 3, loss: 400, best: "e2e4" }]);
  });

  it("shouldSignEvaluationsByColorAndClipThemBeforeComputingLoss", () => {
    // black moves at positions 1 and 3; position 3 goes from +9000 for black (clipped to 1000) to -9000 (clipped to -1000)
    const s = summarizeEngineGame([0, 0, 0, -9000, 9000], bests(5), "black");
    expect(s.moves).toBe(2);
    expect(s.worst).toEqual([{ ply: 4, loss: 2000, best: "e2e4" }]);
  });

  it("shouldFindTheFirstDecisiveMoveWhenBeforeAboveMinus150AndAfterAtMostMinus300", () => {
    expect(summarizeEngineGame([0, 0, -100, -500, -500], bests(5), "white").decisivePly).toBe(3);
    expect(summarizeEngineGame([-200, -200, -200, -600, -600], bests(5), "white").decisivePly).toBeNull(); // already worse than -150
    expect(summarizeEngineGame([0, 0, 0, 0, 0], bests(5), "white").decisivePly).toBeNull();
  });

  it("shouldRequireTheDecisiveMoveToBeASeriousErrorAndToHaveAnOpponentReplyOnRecord", () => {
    expect(summarizeEngineGame([0, 0, -100, -310, -310], bests(5), "white").decisivePly).toBeNull(); // loss 210: past -300 but not serious
    expect(summarizeEngineGame([0, 0, 0, 0, -500], bests(5), "black").decisivePly).toBeNull(); // black's last recorded move ends the record
    expect(summarizeEngineGame([0, 0, 0, -500, -500], bests(5), "white").decisivePly).toBe(3); // black's reply is on record
    expect(summarizeEngineGame([0, 0, 0, -500], bests(4), "white").decisivePly).toBeNull(); // white's ply 3 is the last recorded move
  });

  it("shouldFlagSustainedAdvantageOnlyWithThreeConsecutivePositionsAtPlus300", () => {
    expect(summarizeEngineGame([0, 300, 300, 0, 300, 300], bests(6), "white").sustainedAdv).toBe(false);
    expect(summarizeEngineGame([0, 300, 300, 300, 0], bests(5), "white").sustainedAdv).toBe(true);
    expect(summarizeEngineGame([0, -300, -300, -300, 0], bests(5), "white").sustainedDis).toBe(true);
    expect(summarizeEngineGame([0, -300, -300, 0, -300], bests(5), "white").sustainedDis).toBe(false);
  });

  it("shouldTrackMinAndMaxEvalOverAllPositionsClipped", () => {
    const s = summarizeEngineGame([0, 9000, -9000, 100], bests(4), "white");
    expect([s.minEval, s.maxEval]).toEqual([-1000, 1000]);
  });

  it("shouldKeepAtMostFiveWorstMovesSortedByLossDescendingThenPlyAndOnlySeriousOnes", () => {
    // white own positions 0,2,4,6,8,10,12; drops of 400,350,400,320,310,900,100 (the last is not serious)
    const e = [0, -400, -400, -750, -750, -1000, -1000, -1000, -1000, -1000, -1000, -1000, -1000, -1000];
    const s = summarizeEngineGame(e, bests(14), "white");
    expect(s.worst.length).toBeLessThanOrEqual(5);
    expect(s.worst.every((w) => w.loss >= 300)).toBe(true);
    const sorted = [...s.worst].sort((a, b) => b.loss - a.loss || a.ply - b.ply);
    expect(s.worst).toEqual(sorted);
  });

  it("shouldReturnZeroMovesForAGameWithNoOwnerMoves", () => {
    expect(summarizeEngineGame([0], bests(1), "white").moves).toBe(0);
    expect(summarizeEngineGame([0, 0], bests(2), "black").moves).toBe(0);
    expect(summarizeEngineGame([0], bests(1), "white").worst).toEqual([]);
  });
});

describe("assertEngineEvalInvariants", () => {
  it("shouldAcceptAConsistentResult", () => {
    expect(() => assertEngineEvalInvariants(okOf(), ctx)).not.toThrow();
  });
  it("shouldRejectMovesThatDoNotMatchTheOwnerPlyCount", () => {
    expect(() => assertEngineEvalInvariants(okOf({ moves: 2, byPhase: { opening: [2, 1], middlegame: [0, 0], endgame: [0, 0] } }), ctx)).toThrow(InvalidEngineEval); // white, 5 plies -> 3
    expect(() => assertEngineEvalInvariants(okOf({ worst: [{ ply: 4, loss: 400, best: "e7e5" }] }), { plyCount: 5, userColor: "black" })).toThrow(InvalidEngineEval); // black has 2 moves, not 3
  });
  it("shouldRejectSeriousAboveMovesInAPhase", () => {
    expect(() => assertEngineEvalInvariants(okOf({ byPhase: { opening: [3, 4], middlegame: [0, 0], endgame: [0, 0] } }), ctx)).toThrow(InvalidEngineEval);
  });
  it("shouldRejectMovesNotAddingUpAcrossPhases", () => {
    expect(() => assertEngineEvalInvariants(okOf({ byPhase: { opening: [1, 1], middlegame: [0, 0], endgame: [0, 0] } }), ctx)).toThrow(InvalidEngineEval);
  });
  it("shouldRejectWorstEntriesOutsideTheGameOrOfTheWrongParityOrDuplicated", () => {
    for (const worst of [[{ ply: 9, loss: 400, best: "e2e4" }], [{ ply: 2, loss: 400, best: "e2e4" }], [{ ply: 3, loss: 400, best: "e2e4" }, { ply: 3, loss: 400, best: "e2e4" }]])
      expect(() => assertEngineEvalInvariants(okOf({ worst }), ctx)).toThrow(InvalidEngineEval);
  });
  it("shouldRejectWorstLossOutside300To2000", () => {
    for (const loss of [299, 2001]) expect(() => assertEngineEvalInvariants(okOf({ worst: [{ ply: 3, loss, best: "e2e4" }], loss: 5000 }), ctx)).toThrow(InvalidEngineEval);
  });
  it("shouldRejectMalformedBestMove", () => {
    expect(() => assertEngineEvalInvariants(okOf({ worst: [{ ply: 3, loss: 400, best: "xx" }] }), ctx)).toThrow(InvalidEngineEval);
    expect(() => assertEngineEvalInvariants(okOf({ worst: [{ ply: 3, loss: 400, best: "e7e8q" }] }), ctx)).not.toThrow();
  });
  it("shouldRejectWorstLossSumAboveTotalLoss", () => {
    expect(() => assertEngineEvalInvariants(okOf({ loss: 300 }), ctx)).toThrow(InvalidEngineEval);
  });
  it("shouldRejectWorstLongerThanTheSeriousCount", () => {
    expect(() => assertEngineEvalInvariants(okOf({ byPhase: { opening: [3, 0], middlegame: [0, 0], endgame: [0, 0] } }), ctx)).toThrow(InvalidEngineEval);
  });
  it("shouldRejectSustainedFlagsInconsistentWithMinMax", () => {
    expect(() => assertEngineEvalInvariants(okOf({ sustainedAdv: true, maxEval: 299 }), ctx)).toThrow(InvalidEngineEval);
    expect(() => assertEngineEvalInvariants(okOf({ sustainedDis: true, minEval: -299 }), ctx)).toThrow(InvalidEngineEval);
  });
  it("shouldRejectMinAboveMaxOrOutsideClip", () => {
    expect(() => assertEngineEvalInvariants(okOf({ minEval: 10, maxEval: 0 }), ctx)).toThrow(InvalidEngineEval);
    expect(() => assertEngineEvalInvariants(okOf({ maxEval: 1001 }), ctx)).toThrow(InvalidEngineEval);
  });
  it("shouldRejectADecisivePlyOutsideTheGameOrOfTheWrongParity", () => {
    expect(() => assertEngineEvalInvariants(okOf({ decisivePly: 2 }), ctx)).toThrow(InvalidEngineEval);
    expect(() => assertEngineEvalInvariants(okOf({ decisivePly: 7 }), ctx)).toThrow(InvalidEngineEval);
    expect(() => assertEngineEvalInvariants(okOf({ decisivePly: 3 }), ctx)).not.toThrow();
  });
});

describe("assertEngineEvalInvariants: figures the definitions rule out", () => {
  it("shouldRejectALossAbove2000CentipawnsPerMove", () => {
    expect(() => assertEngineEvalInvariants(okOf({ loss: 6001 }), ctx)).toThrow(InvalidEngineEval); // 3 moves
    expect(() => assertEngineEvalInvariants(okOf({ loss: 6000 }), ctx)).not.toThrow();
  });
  it("shouldRejectALossBelow300PerSeriousError", () => {
    expect(() => assertEngineEvalInvariants(okOf({ loss: 299, worst: [] }), ctx)).toThrow(InvalidEngineEval);
  });
  it("shouldRejectAPhaseSplitThatTheGameLengthDoesNotAllow", () => {
    // white, 5 plies: all three moves are opening moves
    expect(() => assertEngineEvalInvariants(okOf({ byPhase: { opening: [0, 0], middlegame: [3, 1], endgame: [0, 0] } }), ctx)).toThrow(InvalidEngineEval);
    // 45 plies as white: plies 1..39 opening (20 moves... ply <= 20 -> 10 moves), 21..45 middle
    const split = { opening: [10, 0], middlegame: [13, 0], endgame: [0, 0] } as any;
    expect(() => assertEngineEvalInvariants(okOf({ moves: 23, loss: 0, byPhase: split, worst: [], minEval: 0 }), { plyCount: 45, userColor: "white" })).not.toThrow();
    expect(() => assertEngineEvalInvariants(okOf({ moves: 23, loss: 0, byPhase: { opening: [11, 0], middlegame: [12, 0], endgame: [0, 0] }, worst: [], minEval: 0 }), { plyCount: 45, userColor: "white" })).toThrow(InvalidEngineEval);
  });
  it("shouldRejectMoreWorstEntriesInAPhaseThanSeriousErrorsThere", () => {
    const ctx45 = { plyCount: 45, userColor: "white" as const };
    const base = { moves: 23, loss: 700, byPhase: { opening: [10, 0], middlegame: [13, 2], endgame: [0, 0] } as any, minEval: -500, worst: [{ ply: 3, loss: 350, best: "e2e4" }, { ply: 25, loss: 350, best: "e2e4" }] };
    expect(() => assertEngineEvalInvariants(okOf(base), ctx45)).toThrow(InvalidEngineEval); // ply 3 is opening, which has no serious error
  });
  it("shouldRejectADecisiveMomentWithoutASeriousErrorOrWithoutReachingMinus300", () => {
    expect(() => assertEngineEvalInvariants(okOf({ decisivePly: 3, loss: 0, worst: [], byPhase: { opening: [3, 0], middlegame: [0, 0], endgame: [0, 0] } }), ctx)).toThrow(InvalidEngineEval);
    expect(() => assertEngineEvalInvariants(okOf({ decisivePly: 3, minEval: -299 }), ctx)).toThrow(InvalidEngineEval);
  });
  it("shouldRejectADecisivePlyWithNoOpponentReplyOnRecord", () => {
    expect(() => assertEngineEvalInvariants(okOf({ decisivePly: 5 }), ctx)).toThrow(InvalidEngineEval); // ply 5 is the last of 5
  });
  it("shouldRejectSustainedFlagsInAGameTooShortForARun", () => {
    expect(() => assertEngineEvalInvariants(okOf({ moves: 0, loss: 0, worst: [], byPhase: { opening: [0, 0], middlegame: [0, 0], endgame: [0, 0] }, sustainedAdv: true, maxEval: 300, minEval: 0, decisivePly: null }), { plyCount: 0, userColor: "white" })).toThrow(InvalidEngineEval);
  });
});

describe("readEngineEval", () => {
  const stored = (o: object) => JSON.stringify({ v: 1, status: "ok", ...okOf(), ...o });
  it("shouldReadNullAsPending", () => expect(readEngineEval(null)).toEqual({ state: "pending" }));
  it("shouldReadUnknownVersionBrokenJsonAndContradictionsAsUnknown", () => {
    expect(readEngineEval(stored({ v: 2 }))).toEqual({ state: "unknown" });
    expect(readEngineEval("{not json")).toEqual({ state: "unknown" });
    expect(readEngineEval(stored({ moves: 99 }))).toEqual({ state: "unknown" });
    expect(readEngineEval(JSON.stringify({ v: 1, status: "weird" }))).toEqual({ state: "unknown" });
  });
  it("shouldReadInvalidWithKnownReasonOnly", () => {
    expect(readEngineEval(JSON.stringify({ v: 1, status: "invalid", reason: "illegal_game" }))).toEqual({ state: "invalid", reason: "illegal_game" });
    expect(readEngineEval(JSON.stringify({ v: 1, status: "invalid", reason: "because" }))).toEqual({ state: "unknown" });
  });
  it("shouldReadAnOkResultBack", () => {
    const r = readEngineEval(stored({}));
    expect(r.state).toBe("ok");
    if (r.state === "ok") expect(r.value).toEqual(okOf());
  });
});
