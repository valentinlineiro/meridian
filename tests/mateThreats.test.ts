import { describe, it, expect } from "vitest";
import { Chess } from "chess.js";
import { analyzeMateThreats, matesIfIPassed, phaseOfPly } from "../src/domain/mateThreats.ts";
import { IllegalGame } from "../src/domain/gameReplay.ts";

// Black meets Bc4 + Qh5 aimed at f7: the threat is Qxf7#. Each line ends differently.
const SETUP = ["e2e4", "e7e5", "f1c4", "b8c6", "d1h5"];
const fenAfter = (moves: string[]) => { const c = new Chess(); for (const m of moves) c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m.slice(4, 5) || undefined }); return c.fen(); };

describe("analyzeMateThreats", () => {
  it("shouldCountAMissedThreatWhenTheReplyIsMate", () => {
    expect(analyzeMateThreats([...SETUP, "g8f6", "h5f7"], "black")).toEqual({
      faced: 1, neutralized: 0, missed: 1, unpunished: 0,
      byPhase: { opening: [0, 1, 0], middlegame: [0, 0, 0], endgame: [0, 0, 0] }, missedPlies: [6],
    });
  });

  it("shouldCountANeutralizedThreatWhenNoMateRemains", () => {
    const r = analyzeMateThreats([...SETUP, "g7g6", "h5f3"], "black");
    expect(r).toMatchObject({ faced: 1, neutralized: 1, missed: 0, unpunished: 0, missedPlies: [] });
    expect(r.byPhase.opening).toEqual([1, 0, 0]);
  });

  it("shouldCountAnUnpunishedThreatWhenTheMateStaysButIsNotPlayed", () => {
    const r = analyzeMateThreats([...SETUP, "g8f6", "d2d3"], "black");
    expect(r).toMatchObject({ faced: 1, neutralized: 0, missed: 0, unpunished: 1, missedPlies: [] });
    expect(r.byPhase.opening).toEqual([0, 0, 1]);
  });

  it("shouldGiveNoVerdictWhenTheRecordEndsOnMyMove", () => {
    expect(analyzeMateThreats([...SETUP, "g8f6"], "black").faced).toBe(0);
  });

  it("shouldNotCountPositionsWhereIAmInCheck", () => {
    // after 3.Qh5+ black is in check: there is nothing to "pass", so no threat is counted anywhere in the line
    expect(analyzeMateThreats(["e2e4", "f7f6", "d1h5", "g7g6", "h5g6", "h7g6"], "black").faced).toBe(0);
  });

  it("shouldReplayPromotionsAndCastling", () => {
    const line = ["e2e4", "e7e5", "g1f3", "g8f6", "f1c4", "f8c5", "e1g1", "e8g8"];
    expect(() => analyzeMateThreats(line, "white")).not.toThrow();
    const promo = ["a2a4", "b7b5", "a4b5", "a7a6", "b5a6", "g8f6", "a6a7", "f6g8", "a7b8q"]; // a7xb8=Q
    expect(() => analyzeMateThreats(promo, "white")).not.toThrow();
  });

  it("shouldThrowIllegalGameOnAnUnplayableMove", () => {
    expect(() => analyzeMateThreats(["e2e5"], "white")).toThrow(IllegalGame);
  });
});

describe("matesIfIPassed", () => {
  it("shouldReturnNullWhenTheSideToMoveIsInCheck", () => {
    expect(matesIfIPassed(fenAfter(["e2e4", "f7f6", "d1h5"]))).toBeNull();
  });

  it("shouldListOnlyMatingMoves", () => {
    expect(matesIfIPassed(fenAfter([...SETUP]))!.map((m) => m.san)).toEqual(["Qxf7#"]);
  });

  it("shouldIgnoreTheEnPassantSquareOfTheRealSideToMove", () => {
    const withEp = fenAfter(["e2e4", "a7a6", "e4e5", "d7d5"]); // white to move, en passant on d6
    const cleared = withEp.split(" ").map((f, i) => (i === 3 ? "-" : f)).join(" ");
    expect(matesIfIPassed(withEp)!.map((m) => m.san)).toEqual(matesIfIPassed(cleared)!.map((m) => m.san));
  });
});

describe("phaseOfPly", () => {
  it("shouldSplitAtPlyTwentyAndSixty", () => {
    expect([1, 20, 21, 60, 61].map(phaseOfPly)).toEqual(["opening", "opening", "middlegame", "middlegame", "endgame"]);
  });
});
