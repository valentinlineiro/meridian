import { describe, it, expect } from "vitest";
import { classifyOpening, WHITE_OPENINGS, BLACK_OPENINGS } from "../src/analytics/openings.ts";

describe("classifyOpening", () => {
  describe("white openings (ply 0)", () => {
    it("shouldClassifyUnclassifiedWhenMovesEmpty", () => {
      const res = classifyOpening([], "white");
      expect(res.key).toBe("unclassified");
      expect(res.color).toBe("white");
    });

    it("shouldClassifyCuratedWhiteOpenings", () => {
      expect(classifyOpening(["e2e4", "e7e5"], "white").key).toBe("e2e4");
      expect(classifyOpening(["d2d4", "d7d5"], "white").key).toBe("d2d4");
      expect(classifyOpening(["e2e3"], "white").key).toBe("e2e3");
      expect(classifyOpening(["d2d3"], "white").key).toBe("d2d3");
      expect(classifyOpening(["c2c4"], "white").key).toBe("c2c4");
      expect(classifyOpening(["g1f3"], "white").key).toBe("g1f3");
      expect(classifyOpening(["e2e4"], "white").name).toBe("Peón de Rey");
      expect(classifyOpening(["d2d4"], "white").name).toBe("Peón de Dama");
      expect(classifyOpening(["e2e3"], "white").name).toBe("Apertura Van't Kruijs");
      expect(classifyOpening(["d2d3"], "white").name).toBe("Apertura Mieses");
    });

    it("shouldClassifyOtherWhiteWhenMoveExistsButNotInCatalog", () => {
      const res = classifyOpening(["b2b3", "e7e5"], "white");
      expect(res.key).toBe("other_white");
      expect(res.name).toBe("Otras secuencias con Blancas");
    });
  });

  describe("black openings (ply 0 + ply 1)", () => {
    it("shouldClassifyUnclassifiedWhenLessThanTwoPlies", () => {
      expect(classifyOpening([], "black").key).toBe("unclassified");
      expect(classifyOpening(["e2e4"], "black").key).toBe("unclassified");
    });

    it("shouldClassifyCuratedBlackOpenings", () => {
      expect(classifyOpening(["e2e4", "e7e5"], "black").key).toBe("e2e4 e7e5");
      expect(classifyOpening(["e2e4", "e7e5"], "black").name).toBe("Partida Abierta");
      expect(classifyOpening(["d2d4", "d7d5"], "black").key).toBe("d2d4 d7d5");
      expect(classifyOpening(["d2d4", "d7d5"], "black").name).toBe("Partida Cerrada");
      expect(classifyOpening(["e2e4", "c7c5"], "black").key).toBe("e2e4 c7c5");
      expect(classifyOpening(["e2e4", "c7c5"], "black").name).toBe("Defensa Siciliana");
      expect(classifyOpening(["e2e4", "e7e6"], "black").key).toBe("e2e4 e7e6");
      expect(classifyOpening(["e2e4", "e7e6"], "black").name).toBe("Defensa Francesa");
      expect(classifyOpening(["e2e4", "c7c6"], "black").key).toBe("e2e4 c7c6");
      expect(classifyOpening(["e2e4", "c7c6"], "black").name).toBe("Defensa Caro-Kann");
      expect(classifyOpening(["e2e4", "d7d5"], "black").key).toBe("e2e4 d7d5");
      expect(classifyOpening(["e2e4", "d7d5"], "black").name).toBe("Defensa Escandinava");
    });

    it("shouldClassifyOtherBlackWhenTwoPliesExistButNotInCatalog", () => {
      const res = classifyOpening(["b2b4", "e7e5"], "black");
      expect(res.key).toBe("other_black");
      expect(res.name).toBe("Otras secuencias con Negras");
    });

    it("shouldHandleNullUndefinedAndCaseInsensitivity", () => {
      expect(classifyOpening(null, "white").key).toBe("unclassified");
      expect(classifyOpening(undefined, "black").key).toBe("unclassified");
      expect(classifyOpening([" E2E4 "], "white").key).toBe("e2e4");
      expect(classifyOpening([" E2E4 ", " E7E5 "], "black").key).toBe("e2e4 e7e5");
    });
  });

  it("shouldReturnUnclassifiedWhenUserColorIsMissingOrInvalid", () => {
    expect(classifyOpening(["e2e4", "e7e5"], null).key).toBe("unclassified");
    expect(classifyOpening(["e2e4", "e7e5"], "purple" as any).key).toBe("unclassified");
  });

  describe("catalogs", () => {
    it("shouldExportValidWhiteAndBlackOpeningsCatalogs", () => {
      expect(Object.keys(WHITE_OPENINGS).length).toBeGreaterThan(0);
      expect(Object.keys(BLACK_OPENINGS).length).toBeGreaterThan(0);
      expect(WHITE_OPENINGS["e2e4"]).toEqual({ name: "Peón de Rey", notation: "1. e4" });
      expect(BLACK_OPENINGS["e2e4 e7e5"]).toEqual({ name: "Partida Abierta", notation: "1. e4 e5" });
    });
  });
});
