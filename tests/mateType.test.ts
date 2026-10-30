import { describe, it, expect } from "vitest";
import { classifyMate, MATE_TYPE_LABELS } from "../src/domain/mateType.ts";
import { classifyGame } from "../src/domain/gameClassification.ts";
import { FOOLS, SCHOLARS, SMOTHERED, QUEEN, BISHOP, BACK_RANK, ROOK, PAWN, STALEMATE } from "./fixtures/mateGames.ts";

describe("classifyMate", () => {
  it.each([
    ["fools", FOOLS, "Mate del loco"],
    ["scholars", SCHOLARS, "Mate del pastor"],
    ["smothered", SMOTHERED, "Mate ahogado"],
    ["back_rank", BACK_RANK, "Mate del pasillo"],
    ["queen", QUEEN, "Mate con dama"],
    ["rook", ROOK, "Mate con torre"],
    ["bishop", BISHOP, "Mate con alfil"],
    ["pawn", PAWN, "Mate con peón"],
  ])("shouldClassifyAs%sWhenTheGameEndsThatWay", (type, moves, label) => {
    expect(classifyMate(moves)).toBe(type);
    expect(MATE_TYPE_LABELS[type]).toBe(label);
  });

  it("shouldReturnNullWhenTheGameDoesNotEndInMate", () => {
    expect(classifyMate(["e2e4", "e7e5"])).toBeNull();
  });

  it("shouldReturnNullWhenTheGameEndsInStalemate", () => {
    expect(classifyMate(STALEMATE)).toBeNull();
  });

  it("shouldReturnNullWhenThereAreNoMoves", () => {
    expect(classifyMate([])).toBeNull();
  });

  it("shouldReturnNullWithoutThrowingWhenMovesAreIllegal", () => {
    expect(classifyMate(["e2e4", "e2e4"])).toBeNull();
    expect(classifyMate(["zz"])).toBeNull();
  });
});

describe("classifyGame", () => {
  it("shouldReturnUnclassifiedAndNoMateWhenThereIsOnePly", () => {
    expect(classifyGame(["e2e4"])).toEqual({ openingFamily: "unclassified", mateType: null });
  });

  it("shouldCombineFamilyAndMateWhenBothApply", () => {
    expect(classifyGame(SCHOLARS)).toEqual({ openingFamily: "open_game", mateType: "scholars" });
  });

  it("shouldKeepTheFamilyWhenMovesBecomeIllegalLater", () => {
    expect(classifyGame(["e2e4", "c7c5", "zz"])).toEqual({ openingFamily: "sicilian", mateType: null });
  });
});
