import { describe, it, expect } from "vitest";
import { extractPlayedAt, normalizeMatch } from "../src/normalization/matches.ts";

describe("extractPlayedAt", () => {
  it("shouldExtractTimestampFromTwoPartBotMatchId2025Format", () => {
    expect(extractPlayedAt("bot|1766740707")).toBe(1766740707);
  });

  it("shouldExtractTimestampFromThreePartBotMatchId2026Format", () => {
    expect(extractPlayedAt("bot|1790000002|fixture-bot-002")).toBe(1790000002);
  });

  it("shouldExtractTimestampFromFourPartPvpMatchId", () => {
    expect(extractPlayedAt("pvp|1790000003|1000001|fixture-opponent-001")).toBe(1790000003);
  });

  it("shouldReturnNullForNonPipeSyntheticIdsOrUnknownPrefixes", () => {
    expect(extractPlayedAt("match-0001")).toBeNull();
    expect(extractPlayedAt("custom_id_123")).toBeNull();
    expect(extractPlayedAt("other|1766740707")).toBeNull();
    expect(extractPlayedAt("game|1790000002|token")).toBeNull();
  });

  it("shouldReturnNullForMalformedStrings", () => {
    expect(extractPlayedAt("")).toBeNull();
    expect(extractPlayedAt("bot||token")).toBeNull();
    expect(extractPlayedAt("bot|notanumber|token")).toBeNull();
    expect(extractPlayedAt("pvp")).toBeNull();
  });

  it("shouldReturnNullForNonStringInputs", () => {
    expect(extractPlayedAt(null)).toBeNull();
    expect(extractPlayedAt(undefined)).toBeNull();
    expect(extractPlayedAt(1790000002)).toBeNull();
    expect(extractPlayedAt({})).toBeNull();
  });

  it("shouldReturnNullForTimestampsOutsideReasonableEpochRange", () => {
    expect(extractPlayedAt("bot|0")).toBeNull();
    expect(extractPlayedAt("bot|1000000")).toBeNull(); // 1970
    expect(extractPlayedAt("bot|99999999999")).toBeNull(); // far future
    expect(extractPlayedAt("pvp|-1790000003|1|2")).toBeNull(); // negative
  });
});

describe("normalizeMatch with played_at", () => {
  it("shouldSetPlayedAtFromMatchId", () => {
    const raw = { matchId: "bot|1790000002|fixture-bot-002", opponentType: "bot", result: "win" };
    const row = normalizeMatch(raw, { userId: "1000001", pageNumber: 0, indexInPage: 0, pageElo: null });
    expect(row?.played_at).toBe(1790000002);
  });

  it("shouldSetPlayedAtToNullWhenMatchIdHasNoTimestamp", () => {
    const raw = { matchId: "match-0001", opponentType: "pvp", result: "win" };
    const row = normalizeMatch(raw, { userId: "1000001", pageNumber: 0, indexInPage: 0, pageElo: null });
    expect(row?.played_at).toBeNull();
  });
});
