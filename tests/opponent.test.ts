import { describe, it, expect } from "vitest";
import { classifyOpponentSegment, OPPONENT_SEGMENT_LABELS } from "../src/analytics/opponent.ts";

describe("classifyOpponentSegment", () => {
  it("shouldClassifyNoisyNeuralVariants", () => {
    expect(classifyOpponentSegment("noisy_neural_v2-midrating-600-noise-5.0")).toBe("noisy_neural");
    expect(classifyOpponentSegment("noisy_neural_v1-set2-0800-noise-3.0")).toBe("noisy_neural");
    expect(classifyOpponentSegment("NOISY_NEURAL_V2-low")).toBe("noisy_neural");
  });

  it("shouldClassifyPureNeuralVariants", () => {
    expect(classifyOpponentSegment("neural_v1-difficulty-21")).toBe("neural");
    expect(classifyOpponentSegment("neural_v2-low-500")).toBe("neural");
  });

  it("shouldClassifyBlendedEngineVariants", () => {
    expect(classifyOpponentSegment("blended-9-full-guard-rails")).toBe("blended");
    expect(classifyOpponentSegment("blended-7-full-guard-rails")).toBe("blended");
    expect(classifyOpponentSegment("blended-10-full-guard-rails")).toBe("blended");
  });

  it("shouldClassifyStockfishAndFairyStockfishVariants", () => {
    expect(classifyOpponentSegment("stockfish")).toBe("stockfish");
    expect(classifyOpponentSegment("stockfish-difficulty-9")).toBe("stockfish");
    expect(classifyOpponentSegment("fairy_stockfish-difficulty-1")).toBe("stockfish");
  });

  it("shouldClassifyNumericUserIdsAsPvp", () => {
    expect(classifyOpponentSegment("2000000001")).toBe("pvp");
    expect(classifyOpponentSegment("1000001")).toBe("pvp");
  });

  it("shouldFallbackToPvpWhenOpponentTypeIsPvpAndOpponentIdIsAbsent", () => {
    expect(classifyOpponentSegment(null, "pvp")).toBe("pvp");
    expect(classifyOpponentSegment("", "pvp")).toBe("pvp");
    expect(classifyOpponentSegment(undefined, "pvp")).toBe("pvp");
  });

  it("shouldClassifyUnrecognizedStringsAsUnknownNeverPvp", () => {
    expect(classifyOpponentSegment("quantum_chess_v1")).toBe("unknown");
    expect(classifyOpponentSegment("unknown-bot-engine")).toBe("unknown");
    expect(classifyOpponentSegment("unknown-bot-engine", "pvp")).toBe("unknown");
    expect(classifyOpponentSegment(null, "bot")).toBe("unknown");
    expect(classifyOpponentSegment(null, null)).toBe("unknown");
  });

  it("shouldProvideHumanReadableLabels", () => {
    expect(OPPONENT_SEGMENT_LABELS.noisy_neural).toBe("Noisy Neural");
    expect(OPPONENT_SEGMENT_LABELS.neural).toBe("Neural");
    expect(OPPONENT_SEGMENT_LABELS.blended).toBe("Blended");
    expect(OPPONENT_SEGMENT_LABELS.stockfish).toBe("Stockfish");
    expect(OPPONENT_SEGMENT_LABELS.pvp).toBe("PvP");
    expect(OPPONENT_SEGMENT_LABELS.unknown).toBe("Desconocido");
  });
});
