import { describe, it, expect } from "vitest";
import { envSchema, importPayloadSchema, matchDetailEnvelope } from "../src/api/schemas.ts";

describe("envSchema", () => {
  it("shouldAcceptEnvWhenDbHasPrepareMethod", () => {
    expect(() => envSchema.parse({ DB: { prepare: () => null } })).not.toThrow();
  });

  it("shouldRejectEnvWhenDbIsMissingPrepareMethod", () => {
    expect(() => envSchema.parse({ DB: {} })).toThrow();
  });

  it("shouldRejectEnvWhenImportTokenIsNotAString", () => {
    expect(() => envSchema.parse({ DB: { prepare: () => null }, IMPORT_TOKEN: 123 })).toThrow();
  });

  it("shouldAcceptEnvWhenOptionalTokensAreAbsentAndIgnoreUnknownKeys", () => {
    expect(() => envSchema.parse({ DB: { prepare: () => null }, EXTRA: "ignored" })).not.toThrow();
  });
});

describe("importPayloadSchema", () => {
  it("shouldAcceptPayloadWithSourceUserIdAndData", () => {
    const result = importPayloadSchema.safeParse({
      source: "duolingo-lang",
      userId: "1000001",
      data: { user: { id: 1000001 }, courses: [] },
    });
    expect(result.success).toBe(true);
  });

  it("shouldAcceptPayloadWithNumericUserId", () => {
    expect(importPayloadSchema.safeParse({ source: "s", userId: 42, data: {} }).success).toBe(true);
  });

  it("shouldRejectPayloadWhenUserIdIsMissing", () => {
    expect(importPayloadSchema.safeParse({ source: "s", data: {} }).success).toBe(false);
  });

  it("shouldRejectPayloadWhenSourceIsEmpty", () => {
    expect(importPayloadSchema.safeParse({ source: "", userId: "u", data: {} }).success).toBe(false);
  });

  it("shouldRejectPayloadWhenDataIsNotAnObject", () => {
    expect(importPayloadSchema.safeParse({ source: "s", userId: "u", data: "text" }).success).toBe(false);
  });
});

describe("matchDetailEnvelope", () => {
  it("shouldAcceptPlainJsonObject", () => {
    expect(matchDetailEnvelope.safeParse({ matchId: "m", moveHistory: ["e2e4"] }).success).toBe(true);
  });

  it("shouldAcceptNestedDuolingoShapeWithoutTopLevelMatchId", () => {
    expect(matchDetailEnvelope.safeParse({ match: { id: "m", moveHistory: [] } }).success).toBe(true);
  });

  it("shouldRejectNonObjectJsonValues", () => {
    expect(matchDetailEnvelope.safeParse("hello").success).toBe(false);
    expect(matchDetailEnvelope.safeParse(42).success).toBe(false);
    expect(matchDetailEnvelope.safeParse(null).success).toBe(false);
    expect(matchDetailEnvelope.safeParse(["array"]).success).toBe(false);
  });
});
