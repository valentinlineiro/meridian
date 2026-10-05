import { describe, it, expect } from "vitest";
import { setupTestDb } from "./helpers/testDb.ts";
import { createD1TrajectoryAdapter } from "../src/infrastructure/d1/d1TrajectoryAdapter.ts";

describe("d1TrajectoryAdapter", () => {
  describe("getChessTrajectoryData", () => {
    it("shouldComputeChessTrajectoryWithChronologicalSplitHalfWhenMatchesExist", async () => {
      const { db, d1 } = setupTestDb();
      const adapter = createD1TrajectoryAdapter(d1);

      const startSec = Math.floor(new Date("2026-01-01T00:00:00Z").getTime() / 1000);
      const midSec = Math.floor(new Date("2026-04-01T00:00:00Z").getTime() / 1000);

      // Insert 40 white wins, 40 black losses in H1 [startSec, midSec)
      for (let i = 0; i < 40; i++) {
        const t = startSec + i * 1000;
        db.prepare(`
          INSERT INTO matches (match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at, played_at, user_color, result)
          VALUES (?, 'u1', 's1', '{}', '2026-01-01', '2026-01-01', ?, 'white', 'win')
        `).run(`mw1_${i}`, t);
        db.prepare(`
          INSERT INTO matches (match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at, played_at, user_color, result)
          VALUES (?, 'u1', 's1', '{}', '2026-01-01', '2026-01-01', ?, 'black', 'loss')
        `).run(`mb1_${i}`, t + 100);
      }

      // Insert 40 white wins, 40 black losses in H2 [midSec, endSec]
      for (let i = 0; i < 40; i++) {
        const t = midSec + i * 1000;
        db.prepare(`
          INSERT INTO matches (match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at, played_at, user_color, result)
          VALUES (?, 'u1', 's1', '{}', '2026-04-01', '2026-04-01', ?, 'white', 'win')
        `).run(`mw2_${i}`, t);
        db.prepare(`
          INSERT INTO matches (match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at, played_at, user_color, result)
          VALUES (?, 'u1', 's1', '{}', '2026-04-01', '2026-04-01', ?, 'black', 'loss')
        `).run(`mb2_${i}`, t + 100);
      }

      const chessData = await adapter.getChessTrajectoryData("u1");

      expect(chessData.totalGames).toBe(160);
      expect(chessData.whiteGames).toBe(80);
      expect(chessData.whiteWins).toBe(80);
      expect(chessData.blackGames).toBe(80);
      expect(chessData.blackWins).toBe(0);
      expect(chessData.h1.whiteGames).toBe(40);
      expect(chessData.h1.whiteWins).toBe(40);
      expect(chessData.h1.blackGames).toBe(40);
      expect(chessData.h1.blackWins).toBe(0);
      expect(chessData.h2.whiteGames).toBe(40);
      expect(chessData.h2.whiteWins).toBe(40);
      expect(chessData.h2.blackGames).toBe(40);
      expect(chessData.h2.blackWins).toBe(0);
      expect(chessData.startedAt).toBe(new Date(startSec * 1000).toISOString());
      expect(chessData.endedAt).toBe(new Date((midSec + 39 * 1000 + 100) * 1000).toISOString());
    });

    it("shouldReturnEmptyDataWhenUserHasNoChessMatches", async () => {
      const { d1 } = setupTestDb();
      const adapter = createD1TrajectoryAdapter(d1);

      const chessData = await adapter.getChessTrajectoryData("u_none");
      expect(chessData.totalGames).toBe(0);
      expect(chessData.activeDays).toBe(0);
      expect(chessData.startedAt).toBeNull();
      expect(chessData.endedAt).toBeNull();
      expect(chessData.whiteGames).toBe(0);
      expect(chessData.whiteWins).toBe(0);
      expect(chessData.blackGames).toBe(0);
      expect(chessData.blackWins).toBe(0);
      expect(chessData.h1).toEqual({ whiteGames: 0, whiteDecided: 0, whiteWins: 0, blackGames: 0, blackDecided: 0, blackWins: 0 });
      expect(chessData.h2).toEqual({ whiteGames: 0, whiteDecided: 0, whiteWins: 0, blackGames: 0, blackDecided: 0, blackWins: 0 });
    });
  });

  describe("getLanguagesTrajectoryData", () => {
    it("shouldComputeLanguagesTrajectoryWithChronologicalSplitHalfWhenXpSummariesExist", async () => {
      const { db, d1 } = setupTestDb();
      const adapter = createD1TrajectoryAdapter(d1);

      // Start: 2026-01-01, Mid: 2026-04-01, End: 2026-07-01
      const tStartIso = "2026-01-01T00:00:00.000Z";
      const tMidIso = "2026-04-01T00:00:00.000Z";
      const tEndIso = "2026-07-01T00:00:00.000Z";

      // Snapshot at Start: FR has 1,000 XP, RU has 0 XP
      db.prepare(`
        INSERT INTO snapshots (id, created_at, source, user_id, raw_json, games_count, pages_count, checksum, size_bytes)
        VALUES ('snap_start', ?, 'duolingo-lang', 'u1', ?, 0, 0, 'c1', 100)
      `).run(
        tStartIso,
        JSON.stringify({
          courses: [
            { id: "DUOLINGO_XC_EN", xp: 1000 },
            { id: "DUOLINGO_XB_EN", xp: 0 },
          ],
        })
      );

      // Snapshot at Mid: FR has 6,000 XP (+5,000), RU has 200 XP (+200)
      db.prepare(`
        INSERT INTO snapshots (id, created_at, source, user_id, raw_json, games_count, pages_count, checksum, size_bytes)
        VALUES ('snap_mid', ?, 'duolingo-lang', 'u1', ?, 0, 0, 'c2', 100)
      `).run(
        tMidIso,
        JSON.stringify({
          courses: [
            { id: "DUOLINGO_XC_EN", xp: 6000 },
            { id: "DUOLINGO_XB_EN", xp: 200 },
          ],
        })
      );

      // Snapshot at End: FR has 6,500 XP (+500), RU has 8,200 XP (+8,000)
      db.prepare(`
        INSERT INTO snapshots (id, created_at, source, user_id, raw_json, games_count, pages_count, checksum, size_bytes)
        VALUES ('snap_end', ?, 'duolingo-lang', 'u1', ?, 0, 0, 'c3', 100)
      `).run(
        tEndIso,
        JSON.stringify({
          courses: [
            { id: "DUOLINGO_XC_EN", xp: 6500 },
            { id: "DUOLINGO_XB_EN", xp: 8200 },
          ],
        })
      );

      // Add xp_summaries for active days
      db.prepare(`
        INSERT INTO xp_summaries (user_id, date, gained_xp, num_sessions, total_session_time, updated_at)
        VALUES ('u1', ?, 50, 1, 10, '2026-01-01')
      `).run(Math.floor(new Date("2026-01-05T00:00:00Z").getTime() / 1000));
      db.prepare(`
        INSERT INTO xp_summaries (user_id, date, gained_xp, num_sessions, total_session_time, updated_at)
        VALUES ('u1', ?, 50, 1, 10, '2026-05-01')
      `).run(Math.floor(new Date("2026-05-05T00:00:00Z").getTime() / 1000));

      const langData = await adapter.getLanguagesTrajectoryData("u1");

      expect(langData.startedAt).toBe(tStartIso);
      expect(langData.endedAt).toBe(tEndIso);
      expect(langData.activeDays).toBeGreaterThanOrEqual(2);
      expect(langData.h1.courses).toEqual([
        { courseId: "DUOLINGO_XC_EN", xp: 5000 },
        { courseId: "DUOLINGO_XB_EN", xp: 200 },
      ]);
      expect(langData.h2.courses).toEqual([
        { courseId: "DUOLINGO_XC_EN", xp: 500 },
        { courseId: "DUOLINGO_XB_EN", xp: 8000 },
      ]);
    });

    it("shouldAnchorLanguageErasToSnapshotSpanWhenXpSummariesExtendBeyondIt", async () => {
      const { db, d1 } = setupTestDb();
      const adapter = createD1TrajectoryAdapter(d1);
      const snap = (id: string, at: string, fr: number, ru: number) =>
        db.prepare(`
          INSERT INTO snapshots (id, created_at, source, user_id, raw_json, games_count, pages_count, checksum, size_bytes)
          VALUES (?, ?, 'duolingo-lang', 'u1', ?, 0, 0, ?, 100)
        `).run(id, at, JSON.stringify({ courses: [{ id: "DUOLINGO_XC_EN", xp: fr }, { id: "DUOLINGO_XB_EN", xp: ru }] }), id);
      snap("a", "2026-03-01T00:00:00.000Z", 0, 0);
      snap("b", "2026-05-01T00:00:00.000Z", 3000, 0);
      snap("c", "2026-07-01T00:00:00.000Z", 3000, 3000);
      const day = (iso: string) =>
        db.prepare(`
          INSERT INTO xp_summaries (user_id, date, gained_xp, num_sessions, total_session_time, updated_at)
          VALUES ('u1', ?, 50, 1, 10, '2026-01-01')
        `).run(Math.floor(new Date(iso).getTime() / 1000));
      day("2026-01-05T00:00:00Z"); // before first snapshot
      day("2026-04-05T00:00:00Z"); // inside span
      day("2026-12-05T00:00:00Z"); // after last snapshot

      const langData = await adapter.getLanguagesTrajectoryData("u1");

      expect(langData.startedAt).toBe("2026-03-01T00:00:00.000Z");
      expect(langData.endedAt).toBe("2026-07-01T00:00:00.000Z");
      expect(langData.activeDays).toBe(1);
      expect(langData.h1.courses).toEqual([{ courseId: "DUOLINGO_XC_EN", xp: 3000 }]);
      expect(langData.h2.courses).toEqual([{ courseId: "DUOLINGO_XB_EN", xp: 3000 }]);
    });

    it("shouldReturnEmptyDataWhenUserHasNoLanguageActivity", async () => {
      const { d1 } = setupTestDb();
      const adapter = createD1TrajectoryAdapter(d1);

      const langData = await adapter.getLanguagesTrajectoryData("u_none");
      expect(langData.activeDays).toBe(0);
      expect(langData.startedAt).toBeNull();
      expect(langData.endedAt).toBeNull();
      expect(langData.h1.courses).toEqual([]);
      expect(langData.h2.courses).toEqual([]);
    });
  });

  describe("resolveUserId", () => {
    it("shouldResolveExplicitUserIdWhenUserExistsInDatabase", async () => {
      const { db, d1 } = setupTestDb();
      db.prepare("INSERT INTO users (id, created_at) VALUES ('u_custom', '2026-01-01')").run();
      const adapter = createD1TrajectoryAdapter(d1);

      const resolved = await adapter.resolveUserId("u_custom");
      expect(resolved).toBe("u_custom");
    });

    it("shouldReturnNullWhenExplicitUserDoesNotExist", async () => {
      const { d1 } = setupTestDb();
      const adapter = createD1TrajectoryAdapter(d1);

      const resolved = await adapter.resolveUserId("u_nonexistent");
      expect(resolved).toBeNull();
    });

    it("shouldResolveDefaultUserIdWhenSingleDataOwnerExists", async () => {
      const { db, d1 } = setupTestDb();
      db.prepare(`
        INSERT INTO matches (match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at, played_at)
        VALUES ('m1', 'u_owner', 's1', '{}', '2026-01-01', '2026-01-01', 1700000000)
      `).run();
      const adapter = createD1TrajectoryAdapter(d1);

      const resolved = await adapter.resolveUserId();
      expect(resolved).toBe("u_owner");
    });

    it("shouldReturnNullWhenNoUserIdentitiesFound", async () => {
      const { d1 } = setupTestDb();
      const adapter = createD1TrajectoryAdapter(d1);

      const resolved = await adapter.resolveUserId();
      expect(resolved).toBeNull();
    });
  });
});
