import { describe, it, expect } from "vitest";
import { normalizeMatch, extractMatches } from "../src/normalization/matches.ts";
import { eloStats, summarize } from "../src/analytics/stats.ts";
import { stableStringify } from "../src/ingestion/hash.ts";
import { observeSchema } from "../src/ingestion/schemaObserve.ts";
import { summarizeLang } from "../src/analytics/lang.ts";

describe("normalization", () => {
  it("shouldKeepNullEloWhenBotOpponent", () => {
    const r = normalizeMatch({ matchId: "m1", opponentType: "bot", opponentEloRating: null, result: "win", userColor: "white", reviewed: true }, { userId: "u", pageNumber: 0, indexInPage: 0, pageElo: 800 });
    expect(r?.opponent_elo).toBeNull();
    expect(r?.opponent_type).toBe("bot");
  });
  it("shouldKeepNumericEloWhenPvpOpponent", () => {
    const r = normalizeMatch({ matchId: "m2", opponentType: "pvp", opponentEloRating: 861, result: "loss" }, { userId: "u", pageNumber: 1, indexInPage: 2, pageElo: null });
    expect(r?.opponent_elo).toBe(861);
  });
  it("shouldExtractAllPagesWhenMultiPagePayload", () => {
    const data = { eloRating: 900, pages: [{ matches: [{ matchId: "a" }] }, { matches: [{ matchId: "b" }, { matchId: "c" }] }] };
    expect(extractMatches(data, "u")).toHaveLength(3);
  });
});

describe("elo", () => {
  it("shouldAverageOnlyKnownElosWhenNullsPresent", () => {
    const s = eloStats([1000, 900, null, null, 800]);
    expect(s.count).toBe(3); expect(s.min).toBe(800); expect(s.max).toBe(1000); expect(s.avg).toBe(900);
  });
});

describe("stats", () => {
  it("shouldBalanceWinsLossesDrawsWhenAllKnown", () => {
    const rows = [...Array(3).fill({ result: "win" }), ...Array(2).fill({ result: "loss" }), { result: "draw" }];
    const s = summarize(rows as any);
    expect(s.wins + s.losses + s.draws).toBe(s.games);
  });

  it("shouldExcludeUnknownFromDenominatorWhenResultsAreMissing", () => {
    const rows = [...Array(3).fill({ result: "win" }), { result: "loss" }, { result: null, outcome: null }];
    const s = summarize(rows as any);
    expect(s.games).toBe(5);
    expect(s.unknown).toBe(1);
    expect(s.winRate).toBe(0.75);
    expect(s.scoreRate).toBe(0.75);
  });

  it("shouldReturnNullRatesWhenEveryResultIsUnknown", () => {
    const s = summarize([{ result: null, outcome: null }] as any);
    expect(s.unknown).toBe(1);
    expect(s.winRate).toBeNull();
    expect(s.scoreRate).toBeNull();
  });
});

describe("idempotency", () => {
  it("shouldDeduplicateWhenSamePayloadTwice", () => {
    const data = { matchHistory: [{ matchId: "x1" }, { matchId: "x2" }] };
    const h1 = stableStringify(data), h2 = stableStringify({ matchHistory: [{ matchId: "x1" }, { matchId: "x2" }] });
    expect(h1).toBe(h2);
    const seen = new Map<string, number>();
    for (let round = 0; round < 2; round++)
      for (const m of extractMatches(data, "u")) seen.set(m.row.match_id, (seen.get(m.row.match_id) ?? 0) + 1);
    expect(seen.size).toBe(2); // no dup rows, only re-seen
  });
});

describe("schema", () => {
  it("shouldDetectNewFieldWhenUnknownPathAppears", () => {
    const obs = observeSchema({ matchHistory: [{ matchId: "a", newField: 1 }] });
    expect(obs.some((o) => o.path.includes("newField"))).toBe(true);
  });
});

describe("lang", () => {
  it("shouldSummarizeXpAndSessionsWhenMultipleDays", () => {
    const data = {
      user: { totalXp: 5000, streak: 12, currentCourseId: "DUOLINGO_XC_ES", courses: [{ id: "DUOLINGO_XC_ES", title: "Demo Gamma", xp: 3000 }, { id: "DUOLINGO_XE_EN", title: "Demo Epsilon", xp: 500 }] },
      xp_summaries: [
        { date: 1790121600, gainedXp: 100, numSessions: 2, totalSessionTime: 300 },
        { date: 1790208000, gainedXp: 50, numSessions: 1, totalSessionTime: 100 },
        { date: 1790294400, gainedXp: 0, numSessions: 0, totalSessionTime: 0 },
      ],
    };
    const s = summarizeLang(data);
    expect(s.totalXp).toBe(5000);
    expect(s.streak).toBe(12);
    expect(s.courses).toHaveLength(2);
    expect(s.totals.days).toBe(3);
    expect(s.totals.activeDays).toBe(2);
    expect(s.totals.gainedXp).toBe(150);
    expect(s.totals.sessions).toBe(3);
    expect(s.totals.xpPerSession).toBe(50);
  });
  it("shouldHandleEmptySummariesWhenNoHistory", () => {
    const s = summarizeLang({ user: { totalXp: 0 }, xp_summaries: [] });
    expect(s.totals.days).toBe(0);
    expect(s.totals.gainedXp).toBe(0);
    expect(s.totals.avgXpPerDay).toBeNull();
    expect(s.summaries).toEqual([]);
  });
  it("shouldTolerateMissingFieldsWhenPartialPayload", () => {
    const s = summarizeLang({ xp_summaries: [{ date: 1790121600, gainedXp: 10 }] });
    expect(s.totalXp).toBeNull();
    expect(s.totals.gainedXp).toBe(10);
    expect(s.totals.sessions).toBe(0);
  });
});
