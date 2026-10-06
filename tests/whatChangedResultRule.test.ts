import { describe, it, expect } from "vitest";
import { setupTestDb } from "./helpers/testDb.ts";
import { createD1WhatChangedAdapter } from "../src/infrastructure/d1/d1WhatChangedAdapter.ts";
import { getWhatChangedUseCase } from "../src/application/getWhatChangedUseCase.ts";
import { evaluateSignificantChanges, type WhatChangedDeltas } from "../src/domain/whatChanged.ts";
import type { WhatChangedPort } from "../src/ports/whatChangedPort.ts";

const SINCE = "2026-09-20T00:00:00.000Z";
const UNTIL = "2026-09-27T00:00:00.000Z";
const sinceSec = Date.parse(SINCE) / 1000;

function insert(db: any, id: string, playedAt: number | null, color: string | null, result: string | null, outcome: string | null = null) {
  db.prepare("INSERT INTO matches (match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at, played_at, user_color, result, outcome) VALUES (?, 'u1', 's1', '{}', 'x', 'x', ?, ?, ?, ?)")
    .run(id, playedAt, color, result, outcome);
}

describe("what-changed result rule (adapter)", () => {
  it("shouldClassifyIntervalResultsWithSharedRuleWhenVariantsAndUnknownsPresent", async () => {
    const { db, d1 } = setupTestDb();
    const t = sinceSec + 100;
    // white: 3 wins (win, victory, outcome fallback), 1 loss, 1 draw, 2 unknown
    insert(db, "w1", t, "white", "win"); insert(db, "w2", t + 1, "white", "victory");
    insert(db, "w3", t + 2, "white", null, "won"); insert(db, "w4", t + 3, "white", "defeat");
    insert(db, "w5", t + 4, "white", "stalemate"); insert(db, "w6", t + 5, "white", "garbage");
    insert(db, "w7", t + 6, "white", null, null);
    // black: 1 loss, 1 draw
    insert(db, "b1", t + 7, "black", "loss"); insert(db, "b2", t + 8, "black", "tie");
    // outside the metric's population: no timestamp, no colour
    insert(db, "x1", null, "white", "win"); insert(db, "x2", t + 9, null, "win");

    const i = await createD1WhatChangedAdapter(d1).getChessInterval("u1", SINCE, UNTIL);
    expect(i).toMatchObject({
      gamesCount: 9, decidedCount: 7, wins: 3,
      whiteGames: 7, whiteDecided: 5, whiteWins: 3,
      blackGames: 2, blackDecided: 2, blackWins: 0,
    });
  });

  it("shouldClassifyLifetimeBaselineWithSharedRuleWhenVariantsAndUnknownsPresent", async () => {
    const { db, d1 } = setupTestDb();
    insert(db, "a", sinceSec - 300, "white", "win"); insert(db, "b", sinceSec - 200, "black", "victory");
    insert(db, "c", sinceSec - 100, "white", "garbage");

    const b = await createD1WhatChangedAdapter(d1).getChessBaseline("u1", SINCE);
    expect(b.data).toMatchObject({ lifetimeGames: 3, lifetimeDecided: 2, lifetimeWins: 2 });
  });
});

function port(interval: Partial<Awaited<ReturnType<WhatChangedPort["getChessInterval"]>>>, lifetime = { lifetimeGames: 10, lifetimeDecided: 10, lifetimeWins: 5 }): WhatChangedPort {
  const none = { status: "unavailable", data: null } as const;
  return {
    resolveUserId: async () => "u1",
    getChessBaseline: async () => ({ status: "exactOrPrevious", data: { rating: 800, observedAt: SINCE, ...lifetime } }),
    getChessInterval: async () => ({ gamesCount: 0, decidedCount: 0, wins: 0, whiteGames: 0, whiteDecided: 0, whiteWins: 0, blackGames: 0, blackDecided: 0, blackWins: 0, latestRating: null, ...interval }),
    getLanguagesBaseline: async () => none, getLanguagesTarget: async () => none,
    getLanguagesInterval: async () => ({ xpGained: 0, sessionsCount: 0, totalSessionMinutes: 0, daysWithActivity: 0 }),
    getHistoricalDailyXpRate: async () => 0,
  };
}

describe("what-changed result rule (use case)", () => {
  it("shouldComputeRatesOverDecidedGamesWhenUnknownsPresent", async () => {
    const r = await getWhatChangedUseCase(port(
      { gamesCount: 10, decidedCount: 8, wins: 4, whiteGames: 6, whiteDecided: 4, whiteWins: 3, blackGames: 4, blackDecided: 4, blackWins: 1 },
      { lifetimeGames: 20, lifetimeDecided: 16, lifetimeWins: 4 },
    ), { since: SINCE, until: UNTIL });
    expect(r.chess).toMatchObject({ gamesCount: 10, decidedCount: 8, unknownCount: 2, intervalWinRate: 50, whiteWinRate: 75, blackWinRate: 25 });
    expect(r.chess.historicalWinRateDelta).toBe(25); // 50 - 4/16
  });

  it("shouldReturnNullRatesWhenNoGameIsDecided", async () => {
    const r = await getWhatChangedUseCase(port({ gamesCount: 3, whiteGames: 3 }), { since: SINCE, until: UNTIL });
    expect(r.chess).toMatchObject({ unknownCount: 3, intervalWinRate: null, whiteWinRate: null });
  });
});

describe("what-changed evidence gate", () => {
  const deltas = (gamesCount: number, decidedCount: number): WhatChangedDeltas => ({
    chess: { gamesCount, decidedCount, ratingDelta: 0, baselineRating: null, currentRating: null, intervalWinRate: 50, intervalWhiteWinRate: 70, intervalBlackWinRate: 30, historicalWinRateDelta: null, colorDelta: { diff: 40, lower: 5, upper: 70 }, historicalDelta: null },
    languages: { intervalDays: 7, xpGained: 0, sessionsCount: 0, totalSessionMinutes: 0, baselineCourseId: null, currentCourseId: null, courseChanged: false, dailyXpRate: 0, historicalDailyXpRate: 0 },
    streak: { baselineStreak: null, currentStreak: null, streakDelta: null, status: "active", streakStarted: false, streakMilestone: null },
  });
  const ctx = { userId: "u1", baselineAt: SINCE, until: UNTIL };
  const emits = (d: WhatChangedDeltas) => evaluateSignificantChanges(d, ctx).some((f) => f.id === "CHESS_COLOR_ASYMMETRY");

  it("shouldNotEmitColorAsymmetryWhenDecidedGamesBelowThresholdDespiteTenObserved", () => {
    expect(emits(deltas(10, 9))).toBe(false);
  });
  it("shouldEmitColorAsymmetryWhenTenDecidedGamesEvenIfMoreAreUnknown", () => {
    expect(emits(deltas(11, 10))).toBe(true);
  });
});
