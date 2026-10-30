import { describe, it, expect } from "vitest";
import { replayGame, IllegalGame, type GameHeaders } from "../src/domain/gameReplay.ts";

const headers: GameHeaders = { date: "2023.11.14", white: "Yo", black: "Ana", result: "1-0", event: "Duolingo Chess" };

describe("replayGame", () => {
  it("shouldReturnSanAndFenPerPlyWhenMovesAreLegal", () => {
    const g = replayGame(["e2e4", "e7e5", "g1f3"], [10, 20, 30], headers);
    expect(g.plies.map((p) => p.san)).toEqual(["e4", "e5", "Nf3"]);
    expect(g.plies[0]!.fen).toBe("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1");
    expect(g.plies.map((p) => p.t)).toEqual([10, 20, 30]);
  });

  it("shouldWritePgnWithHeadersAndResultWhenGameIsPlayed", () => {
    const pgn = replayGame(["e2e4", "e7e5"], [], headers).pgn;
    expect(pgn).toContain('[White "Yo"]');
    expect(pgn).toContain('[Black "Ana"]');
    expect(pgn).toContain('[Date "2023.11.14"]');
    expect(pgn).toContain('[Result "1-0"]');
    expect(pgn.trimEnd()).toMatch(/1\. e4 e5 1-0$/);
  });

  it("shouldLeaveTimeNullWhenTimestampsAreShorterThanMoves", () => {
    expect(replayGame(["e2e4", "e7e5"], [5], headers).plies.map((p) => p.t)).toEqual([5, null]);
  });

  it("shouldAcceptCastlingAndPromotionWhenWrittenAsCoordinates", () => {
    const g = replayGame(["e2e4", "e7e5", "g1f3", "b8c6", "f1c4", "g8f6", "e1g1"], [], headers);
    expect(g.plies.at(-1)!.san).toBe("O-O");
    const promo = replayGame(
      ["a2a4", "b7b5", "a4b5", "a7a6", "b5a6", "c8b7", "a6b7", "b8c6", "b7a8q"], [], headers);
    expect(promo.plies.at(-1)!.san).toBe("bxa8=Q");
  });

  it("shouldThrowIllegalGameWhenAMoveIsIllegal", () => {
    expect(() => replayGame(["e2e4", "e2e4"], [], headers)).toThrow(IllegalGame);
  });

  it("shouldReturnNoPliesWhenThereAreNoMoves", () => {
    const g = replayGame([], [], headers);
    expect(g.plies).toEqual([]);
  });
});
