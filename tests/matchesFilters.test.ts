import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
import { readFileSync } from "node:fs";
import { handleMatches } from "../src/api/stats.ts";

function createTestDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../migrations/0001_init.sql", import.meta.url).pathname, "utf8"));
  db.exec(readFileSync(new URL("../migrations/0005_played_at.sql", import.meta.url).pathname, "utf8"));
  db.exec(readFileSync(new URL("../migrations/0006_match_details.sql", import.meta.url).pathname, "utf8"));
  db.exec(readFileSync(new URL("../migrations/0007_openings_and_phases.sql", import.meta.url).pathname, "utf8"));

  const d1 = {
    prepare(sql: string) {
      return {
        bind(...args: any[]) {
          return {
            first: async () => db.prepare(sql).get(...args) ?? null,
            all: async () => ({ results: db.prepare(sql).all(...args) }),
            run: async () => {
              const res = db.prepare(sql).run(...args);
              return { meta: { changes: Number(res.changes) } };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return { db, d1 };
}

describe("GET /api/matches with opening and phase filters", () => {
  it("shouldReturnOpeningKeyPhaseKeyPlyCountOnRowsAndFilterByOpeningAndPhaseParams", async () => {
    const { db, d1 } = createTestDb();

    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result, user_color)
      VALUES 
        ('m1', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 100, 'win', 'white'),
        ('m2', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 200, 'loss', 'white'),
        ('m3', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 300, 'win', 'black')
    `).run();

    db.prepare(`
      INSERT INTO match_details (match_id, user_id, status, move_history, move_timestamps, opening_key, phase_key, ply_count)
      VALUES 
        ('m1', 'u1', 'completed', '[]', '[]', 'e2e4', 'opening', 30),
        ('m2', 'u1', 'completed', '[]', '[]', 'e2e4', 'endgame', 95),
        ('m3', 'u1', 'completed', '[]', '[]', 'e2e4 e7e5', 'middlegame', 65)
    `).run();

    // 1. Verify rows include opening_key, phase_key, ply_count
    const resAll = await handleMatches(d1, new URL("http://localhost/api/matches"));
    const dataAll = await resAll.json() as any;
    expect(dataAll.total).toBe(3);
    expect(dataAll.rows[0].opening_key).toBeDefined();
    expect(dataAll.rows[0].phase_key).toBeDefined();
    expect(dataAll.rows[0].ply_count).toBeDefined();

    // 2. Filter by ?opening=e2e4
    const resOpening = await handleMatches(d1, new URL("http://localhost/api/matches?opening=e2e4"));
    const dataOpening = await resOpening.json() as any;
    expect(dataOpening.total).toBe(2);
    expect(dataOpening.rows.every((r: any) => r.opening_key === "e2e4")).toBe(true);

    // 3. Filter by ?phase=endgame
    const resPhase = await handleMatches(d1, new URL("http://localhost/api/matches?phase=endgame"));
    const dataPhase = await resPhase.json() as any;
    expect(dataPhase.total).toBe(1);
    expect(dataPhase.rows[0].match_id).toBe("m2");
    expect(dataPhase.rows[0].phase_key).toBe("endgame");

    // 4. Combined filter ?opening=e2e4&phase=opening
    const resBoth = await handleMatches(d1, new URL("http://localhost/api/matches?opening=e2e4&phase=opening"));
    const dataBoth = await resBoth.json() as any;
    expect(dataBoth.total).toBe(1);
    expect(dataBoth.rows[0].match_id).toBe("m1");
    expect(dataBoth.rows[0].opening_key).toBe("e2e4");
    expect(dataBoth.rows[0].phase_key).toBe("opening");
  });

  it("shouldFilterWithOpponentSegmentTogetherWithOpeningAndPhase", async () => {
    const { db, d1 } = createTestDb();

    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result, user_color, opponent_type)
      VALUES 
        ('m1', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 100, 'win', 'white', 'bot'),
        ('m2', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 200, 'loss', 'white', 'bot'),
        ('m3', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 300, 'win', 'white', 'pvp')
    `).run();

    db.prepare(`
      INSERT INTO match_details (match_id, user_id, status, move_history, move_timestamps, opening_key, phase_key, ply_count, opponent_id)
      VALUES 
        ('m1', 'u1', 'completed', '[]', '[]', 'e2e4', 'opening', 30, 'stockfish'),
        ('m2', 'u1', 'completed', '[]', '[]', 'e2e4', 'opening', 35, 'noisy_neural_v2'),
        ('m3', 'u1', 'completed', '[]', '[]', 'e2e4', 'opening', 25, '12345678')
    `).run();

    const res = await handleMatches(d1, new URL("http://localhost/api/matches?opponentSegment=stockfish&opening=e2e4&phase=opening"));
    const data = await res.json() as any;
    expect(data.total).toBe(1);
    expect(data.rows[0].match_id).toBe("m1");
    expect(data.rows[0].opening_key).toBe("e2e4");
    expect(data.rows[0].phase_key).toBe("opening");
    expect(data.rows[0].opponent_segment).toBe("stockfish");
  });
});
