import { describe, it, expect } from "vitest";
import { setupTestDb } from "./helpers/testDb.ts";
import { createD1WhatChangedAdapter } from "../src/infrastructure/d1/d1WhatChangedAdapter.ts";

// One game of the single test user; `snapshotId` is the snapshot that saw it first (its batch).
const game = (db: any, id: string, snapshotId: string, playedAt: number, pageElo: number | null, color = "white", result = "win") => {
  db.prepare(`INSERT OR IGNORE INTO snapshots (id, created_at, source, user_id, raw_json, games_count, pages_count, checksum, size_bytes)
    VALUES (?, '2026-12-31T00:00:00.000Z', 'duolingo-chess', 'u1', '{}', 0, 0, ?, 2)`).run(snapshotId, "chk-" + snapshotId);
  db.prepare(`
    INSERT INTO matches (match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at, played_at, user_color, result, page_elo)
    VALUES (?, 'u1', ?, '{}', '2026-09-21', '2026-09-21', ?, ?, ?, ?)
  `).run(id, snapshotId, playedAt, color, result, pageElo);
};

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

      game(db, "m1", "s1", sinceSec - 1000, 700, "white", "win");
      // latest at since; same batch, so it is the anchor. Its detail's elo_after is NOT read (A4 §12.2.1).
      game(db, "m2", "s1", sinceSec, 700, "black", "loss");
      db.prepare(`
        INSERT INTO match_details (match_id, user_id, elo_after, status, move_history, move_timestamps)
        VALUES ('m2', 'u1', 720, 'finished', '', '')
      `).run();

      const baseline = await adapter.getChessBaseline("u1", sinceIso);

      expect(baseline.status).toBe("exactOrPrevious");
      expect(baseline.data?.rating).toBe(700);
      expect(baseline.data?.lifetimeGames).toBe(2);
      expect(baseline.data?.lifetimeWins).toBe(1);
      expect(baseline.data?.observedAt).toBe(new Date(sinceSec * 1000).toISOString());
    });

    it("shouldReturnNoBaselineRatingWhenTheLatestGameBeforeSinceIsNotItsBatchAnchor", async () => {
      const { db, d1 } = setupTestDb();
      const sinceIso = "2026-09-25T12:00:00.000Z";
      const sinceSec = Math.floor(new Date(sinceIso).getTime() / 1000);
      game(db, "before", "s_hist", sinceSec - 1000, 992);
      game(db, "after", "s_hist", sinceSec + 1000, 992); // the batch's anchor, played after `since`

      const baseline = await createD1WhatChangedAdapter(d1).getChessBaseline("u1", sinceIso);

      expect(baseline.status).toBe("exactOrPrevious");
      expect(baseline.data?.lifetimeGames).toBe(1); // the game is still counted for results
      expect(baseline.data?.rating).toBeNull(); // but it has no ELO of its own
    });

    it("shouldReturnNoBaselineRatingWhenTheLastSecondOfTheBaselineBatchIsTied", async () => {
      const { db, d1 } = setupTestDb();
      const sinceIso = "2026-09-25T12:00:00.000Z";
      const sinceSec = Math.floor(new Date(sinceIso).getTime() / 1000);
      game(db, "m1", "s1", sinceSec - 500, 700);
      game(db, "m2", "s1", sinceSec - 500, 700); // tied maximum played_at: the batch has no anchor

      const baseline = await createD1WhatChangedAdapter(d1).getChessBaseline("u1", sinceIso);

      expect(baseline.data?.lifetimeGames).toBe(2);
      expect(baseline.data?.rating).toBeNull();
      expect(baseline.data?.ratingAt).toBeNull();
    });

    it("shouldPlaceTheBaselineRatingAtItsAnchorNotAtTheLastGameWhenTheyDiffer", async () => {
      const { db, d1 } = setupTestDb();
      const sinceIso = "2026-09-25T12:00:00.000Z";
      const sinceSec = Math.floor(new Date(sinceIso).getTime() / 1000);
      game(db, "anchor", "s1", sinceSec - 5000, 700);
      game(db, "later_non_anchor", "s2", sinceSec - 100, 710);
      game(db, "s2_anchor_after_since", "s2", sinceSec + 100, 710);

      const baseline = await createD1WhatChangedAdapter(d1).getChessBaseline("u1", sinceIso);

      expect(baseline.data?.observedAt).toBe(new Date((sinceSec - 100) * 1000).toISOString()); // counters: last game <= since
      expect(baseline.data?.rating).toBe(700); // ELO: last anchor <= since
      expect(baseline.data?.ratingAt).toBe(new Date((sinceSec - 5000) * 1000).toISOString());
    });

    it("shouldReturnFirstHistoricalBaselineWithoutARatingWhenMatchesExistOnlyAfterSince", async () => {
      const { db, d1 } = setupTestDb();
      const adapter = createD1WhatChangedAdapter(d1);

      const sinceIso = "2026-09-25T12:00:00.000Z";
      const sinceSec = Math.floor(new Date(sinceIso).getTime() / 1000);
      const futureSec = sinceSec + 5000;

      game(db, "m_future", "s1", futureSec, 800, "white", "win");

      const baseline = await adapter.getChessBaseline("u1", sinceIso);

      expect(baseline.status).toBe("firstHistorical");
      expect(baseline.data?.rating).toBeNull(); // no anchor at or before `since`
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

      game(db, "m0", "s0", sinceSec - 100, 600, "white", "win"); // before the window
      game(db, "m1", "s1", sinceSec + 100, 650, "white", "win");
      game(db, "m2", "s1", sinceSec + 200, 700, "black", "win");
      game(db, "m3", "s1", sinceSec + 300, 700, "black", "loss"); // latest of its batch: the anchor
      db.prepare(`
        INSERT INTO match_details (match_id, user_id, elo_after, status, move_history, move_timestamps)
        VALUES ('m3', 'u1', 715, 'finished', '', '')
      `).run(); // elo_after is not read (A4 §12.2.1)
      game(db, "m4", "s2", untilSec + 100, 750, "white", "win"); // after the window

      const interval = await adapter.getChessInterval("u1", sinceIso, untilIso);

      expect(interval.gamesCount).toBe(3);
      expect(interval.wins).toBe(2);
      expect(interval.whiteGames).toBe(1);
      expect(interval.whiteWins).toBe(1);
      expect(interval.blackGames).toBe(2);
      expect(interval.blackWins).toBe(1);
      expect(interval.latestRating).toBe(700);
    });

    describe("ELO anchors (amendment A4)", () => {
      const sinceIso = "2026-09-20T00:00:00.000Z";
      const untilIso = "2026-09-27T00:00:00.000Z";
      const sinceSec = Math.floor(new Date(sinceIso).getTime() / 1000);
      const untilSec = Math.floor(new Date(untilIso).getTime() / 1000);
      const rating = async (d1: any) => (await createD1WhatChangedAdapter(d1).getChessInterval("u1", sinceIso, untilIso)).latestRating;

      it("shouldGiveNoEloToAGameInTheWindowWhenItsBatchAnchorWasPlayedLater", async () => {
        const { db, d1 } = setupTestDb();
        game(db, "in_window", "s1", sinceSec + 100, 650);
        game(db, "anchor_after", "s1", untilSec + 100, 650);
        expect(await rating(d1)).toBeNull();
      });

      it("shouldGiveTheSnapshotEloToTheLastPlayedGameOfItsBatch", async () => {
        const { db, d1 } = setupTestDb();
        game(db, "early", "s1", sinceSec + 100, 650);
        game(db, "late", "s1", sinceSec + 200, 650);
        expect(await rating(d1)).toBe(650);
      });

      it("shouldNotFallBackToAnEarlierGameOfTheBatchWhenTheAnchorHasNoRating", async () => {
        const { db, d1 } = setupTestDb();
        game(db, "m1", "s1", sinceSec + 100, 650);
        game(db, "m2", "s1", sinceSec + 200, null);
        expect(await rating(d1)).toBeNull();
      });

      it("shouldYieldNoAnchorWhenTheLastSecondOfTheBatchIsTied", async () => {
        const { db, d1 } = setupTestDb();
        game(db, "m1", "s1", sinceSec + 200, 650);
        game(db, "m2", "s1", sinceSec + 200, 650);
        expect(await rating(d1)).toBeNull();
      });

      it("shouldReturnTheLatestAnchorInTheWindowWhenSeveralSnapshotsObserveIt", async () => {
        const { db, d1 } = setupTestDb();
        game(db, "m1", "s1", sinceSec + 100, 650);
        game(db, "m2", "s2", sinceSec + 200, 680);
        expect(await rating(d1)).toBe(680);
      });

      it("shouldNotReadEloAfterEvenWhenTheGameIsTheAnchor", async () => {
        const { db, d1 } = setupTestDb();
        game(db, "m1", "s1", sinceSec + 100, 650);
        db.prepare(`INSERT INTO match_details (match_id, user_id, elo_after, status, move_history, move_timestamps) VALUES ('m1','u1',999,'finished','','')`).run();
        expect(await rating(d1)).toBe(650);
      });

      it("shouldIgnoreABatchWhoseSnapshotWasNeverStored", async () => {
        // a failed ingestion attempt leaves games pointing at an id with no snapshot row: not an ELO observation
        const { db, d1 } = setupTestDb();
        db.prepare(`INSERT INTO matches (match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at, played_at, user_color, result, page_elo)
          VALUES ('orphan', 'u1', 'attempt-that-failed', '{}', '2026-09-21', '2026-09-21', ?, 'white', 'win', 650)`).run(sinceSec + 100);
        const interval = await createD1WhatChangedAdapter(d1).getChessInterval("u1", sinceIso, untilIso);
        expect(interval.gamesCount).toBe(1);
        expect(interval.latestRating).toBeNull();
        expect(interval.latestRatingAt).toBeNull();
      });

      it("shouldReportTheInstantOfTheAnchorGameWithTheLatestRating", async () => {
        const { db, d1 } = setupTestDb();
        game(db, "m1", "s1", sinceSec + 100, 650);
        game(db, "m2", "s2", sinceSec + 200, 680);
        const interval = await createD1WhatChangedAdapter(d1).getChessInterval("u1", sinceIso, untilIso);
        expect(interval.latestRatingAt).toBe(new Date((sinceSec + 200) * 1000).toISOString());
      });

      it("shouldReturnNullRatingWhenGamesExistButNoneHasARating", async () => {
        const { db, d1 } = setupTestDb();
        game(db, "m1", "s1", sinceSec + 100, null);
        game(db, "m2", "s2", sinceSec + 200, null);
        expect((await createD1WhatChangedAdapter(d1).getChessInterval("u1", sinceIso, untilIso)).gamesCount).toBe(2);
        expect(await rating(d1)).toBeNull();
      });
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
