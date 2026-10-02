import { describe, it, expect } from "vitest";
import { recordMatchDetail } from "../src/application/recordMatchDetail.ts";
import { NotFoundError, OwnershipViolationError } from "../src/application/errors.ts";
import type { MatchPort, EnrichedMatchDetailRecord } from "../src/ports/matchPort.ts";
import type { MatchDetailRecord } from "../src/types.ts";

function createBaseRecord(overrides: Partial<MatchDetailRecord> = {}): MatchDetailRecord {
  return {
    match_id: "match-123",
    user_id: "user-1",
    opponent_id: "opp-1",
    is_hard_match: 0,
    is_placement_match: 0,
    is_revenge_match: 0,
    predicted_elo_win: null,
    predicted_elo_loss: null,
    predicted_elo_draw: null,
    elo_after: 1200,
    outcome: "win",
    end_condition: "checkmate",
    status: "finished",
    move_history: JSON.stringify(["e2e4", "e7e5", "g1f3", "b8c6"]),
    move_timestamps: JSON.stringify([]),
    final_fen: null,
    reaction: null,
    session_duration: 60,
    ...overrides,
  };
}

describe("recordMatchDetail Use Case", () => {
  it("shouldClassifyOpeningAndPhaseAndSaveToPortWhenMatchDetailIsRecorded", async () => {
    let savedDetail: EnrichedMatchDetailRecord | null = null;

    const fakePort: MatchPort = {
      async getMatchUserAndColor(matchId: string) {
        return { userId: "user-1", userColor: "white" };
      },
      async saveMatchDetail(detail: EnrichedMatchDetailRecord) {
        savedDetail = detail;
      },
      async getMatchDetail() { return null; },
      async getPendingMatchIds() { return { items: [], totalPending: 0, next: false }; },
    };

    const record = createBaseRecord({
      // Test array move_history support
      move_history: ["e2e4", "e7e5", "g1f3", "b8c6"] as unknown as string,
    });

    const result = await recordMatchDetail(fakePort, record);

    expect(result.matchId).toBe("match-123");
    expect(savedDetail).not.toBeNull();
    const detail = savedDetail as unknown as EnrichedMatchDetailRecord;
    expect(detail.ply_count).toBe(4);
    expect(detail.phase_key).toBe("opening");
    expect(detail.opening_key).toBe("e2e4");
  });

  it("shouldFetchUserColorFromPortWhenUserColorIsNotPresentInRecord", async () => {
    let fetchedMatchId: string | null = null;
    let savedDetail: EnrichedMatchDetailRecord | null = null;

    const fakePort: MatchPort = {
      async getMatchUserAndColor(matchId: string) {
        fetchedMatchId = matchId;
        return { userId: "user-black", userColor: "black" };
      },
      async saveMatchDetail(detail: EnrichedMatchDetailRecord) {
        savedDetail = detail;
      },
      async getMatchDetail() { return null; },
      async getPendingMatchIds() { return { items: [], totalPending: 0, next: false }; },
    };

    const record = createBaseRecord({
      match_id: "match-456",
      user_id: "user-black",
      move_history: JSON.stringify(["e2e4", "c7c5"]),
    });

    const result = await recordMatchDetail(fakePort, record);

    expect(result.matchId).toBe("match-456");
    expect(fetchedMatchId).toBe("match-456");
    const detail = savedDetail as unknown as EnrichedMatchDetailRecord;
    expect(detail.opening_key).toBe("e2e4 c7c5");
  });

  it("shouldUseUserColorFromRecordWhenProvidedDirectly", async () => {
    let fetchedMatchId: string | null = null;
    let savedDetail: EnrichedMatchDetailRecord | null = null;

    const fakePort: MatchPort = {
      async getMatchUserAndColor(matchId: string) {
        fetchedMatchId = matchId;
        return { userId: "user-white", userColor: "black" };
      },
      async saveMatchDetail(detail: EnrichedMatchDetailRecord) {
        savedDetail = detail;
      },
      async getMatchDetail() { return null; },
      async getPendingMatchIds() { return { items: [], totalPending: 0, next: false }; },
    };

    const record = createBaseRecord({
      match_id: "match-789",
      user_id: "user-white",
      user_color: "white",
      move_history: JSON.stringify(["d2d4", "d7d5"]),
    });

    const result = await recordMatchDetail(fakePort, record);

    expect(result.matchId).toBe("match-789");
    expect(fetchedMatchId).toBe("match-789"); // ownership lookup always runs
    const detail = savedDetail as unknown as EnrichedMatchDetailRecord;
    expect(detail.user_color).toBe("white"); // record color still wins over port color
    expect(detail.opening_key).toBe("d2d4");
  });

  it("shouldParseStringMoveHistoryWhenProvidedAsJsonString", async () => {
    let savedDetail: EnrichedMatchDetailRecord | null = null;

    const fakePort: MatchPort = {
      async getMatchUserAndColor() { return { userId: "u", userColor: "white" }; },
      async saveMatchDetail(detail: EnrichedMatchDetailRecord) { savedDetail = detail; },
      async getMatchDetail() { return null; },
      async getPendingMatchIds() { return { items: [], totalPending: 0, next: false }; },
    };

    const record = createBaseRecord({
      match_id: "match-str",
      user_id: "u",
      move_history: JSON.stringify(["e2e4", "e7e5"]),
    });

    await recordMatchDetail(fakePort, record);

    const detail = savedDetail as unknown as EnrichedMatchDetailRecord;
    expect(detail.ply_count).toBe(2);
    expect(detail.phase_key).toBe("opening");
    expect(detail.opening_key).toBe("e2e4");
  });

  it("shouldHandleCorruptedJsonMoveHistoryWhenRecordingMatchDetail", async () => {
    let savedDetail: EnrichedMatchDetailRecord | null = null;

    const fakePort: MatchPort = {
      async getMatchUserAndColor() { return { userId: "u", userColor: "white" }; },
      async saveMatchDetail(detail: EnrichedMatchDetailRecord) { savedDetail = detail; },
      async getMatchDetail() { return null; },
      async getPendingMatchIds() { return { items: [], totalPending: 0, next: false }; },
    };

    const record = createBaseRecord({
      match_id: "match-bad-json",
      user_id: "u",
      move_history: "not-json{",
    });

    await recordMatchDetail(fakePort, record);

    const detail = savedDetail as unknown as EnrichedMatchDetailRecord;
    expect(detail.ply_count).toBe(0);
    expect(detail.phase_key).toBe("unknown");
    expect(detail.opening_key).toBe("unclassified");
  });

  it("shouldRejectSaveWhenMatchDoesNotExist", async () => {
    let saved: unknown = null;
    const fakePort: MatchPort = {
      async getMatchUserAndColor() { return null; },
      async saveMatchDetail(detail: EnrichedMatchDetailRecord) { saved = detail; },
      async getMatchDetail() { return null; },
      async getPendingMatchIds() { return { items: [], totalPending: 0, next: false }; },
    };

    await expect(recordMatchDetail(fakePort, createBaseRecord())).rejects.toThrow(NotFoundError);
    expect(saved).toBeNull();
  });

  it("shouldRejectSaveWhenRecordUserIdIsNotTheMatchOwner", async () => {
    let saved: unknown = null;
    const fakePort: MatchPort = {
      async getMatchUserAndColor() { return { userId: "user-2", userColor: "white" }; },
      async saveMatchDetail(detail: EnrichedMatchDetailRecord) { saved = detail; },
      async getMatchDetail() { return null; },
      async getPendingMatchIds() { return { items: [], totalPending: 0, next: false }; },
    };

    await expect(recordMatchDetail(fakePort, createBaseRecord({ user_id: "user-1" })))
      .rejects.toThrow(OwnershipViolationError);
    expect(saved).toBeNull();
  });

  it("shouldAdoptMatchOwnerUserIdWhenRecordOmitsIt", async () => {
    let saved: unknown = null;
    const fakePort: MatchPort = {
      async getMatchUserAndColor() { return { userId: "user-1", userColor: "white" }; },
      async saveMatchDetail(detail: EnrichedMatchDetailRecord) { saved = detail; },
      async getMatchDetail() { return null; },
      async getPendingMatchIds() { return { items: [], totalPending: 0, next: false }; },
    };

    await recordMatchDetail(fakePort, createBaseRecord({ user_id: "" }));

    expect(saved).not.toBeNull();
    expect((saved as EnrichedMatchDetailRecord).user_id).toBe("user-1");
  });
});
