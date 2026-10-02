import { describe, it, expect } from "vitest";
import { setupTestDb } from "./helpers/testDb.ts";
import { createD1WhatChangedAdapter } from "../src/infrastructure/d1/d1WhatChangedAdapter.ts";

describe("d1WhatChangedAdapter", () => {
  describe("resolveUserId", () => {
    it("shouldReturnExplicitUserIdWhenExplicitIdExistsInDatabase", async () => {
      const { db, d1 } = setupTestDb();
      db.prepare("INSERT INTO users (id, created_at) VALUES ('custom-user-123', '2026-09-20T00:00:00.000Z')").run();
      const adapter = createD1WhatChangedAdapter(d1);

      const resolved = await adapter.resolveUserId("custom-user-123");
      expect(resolved).toBe("custom-user-123");
    });

    it("shouldReturnNullWhenExplicitIdDoesNotExistInDatabase", async () => {
      const { d1 } = setupTestDb();
      const adapter = createD1WhatChangedAdapter(d1);

      const resolved = await adapter.resolveUserId("custom-user-123");
      expect(resolved).toBeNull();
    });

    it("shouldReturnExplicitUserIdWhenExplicitIdExistsInDataOwners", async () => {
      const { db, d1 } = setupTestDb();
      db.prepare(`
        INSERT INTO user_state (user_id, total_xp, streak, current_course_id, updated_at)
        VALUES ('owner-user', 500, 10, 'DUOLINGO_EN', '2026-09-20T00:00:00.000Z')
      `).run();
      const adapter = createD1WhatChangedAdapter(d1);

      const resolved = await adapter.resolveUserId("owner-user");
      expect(resolved).toBe("owner-user");
    });

    it("shouldResolveSingleUserFromDataOwnersWhenSingleOwnerExists", async () => {
      const { db, d1 } = setupTestDb();
      const adapter = createD1WhatChangedAdapter(d1);

      db.prepare(`
        INSERT INTO user_state (user_id, total_xp, streak, current_course_id, updated_at)
        VALUES ('u1', 500, 10, 'DUOLINGO_EN', '2026-09-20T00:00:00.000Z')
      `).run();

      const resolved = await adapter.resolveUserId();
      expect(resolved).toBe("u1");
    });

    it("shouldResolveSingleUserFromMatchesWhenMatchesExist", async () => {
      const { db, d1 } = setupTestDb();
      const adapter = createD1WhatChangedAdapter(d1);

      db.prepare(`
        INSERT INTO matches (match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at, played_at)
        VALUES ('m1', 'u_chess', 's1', '{}', '2026-09-20', '2026-09-20', 1700000000)
      `).run();

      const resolved = await adapter.resolveUserId();
      expect(resolved).toBe("u_chess");
    });

    it("shouldResolveSingleUserFromUsersTableWhenNoDataOwnersExist", async () => {
      const { db, d1 } = setupTestDb();
      const adapter = createD1WhatChangedAdapter(d1);

      db.prepare(`
        INSERT INTO users (id, created_at)
        VALUES ('user_solo', '2026-09-20T00:00:00.000Z')
      `).run();

      const resolved = await adapter.resolveUserId();
      expect(resolved).toBe("user_solo");
    });

    it("shouldReturnNullWhenMultipleDataOwnersExist", async () => {
      const { db, d1 } = setupTestDb();
      const adapter = createD1WhatChangedAdapter(d1);

      db.prepare(`
        INSERT INTO user_state (user_id, total_xp, streak, current_course_id, updated_at)
        VALUES ('u1', 500, 10, 'DUOLINGO_EN', '2026-09-20T00:00:00.000Z')
      `).run();
      db.prepare(`
        INSERT INTO courses (user_id, course_id, last_seen_at)
        VALUES ('u2', 'course_es', '2026-09-20T00:00:00.000Z')
      `).run();

      const resolved = await adapter.resolveUserId();
      expect(resolved).toBeNull();
    });

    it("shouldReturnNullWhenNoUsersExistInDatabase", async () => {
      const { d1 } = setupTestDb();
      const adapter = createD1WhatChangedAdapter(d1);

      const resolved = await adapter.resolveUserId();
      expect(resolved).toBeNull();
    });
  });

  describe("getChessBaseline", () => {
    it("shouldReturnExactOrPreviousBaselineWhenMatchExistsBeforeOrAtSince", async () => {
      const { db, d1 } = setupTestDb();
      const adapter = createD1WhatChangedAdapter(d1);

      const sinceIso = "2026-09-25T12:00:00.000Z";
      const sinceSec = Math.floor(new Date(sinceIso).getTime() / 1000);

      // Match 1: prior win (white)
      db.prepare(`
        INSERT INTO matches (match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at, played_at, user_color, result, page_elo)
        VALUES ('m1', 'u1', 's1', '{}', '2026-09-20', '2026-09-20', ?, 'white', 'win', 700)
      `).run(sinceSec - 1000);

      // Match 2: latest at since (black, loss, detail with elo_after = 720)
      db.prepare(`
        INSERT INTO matches (match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at, played_at, user_color, result, page_elo)
        VALUES ('m2', 'u1', 's1', '{}', '2026-09-25', '2026-09-25', ?, 'black', 'loss', 700)
      `).run(sinceSec);

      db.prepare(`
        INSERT INTO match_details (match_id, user_id, elo_after, status, move_history, move_timestamps)
        VALUES ('m2', 'u1', 720, 'finished', '', '')
      `).run();

      const baseline = await adapter.getChessBaseline("u1", sinceIso);

      expect(baseline.status).toBe("exactOrPrevious");
      expect(baseline.data).not.toBeNull();
      expect(baseline.data?.rating).toBe(720);
      expect(baseline.data?.lifetimeGames).toBe(2);
      expect(baseline.data?.lifetimeWins).toBe(1);
      expect(baseline.data?.observedAt).toBe(new Date(sinceSec * 1000).toISOString());
    });

    it("shouldReturnFirstHistoricalBaselineWhenMatchesExistOnlyAfterSince", async () => {
      const { db, d1 } = setupTestDb();
      const adapter = createD1WhatChangedAdapter(d1);

      const sinceIso = "2026-09-25T12:00:00.000Z";
      const sinceSec = Math.floor(new Date(sinceIso).getTime() / 1000);
      const futureSec = sinceSec + 5000;

      // Match in future relative to since
      db.prepare(`
        INSERT INTO matches (match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at, played_at, user_color, result, page_elo)
        VALUES ('m_future', 'u1', 's1', '{}', '2026-09-26', '2026-09-26', ?, 'white', 'win', 800)
      `).run(futureSec);

      const baseline = await adapter.getChessBaseline("u1", sinceIso);

      expect(baseline.status).toBe("firstHistorical");
      expect(baseline.data).not.toBeNull();
      expect(baseline.data?.rating).toBe(800);
      expect(baseline.data?.lifetimeGames).toBe(0);
      expect(baseline.data?.lifetimeWins).toBe(0);
      expect(baseline.data?.observedAt).toBe(new Date(futureSec * 1000).toISOString());
    });

    it("shouldReturnUnavailableBaselineWhenNoMatchesExistForUser", async () => {
      const { d1 } = setupTestDb();
      const adapter = createD1WhatChangedAdapter(d1);

      const baseline = await adapter.getChessBaseline("u_unknown", "2026-09-25T12:00:00.000Z");
      expect(baseline.status).toBe("unavailable");
      expect(baseline.data).toBeNull();
    });
  });

  describe("getChessInterval", () => {
    it("shouldComputeIntervalMetricsWhenMatchesOccurInInterval", async () => {
      const { db, d1 } = setupTestDb();
      const adapter = createD1WhatChangedAdapter(d1);

      const sinceIso = "2026-09-20T00:00:00.000Z";
      const untilIso = "2026-09-27T00:00:00.000Z";
      const sinceSec = Math.floor(new Date(sinceIso).getTime() / 1000);
      const untilSec = Math.floor(new Date(untilIso).getTime() / 1000);

      // Match 0: before window (should not be counted)
      db.prepare(`
        INSERT INTO matches (match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at, played_at, user_color, result, page_elo)
        VALUES ('m0', 'u1', 's1', '{}', '2026-09-19', '2026-09-19', ?, 'white', 'win', 600)
      `).run(sinceSec - 100);

      // Match 1: white win inside interval
      db.prepare(`
        INSERT INTO matches (match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at, played_at, user_color, result, page_elo)
        VALUES ('m1', 'u1', 's1', '{}', '2026-09-21', '2026-09-21', ?, 'white', 'win', 650)
      `).run(sinceSec + 100);

      // Match 2: black win inside interval
      db.prepare(`
        INSERT INTO matches (match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at, played_at, user_color, result, page_elo)
        VALUES ('m2', 'u1', 's1', '{}', '2026-09-22', '2026-09-22', ?, 'black', 'win', 700)
      `).run(sinceSec + 200);

      // Match 3: black loss inside interval (latest in interval, with elo_after = 715)
      db.prepare(`
        INSERT INTO matches (match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at, played_at, user_color, result, page_elo)
        VALUES ('m3', 'u1', 's1', '{}', '2026-09-23', '2026-09-23', ?, 'black', 'loss', 700)
      `).run(sinceSec + 300);

      db.prepare(`
        INSERT INTO match_details (match_id, user_id, elo_after, status, move_history, move_timestamps)
        VALUES ('m3', 'u1', 715, 'finished', '', '')
      `).run();

      // Match 4: after window (should not be counted)
      db.prepare(`
        INSERT INTO matches (match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at, played_at, user_color, result, page_elo)
        VALUES ('m4', 'u1', 's1', '{}', '2026-09-28', '2026-09-28', ?, 'white', 'win', 750)
      `).run(untilSec + 100);

      const interval = await adapter.getChessInterval("u1", sinceIso, untilIso);

      expect(interval.gamesCount).toBe(3);
      expect(interval.wins).toBe(2);
      expect(interval.whiteGames).toBe(1);
      expect(interval.whiteWins).toBe(1);
      expect(interval.blackGames).toBe(2);
      expect(interval.blackWins).toBe(1);
      expect(interval.latestRating).toBe(715);
    });

    it("shouldReturnZeroMetricsAndNullRatingWhenNoMatchesInInterval", async () => {
      const { d1 } = setupTestDb();
      const adapter = createD1WhatChangedAdapter(d1);

      const interval = await adapter.getChessInterval(
        "u1",
        "2026-09-20T00:00:00.000Z",
        "2026-09-27T00:00:00.000Z"
      );

      expect(interval.gamesCount).toBe(0);
      expect(interval.wins).toBe(0);
      expect(interval.whiteGames).toBe(0);
      expect(interval.whiteWins).toBe(0);
      expect(interval.blackGames).toBe(0);
      expect(interval.blackWins).toBe(0);
      expect(interval.latestRating).toBeNull();
    });
  });

  describe("getLanguagesBaseline", () => {
    it("shouldReturnExactOrPreviousLanguagesBaselineWhenSnapshotExistsBeforeOrAtTimestamp", async () => {
      const { db, d1 } = setupTestDb();
      const adapter = createD1WhatChangedAdapter(d1);

      const rawJson = JSON.stringify({
        user: { totalXp: 1250, currentCourseId: "DUOLINGO_XD_EN", streak: 42 },
      });

      db.prepare(`
        INSERT INTO snapshots (id, created_at, source, user_id, raw_json, games_count, pages_count, checksum, size_bytes)
        VALUES ('snap1', '2026-09-24T10:00:00.000Z', 'duolingo-lang', 'u_lang', ?, 0, 0, 'c1', 100)
      `).run(rawJson);

      const baseline = await adapter.getLanguagesBaseline("u_lang", "2026-09-25T00:00:00.000Z");

      expect(baseline.status).toBe("exactOrPrevious");
      expect(baseline.data).not.toBeNull();
      expect(baseline.data?.totalXp).toBe(1250);
      expect(baseline.data?.activeCourseId).toBe("DUOLINGO_XD_EN");
      expect(baseline.data?.streak).toBe(42);
      expect(baseline.data?.observedAt).toBe("2026-09-24T10:00:00.000Z");
    });

    it("shouldReturnFirstHistoricalLanguagesBaselineWhenSnapshotsExistOnlyAfterTimestamp", async () => {
      const { db, d1 } = setupTestDb();
      const adapter = createD1WhatChangedAdapter(d1);

      const rawJson = JSON.stringify({
        user: { totalXp: 1500, currentCourseId: "DUOLINGO_XC_EN", streak: 5 },
      });

      db.prepare(`
        INSERT INTO snapshots (id, created_at, source, user_id, raw_json, games_count, pages_count, checksum, size_bytes)
        VALUES ('snap_future', '2026-09-28T00:00:00.000Z', 'duolingo-lang', 'u_lang', ?, 0, 0, 'c_fut', 100)
      `).run(rawJson);

      const baseline = await adapter.getLanguagesBaseline("u_lang", "2026-09-25T00:00:00.000Z");

      expect(baseline.status).toBe("firstHistorical");
      expect(baseline.data).not.toBeNull();
      expect(baseline.data?.totalXp).toBe(1500);
      expect(baseline.data?.activeCourseId).toBe("DUOLINGO_XC_EN");
      expect(baseline.data?.streak).toBe(5);
      expect(baseline.data?.observedAt).toBe("2026-09-28T00:00:00.000Z");
    });

    it("shouldFallbackToUserStateWhenNoSnapshotExists", async () => {
      const { db, d1 } = setupTestDb();
      const adapter = createD1WhatChangedAdapter(d1);

      db.prepare(`
        INSERT INTO user_state (user_id, total_xp, streak, current_course_id, updated_at)
        VALUES ('u_state_only', 2000, 15, 'DUOLINGO_ES_EN', '2026-09-20T00:00:00.000Z')
      `).run();

      const baseline = await adapter.getLanguagesBaseline("u_state_only", "2026-09-25T00:00:00.000Z");

      expect(baseline.status).toBe("exactOrPrevious");
      expect(baseline.data).not.toBeNull();
      expect(baseline.data?.totalXp).toBe(2000);
      expect(baseline.data?.activeCourseId).toBe("DUOLINGO_ES_EN");
      expect(baseline.data?.streak).toBe(15);
      expect(baseline.data?.observedAt).toBe("2026-09-20T00:00:00.000Z");
    });

    it("shouldReturnUnavailableLanguagesBaselineWhenNoSnapshotNorUserStateExists", async () => {
      const { d1 } = setupTestDb();
      const adapter = createD1WhatChangedAdapter(d1);

      const baseline = await adapter.getLanguagesBaseline("u_none", "2026-09-25T00:00:00.000Z");
      expect(baseline.status).toBe("unavailable");
      expect(baseline.data).toBeNull();
    });
  });

  describe("getLanguagesTarget", () => {
    it("shouldReturnExactOrPreviousLanguagesTargetWhenSnapshotExistsBeforeOrAtTimestamp", async () => {
      const { db, d1 } = setupTestDb();
      const adapter = createD1WhatChangedAdapter(d1);

      db.prepare(`
        INSERT INTO snapshots (id, created_at, source, user_id, raw_json, games_count, pages_count, checksum, size_bytes)
        VALUES ('snap1', '2026-09-24T10:00:00.000Z', 'duolingo-lang', 'u_lang', ?, 0, 0, 'c1', 100)
      `).run(JSON.stringify({ user: { totalXp: 1250, currentCourseId: "DUOLINGO_XD_EN", streak: 42 } }));

      const target = await adapter.getLanguagesTarget("u_lang", "2026-09-25T00:00:00.000Z");

      expect(target.status).toBe("exactOrPrevious");
      expect(target.data).not.toBeNull();
      expect(target.data?.totalXp).toBe(1250);
      expect(target.data?.activeCourseId).toBe("DUOLINGO_XD_EN");
      expect(target.data?.streak).toBe(42);
      expect(target.data?.observedAt).toBe("2026-09-24T10:00:00.000Z");
    });

    it("shouldReturnHistoricalSnapshotAtPastUntilInsteadOfPresentUserState", async () => {
      const { db, d1 } = setupTestDb();
      const adapter = createD1WhatChangedAdapter(d1);

      // Snapshot from past (August): Demo Delta course, streak 10
      db.prepare(`
        INSERT INTO snapshots (id, created_at, source, user_id, raw_json, games_count, pages_count, checksum, size_bytes)
        VALUES ('snap_past', '2026-08-10T00:00:00.000Z', 'duolingo-lang', 'u_lang', ?, 0, 0, 'c_past', 100)
      `).run(JSON.stringify({ user: { totalXp: 5000, currentCourseId: "DUOLINGO_XD_EN", streak: 10 } }));

      // Snapshot from today (October): Demo Alpha course, streak 60
      db.prepare(`
        INSERT INTO snapshots (id, created_at, source, user_id, raw_json, games_count, pages_count, checksum, size_bytes)
        VALUES ('snap_today', '2026-10-01T00:00:00.000Z', 'duolingo-lang', 'u_lang', ?, 0, 0, 'c_now', 100)
      `).run(JSON.stringify({ user: { totalXp: 15000, currentCourseId: "DUOLINGO_XA_EN", streak: 60 } }));

      // user_state currently has Demo Alpha, streak 60
      db.prepare(`
        INSERT INTO user_state (user_id, total_xp, streak, current_course_id, updated_at)
        VALUES ('u_lang', 15000, 60, 'DUOLINGO_XA_EN', '2026-10-01T00:00:00.000Z')
      `).run();

      // Query point-in-time at historical until: 2026-08-15
      const target = await adapter.getLanguagesTarget("u_lang", "2026-08-15T00:00:00.000Z");

      expect(target.status).toBe("exactOrPrevious");
      expect(target.data?.activeCourseId).toBe("DUOLINGO_XD_EN");
      expect(target.data?.streak).toBe(10);
      expect(target.data?.observedAt).toBe("2026-08-10T00:00:00.000Z");
    });

    it("shouldReturnUnavailableLanguagesTargetWhenSnapshotsExistOnlyAfterTimestamp", async () => {
      const { db, d1 } = setupTestDb();
      const adapter = createD1WhatChangedAdapter(d1);

      db.prepare(`
        INSERT INTO snapshots (id, created_at, source, user_id, raw_json, games_count, pages_count, checksum, size_bytes)
        VALUES ('snap_future', '2026-09-28T00:00:00.000Z', 'duolingo-lang', 'u_lang', ?, 0, 0, 'c_fut', 100)
      `).run(JSON.stringify({ user: { totalXp: 1500, currentCourseId: "DUOLINGO_XC_EN", streak: 5 } }));

      // Query target before the first snapshot: must NEVER return firstHistorical, must be unavailable
      const target = await adapter.getLanguagesTarget("u_lang", "2026-09-25T00:00:00.000Z");

      expect(target.status).toBe("unavailable");
      expect(target.data).toBeNull();
    });

    it("shouldFallbackToUserStateForLanguagesTargetWhenNoSnapshotExistsAndUserStateUpdatedBeforeOrAtTimestamp", async () => {
      const { db, d1 } = setupTestDb();
      const adapter = createD1WhatChangedAdapter(d1);

      db.prepare(`
        INSERT INTO user_state (user_id, total_xp, streak, current_course_id, updated_at)
        VALUES ('u_state_only', 2000, 15, 'DUOLINGO_ES_EN', '2026-09-20T00:00:00.000Z')
      `).run();

      const target = await adapter.getLanguagesTarget("u_state_only", "2026-09-25T00:00:00.000Z");

      expect(target.status).toBe("exactOrPrevious");
      expect(target.data).not.toBeNull();
      expect(target.data?.totalXp).toBe(2000);
      expect(target.data?.activeCourseId).toBe("DUOLINGO_ES_EN");
      expect(target.data?.streak).toBe(15);
      expect(target.data?.observedAt).toBe("2026-09-20T00:00:00.000Z");
    });

    it("shouldReturnUnavailableLanguagesTargetWhenUserStateUpdatedAfterTimestamp", async () => {
      const { db, d1 } = setupTestDb();
      const adapter = createD1WhatChangedAdapter(d1);

      db.prepare(`
        INSERT INTO user_state (user_id, total_xp, streak, current_course_id, updated_at)
        VALUES ('u_future_state', 3000, 20, 'DUOLINGO_XD_EN', '2026-10-01T00:00:00.000Z')
      `).run();

      const target = await adapter.getLanguagesTarget("u_future_state", "2026-09-25T00:00:00.000Z");

      expect(target.status).toBe("unavailable");
      expect(target.data).toBeNull();
    });

    it("shouldReturnUnavailableLanguagesTargetWhenNoSnapshotNorUserStateExists", async () => {
      const { d1 } = setupTestDb();
      const adapter = createD1WhatChangedAdapter(d1);

      const target = await adapter.getLanguagesTarget("u_none", "2026-09-25T00:00:00.000Z");
      expect(target.status).toBe("unavailable");
      expect(target.data).toBeNull();
    });
  });

  describe("getLanguagesInterval", () => {
    it("shouldAggregateXpSummariesAcrossCalendarDaysInSemiOpenInterval", async () => {
      const { db, d1 } = setupTestDb();
      const adapter = createD1WhatChangedAdapter(d1);

      // Intraday since and until
      const sinceIso = "2026-09-20T15:30:00.000Z";
      const untilIso = "2026-09-25T08:15:00.000Z";

      // Calendar day epochs (midnight UTC)
      const daySec = 86400;
      const day20Sec = Math.floor(new Date("2026-09-20T00:00:00Z").getTime() / 1000);
      const day21Sec = day20Sec + daySec;
      const day22Sec = day20Sec + daySec * 2;
      const day25Sec = day20Sec + daySec * 5;
      const day26Sec = day20Sec + daySec * 6;

      // Day 20 (same date as since, should be excluded by (sinceDate, untilDate])
      db.prepare(`
        INSERT INTO xp_summaries (user_id, date, gained_xp, num_sessions, total_session_time, updated_at)
        VALUES ('u_lang', ?, 200, 4, 800, '2026-09-20')
      `).run(day20Sec);

      // Day 21 inside window: 50 xp, 2 sessions, 600s
      db.prepare(`
        INSERT INTO xp_summaries (user_id, date, gained_xp, num_sessions, total_session_time, updated_at)
        VALUES ('u_lang', ?, 50, 2, 600, '2026-09-21')
      `).run(day21Sec);

      // Day 22 inside window: 100 xp, 3 sessions, 1200s
      db.prepare(`
        INSERT INTO xp_summaries (user_id, date, gained_xp, num_sessions, total_session_time, updated_at)
        VALUES ('u_lang', ?, 100, 3, 1200, '2026-09-22')
      `).run(day22Sec);

      // Day 25 inside window (same date as until): 75 xp, 1 session, 300s
      db.prepare(`
        INSERT INTO xp_summaries (user_id, date, gained_xp, num_sessions, total_session_time, updated_at)
        VALUES ('u_lang', ?, 75, 1, 300, '2026-09-25')
      `).run(day25Sec);

      // Day 26 outside window (after until date): 300 xp
      db.prepare(`
        INSERT INTO xp_summaries (user_id, date, gained_xp, num_sessions, total_session_time, updated_at)
        VALUES ('u_lang', ?, 300, 5, 2000, '2026-09-26')
      `).run(day26Sec);

      const interval = await adapter.getLanguagesInterval("u_lang", sinceIso, untilIso);

      // 50 + 100 + 75 = 225 XP (excluding day 20 and day 26)
      expect(interval.xpGained).toBe(225);
      expect(interval.sessionsCount).toBe(6);
      expect(interval.totalSessionMinutes).toBe(35); // (600 + 1200 + 300) / 60
      expect(interval.daysWithActivity).toBe(3);
    });

    it("shouldReturnZeroMetricsWhenSameDateProvidedForSinceAndUntil", async () => {
      const { db, d1 } = setupTestDb();
      const adapter = createD1WhatChangedAdapter(d1);

      const daySec = Math.floor(new Date("2026-09-20T00:00:00Z").getTime() / 1000);
      db.prepare(`
        INSERT INTO xp_summaries (user_id, date, gained_xp, num_sessions, total_session_time, updated_at)
        VALUES ('u_same', ?, 100, 2, 600, '2026-09-20')
      `).run(daySec);

      // Same day intraday range
      const interval = await adapter.getLanguagesInterval(
        "u_same",
        "2026-09-20T10:00:00.000Z",
        "2026-09-20T18:00:00.000Z"
      );

      expect(interval.xpGained).toBe(0);
      expect(interval.sessionsCount).toBe(0);
      expect(interval.totalSessionMinutes).toBe(0);
      expect(interval.daysWithActivity).toBe(0);
    });

    it("shouldReturnZeroMetricsWhenNoActivityExistsInInterval", async () => {
      const { d1 } = setupTestDb();
      const adapter = createD1WhatChangedAdapter(d1);

      const interval = await adapter.getLanguagesInterval(
        "u_empty",
        "2026-09-20T00:00:00.000Z",
        "2026-09-25T00:00:00.000Z"
      );

      expect(interval.xpGained).toBe(0);
      expect(interval.sessionsCount).toBe(0);
      expect(interval.totalSessionMinutes).toBe(0);
      expect(interval.daysWithActivity).toBe(0);
    });
  });


  describe("getHistoricalDailyXpRate", () => {
    it("shouldComputeHistoricalDailyXpRateWhenPriorActivityExists", async () => {
      const { db, d1 } = setupTestDb();
      const adapter = createD1WhatChangedAdapter(d1);

      const beforeIso = "2026-09-25T00:00:00.000Z";
      const beforeSec = Math.floor(new Date(beforeIso).getTime() / 1000);
      const daySec = 86400;

      // Two distinct days prior to beforeSec
      db.prepare(`
        INSERT INTO xp_summaries (user_id, date, gained_xp, num_sessions, total_session_time, updated_at)
        VALUES ('u_rate', ?, 120, 2, 600, '2026-09-20')
      `).run(beforeSec - daySec * 3);

      db.prepare(`
        INSERT INTO xp_summaries (user_id, date, gained_xp, num_sessions, total_session_time, updated_at)
        VALUES ('u_rate', ?, 80, 1, 300, '2026-09-21')
      `).run(beforeSec - daySec * 2);

      // Record after beforeSec (should not be included)
      db.prepare(`
        INSERT INTO xp_summaries (user_id, date, gained_xp, num_sessions, total_session_time, updated_at)
        VALUES ('u_rate', ?, 500, 5, 1000, '2026-09-26')
      `).run(beforeSec + daySec);

      const rate = await adapter.getHistoricalDailyXpRate("u_rate", beforeIso);

      // (120 + 80) / 2 days = 100 xp/day
      expect(rate).toBe(100);
    });

    it("shouldReturnZeroHistoricalRateWhenNoPriorActivityExists", async () => {
      const { d1 } = setupTestDb();
      const adapter = createD1WhatChangedAdapter(d1);

      const rate = await adapter.getHistoricalDailyXpRate("u_none", "2026-09-25T00:00:00.000Z");
      expect(rate).toBe(0);
    });
  });
});
