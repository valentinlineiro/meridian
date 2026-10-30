import { describe, it, expect, beforeEach } from "vitest";
import { handleStats } from "../src/api/stats.ts";
import { createSqliteD1 } from "./helpers/sqliteD1.ts";

describe("GET /api/stats/mates", () => {
  let db: ReturnType<typeof createSqliteD1>["db"];
  let d1: D1Database;
  beforeEach(() => {
    const s = createSqliteD1(["0001_init.sql", "0005_played_at.sql", "0006_match_details.sql", "0007_openings_and_phases.sql", "0017_opening_family_mate_type.sql"]);
    db = s.db; d1 = s.d1;
    db.exec(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result, user_color) VALUES
        ('w1', 'u1', 's', 'd', 'd', '{}', 1, 'win', 'white'),
        ('w2', 'u1', 's', 'd', 'd', '{}', 2, 'win', 'white'),
        ('w3', 'u1', 's', 'd', 'd', '{}', 3, 'win', 'black'),
        ('l1', 'u1', 's', 'd', 'd', '{}', 4, 'loss', 'white'),
        ('d1', 'u1', 's', 'd', 'd', '{}', 5, 'draw', 'white'),
        ('p1', 'u1', 's', 'd', 'd', '{}', 6, 'win', 'white'),
        ('x1', 'u2', 's', 'd', 'd', '{}', 7, 'win', 'white'),
        ('t1', 'u1', 's', 'd', 'd', '{}', 8, 'win', 'white');
      INSERT INTO match_details (match_id, user_id, status, move_history, move_timestamps, end_condition, mate_type) VALUES
        ('w1', 'u1', 'c', '[]', '[]', 'checkmate', 'back_rank'),
        ('w2', 'u1', 'c', '[]', '[]', 'checkmate', 'back_rank'),
        ('w3', 'u1', 'c', '[]', '[]', 'checkmate', 'queen'),
        ('l1', 'u1', 'c', '[]', '[]', 'checkmate', 'smothered'),
        ('d1', 'u1', 'c', '[]', '[]', 'checkmate', 'rook'),
        ('p1', 'u1', 'c', '[]', '[]', 'checkmate', NULL),
        ('x1', 'u2', 'c', '[]', '[]', 'checkmate', 'pawn'),
        ('t1', 'u1', 'c', '[]', '[]', 'timeout', NULL);
    `);
  });
  const get = async (qs = "") => await (await handleStats(d1, "mates", new URL(`http://localhost/api/stats/mates${qs}`))).json() as any;

  it("shouldCountMatesGivenOnWinsAndReceivedOnLossesWithSpanishLabels", async () => {
    const body = await get("?userId=u1");
    expect(body.given).toEqual([
      { type: "back_rank", label: "Mate del pasillo", games: 2 },
      { type: "queen", label: "Mate con dama", games: 1 },
    ]);
    expect(body.received).toEqual([{ type: "smothered", label: "Mate ahogado", games: 1 }]);
  });

  it("shouldIgnoreMatesOnDrawsAndOtherUsers", async () => {
    const body = await get("?userId=u1");
    expect(JSON.stringify(body)).not.toContain("rook");
    expect(JSON.stringify(body)).not.toContain("pawn");
  });

  it("shouldCountCheckmatesWithoutTypeAsUnclassifiedAndIgnoreNonMates", async () => {
    expect((await get("?userId=u1")).unclassified).toBe(1);
  });
});
