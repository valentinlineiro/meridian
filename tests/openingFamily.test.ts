import { describe, it, expect } from "vitest";
import { classifyOpeningFamily, OPENING_FAMILY_LABELS } from "../src/domain/openingFamily.ts";

const g = (s: string) => s.split(" ");

describe("classifyOpeningFamily", () => {
  it.each([
    ["e2e4 e7e5 g1f3 b8c6 f1b5", "ruy_lopez", "Española (Ruy López)"],
    ["e2e4 e7e5 g1f3 b8c6 f1c4", "italian", "Italiana"],
    ["e2e4 e7e5 g1f3 b8c6 d2d4", "scotch", "Escocesa"],
    ["e2e4 e7e5 g1f3 b8c6 b1c3", "four_knights", "Cuatro Caballos"],
    ["e2e4 e7e5 g1f3 g8f6", "petrov", "Petrov (Rusa)"],
    ["e2e4 e7e5 g1f3 d7d6", "philidor", "Philidor"],
    ["e2e4 e7e5 f2f4", "kings_gambit", "Gambito de Rey"],
    ["e2e4 e7e5 b1c3", "vienna", "Vienesa"],
    ["e2e4 c7c5", "sicilian", "Siciliana"],
    ["e2e4 e7e6", "french", "Francesa"],
    ["e2e4 c7c6", "caro_kann", "Caro-Kann"],
    ["e2e4 d7d5", "scandinavian", "Escandinava"],
    ["e2e4 g8f6", "alekhine", "Alekhine"],
    ["e2e4 d7d6", "pirc", "Pirc / Moderna"],
    ["e2e4 g7g6", "pirc", "Pirc / Moderna"],
    ["d2d4 d7d5 c2c4", "queens_gambit", "Gambito de Dama"],
    ["d2d4 d7d5 c1f4", "london", "Sistema Londres"],
    ["d2d4 d7d5 g1f3", "closed_game", "Partida Cerrada"],
    ["d2d4 g8f6", "indian", "Defensas Indias"],
    ["d2d4 f7f5", "dutch", "Holandesa"],
    ["c2c4 e7e5", "english", "Inglesa"],
    ["g1f3 d7d5", "reti", "Reti"],
    ["f2f4 d7d5", "bird", "Bird"],
    ["b2b3 e7e5", "larsen", "Larsen"],
    ["e2e3 e7e5", "vant_kruijs", "Van't Kruijs"],
    ["e2e4 e7e5 d2d4 e5d4", "open_game", "Partida Abierta"],
  ])("shouldClassifyAs%s", (moves, key, label) => {
    expect(classifyOpeningFamily(g(moves))).toBe(key);
    expect(OPENING_FAMILY_LABELS[key]).toBe(label);
  });

  it("shouldPreferTheLongestPrefixWhenAGenericBucketAlsoMatches", () => {
    expect(classifyOpeningFamily(g("e2e4 e7e5 g1f3 b8c6 f1b5 a7a6"))).toBe("ruy_lopez");
  });

  it("shouldReturnUnclassifiedWhenFewerThanTwoPlies", () => {
    expect(classifyOpeningFamily(["e2e4"])).toBe("unclassified");
    expect(classifyOpeningFamily([])).toBe("unclassified");
    expect(OPENING_FAMILY_LABELS.unclassified).toBe("Sin datos");
  });

  it("shouldReturnOtherWhenNoFamilyMatches", () => {
    expect(classifyOpeningFamily(["a2a3", "a7a6"])).toBe("other");
    expect(OPENING_FAMILY_LABELS.other).toBe("Otra apertura");
  });

  it.each([
    [["e4", "e5", "Nf3", "Nc6", "Bb5"]],
    [["zz", "zz"]],
    [["e2e5", "e7e5"]],
  ])("shouldReturnUnclassifiedWhenTheOpeningMovesAreNotLegalCoordinateMoves(%j)", (moves) => {
    expect(classifyOpeningFamily(moves)).toBe("unclassified");
  });

  it("shouldKeepTheFamilyWhenOnlyPliesAfterTheMatchedLineAreIllegal", () => {
    expect(classifyOpeningFamily(["e2e4", "e7e5", "g1f3", "b8c6", "f1e2x"])).toBe("open_game");
  });

  it.each([
    ["d2d4 g8f6 c2c4 e7e6 b1c3 d7d5"],
    ["d2d4 g8f6 c2c4 e7e6 g1f3 d7d5"],
  ])("shouldCallItQueensGambitWhenAnIndianMoveOrderReachesD5(%s)", (moves) => {
    expect(classifyOpeningFamily(g(moves))).toBe("queens_gambit");
  });

  it("shouldIgnoreCaseAndSurroundingSpacesWhenMovesAreSloppy", () => {
    expect(classifyOpeningFamily([" E2E4 ", "C7C5"])).toBe("sicilian");
  });
});
