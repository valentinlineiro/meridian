import { describe, it, expect } from "vitest";
import { normalizeMatchDetail } from "../src/normalization/chessDetail.ts";

describe("normalizeMatchDetail", () => {
  it("shouldNormalizeFullTerminalMatchPayloadFromHarCapture", () => {
    const raw = {
      matchId: "bot|1790000001|fixture-bot-001",
      userId: "1000001",
      opponentId: "noisy_neural_v2-low-500-noise-4.0",
      isHardMatch: false,
      isPlacementMatch: false,
      isRevengeMatch: false,
      predictedEloAfterResult: { win: 966, loss: 945, draw: 955 },
      eloAfter: 950,
      outcome: "white",
      endCondition: "checkmate",
      status: "completed",
      moveHistory: ["e2e4", "d7d5", "e4e5"],
      moveTimestamps: [1790578262494, 1790578265000, 1790578268000],
      finalFen: "4k3/7Q/4bP2/6KP/8/8/8/8 w - - 5 67",
      reaction: { animationState: "userCheckmate" },
      sessionDuration: 342.492,
    };

    const norm = normalizeMatchDetail(raw);
    expect(norm).not.toBeNull();
    expect(norm?.match_id).toBe("bot|1790000001|fixture-bot-001");
    expect(norm?.user_id).toBe("1000001");
    expect(norm?.opponent_id).toBe("noisy_neural_v2-low-500-noise-4.0");
    expect(norm?.is_hard_match).toBe(0);
    expect(norm?.is_placement_match).toBe(0);
    expect(norm?.is_revenge_match).toBe(0);
    expect(norm?.predicted_elo_win).toBe(966);
    expect(norm?.predicted_elo_loss).toBe(945);
    expect(norm?.predicted_elo_draw).toBe(955);
    expect(norm?.elo_after).toBe(950);
    expect(norm?.outcome).toBe("white");
    expect(norm?.end_condition).toBe("checkmate");
    expect(norm?.status).toBe("completed");
    expect(JSON.parse(norm!.move_history)).toEqual(["e2e4", "d7d5", "e4e5"]);
    expect(JSON.parse(norm!.move_timestamps)).toEqual([1790578262494, 1790578265000, 1790578268000]);
    expect(norm?.final_fen).toBe("4k3/7Q/4bP2/6KP/8/8/8/8 w - - 5 67");
    expect(norm?.reaction).toBe(JSON.stringify({ animationState: "userCheckmate" }));
    expect(norm?.session_duration).toBe(342.492);
  });

  it("shouldHandleSnakeCasePayloadsAndAlternativeFieldNames", () => {
    const raw = {
      match_id: "pvp|1790578999|xyz123",
      user_id: "user_456",
      opponent_id: "opponent_789",
      is_hard_match: true,
      is_placement_match: 1,
      is_revenge_match: false,
      predicted_elo_win: 1010,
      predicted_elo_loss: 990,
      predicted_elo_draw: 1000,
      eloRating: 1005,
      boardFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      move_history: ["d2d4", "d7d5"],
      move_timestamps: [1790578262494, 1790578265000],
      session_duration: 120.5,
    };

    const norm = normalizeMatchDetail(raw);
    expect(norm).not.toBeNull();
    expect(norm?.match_id).toBe("pvp|1790578999|xyz123");
    expect(norm?.user_id).toBe("user_456");
    expect(norm?.opponent_id).toBe("opponent_789");
    expect(norm?.is_hard_match).toBe(1);
    expect(norm?.is_placement_match).toBe(1);
    expect(norm?.is_revenge_match).toBe(0);
    expect(norm?.predicted_elo_win).toBe(1010);
    expect(norm?.predicted_elo_loss).toBe(990);
    expect(norm?.predicted_elo_draw).toBe(1000);
    expect(norm?.elo_after).toBe(1005);
    expect(norm?.final_fen).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    expect(norm?.status).toBe("completed");
    expect(JSON.parse(norm!.move_history)).toEqual(["d2d4", "d7d5"]);
    expect(JSON.parse(norm!.move_timestamps)).toEqual([1790578262494, 1790578265000]);
    expect(norm?.session_duration).toBe(120.5);
  });

  it("shouldRejectMalformedPayloadsWhenMatchIdOrMoveHistoryIsMissing", () => {
    expect(normalizeMatchDetail(null)).toBeNull();
    expect(normalizeMatchDetail({})).toBeNull();
    expect(normalizeMatchDetail({ matchId: "bad", moveHistory: "not-array" })).toBeNull();
    expect(normalizeMatchDetail({ userId: "user1", moveHistory: ["e2e4"] })).toBeNull(); // missing matchId
    expect(normalizeMatchDetail({ matchId: "   ", userId: "user1", moveHistory: ["e2e4"] })).toBeNull(); // empty matchId
  });

  it("shouldAcceptPayloadWithoutUserIdBecauseOwnershipPolicyResolvesIt", () => {
    const norm = normalizeMatchDetail({ matchId: "bot|1|m", moveHistory: ["e2e4"] });
    expect(norm).not.toBeNull();
    expect(norm!.user_id).toBe("");
  });
});
