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

describe("GET /api/matches with opponent_segment", () => {
  it("shouldAttachOpponentSegmentToRowsAndSupportOpponentSegmentFilter", async () => {
    const { db, d1 } = createTestDb();

    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result, opponent_type)
      VALUES 
        ('m1', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 100, 'win', 'bot'),
        ('m2', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 200, 'loss', 'bot'),
        ('m3', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 300, 'loss', 'pvp'),
        ('m4', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 400, 'win', 'bot'),
        ('m5', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 500, 'draw', 'bot'),
        ('m6', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 600, 'win', 'bot')
    `).run();

    db.prepare(`
      INSERT INTO match_details (match_id, user_id, status, move_history, move_timestamps, opponent_id)
      VALUES 
        ('m1', 'u1', 'completed', '[]', '[]', 'noisy_neural_v2'),
        ('m2', 'u1', 'completed', '[]', '[]', 'blended-9-full-guard-rails'),
        ('m3', 'u1', 'completed', '[]', '[]', '2000000001'),
        ('m4', 'u1', 'completed', '[]', '[]', 'fairy_stockfish-difficulty-1'),
        ('m5', 'u1', 'completed', '[]', '[]', 'neural_v1-difficulty-21'),
        ('m6', 'u1', 'completed', '[]', '[]', 'unrecognized-engine')
    `).run();

    const resAll = await handleMatches(d1, new URL("http://localhost/api/matches"));
    const dataAll = await resAll.json() as any;
    expect(dataAll.total).toBe(6);
    expect(dataAll.rows[0].opponent_segment).toBeDefined();

    // Filter blended
    const resBlended = await handleMatches(d1, new URL("http://localhost/api/matches?opponentSegment=blended"));
    const dataBlended = await resBlended.json() as any;
    expect(dataBlended.total).toBe(1);
    expect(dataBlended.rows[0].match_id).toBe("m2");
    expect(dataBlended.rows[0].opponent_segment).toBe("blended");

    // Filter pvp
    const resPvp = await handleMatches(d1, new URL("http://localhost/api/matches?opponentSegment=pvp"));
    const dataPvp = await resPvp.json() as any;
    expect(dataPvp.total).toBe(1);
    expect(dataPvp.rows[0].match_id).toBe("m3");
    expect(dataPvp.rows[0].opponent_segment).toBe("pvp");

    // Filter stockfish (fairy_stockfish)
    const resStockfish = await handleMatches(d1, new URL("http://localhost/api/matches?opponentSegment=stockfish"));
    const dataStockfish = await resStockfish.json() as any;
    expect(dataStockfish.total).toBe(1);
    expect(dataStockfish.rows[0].match_id).toBe("m4");
    expect(dataStockfish.rows[0].opponent_segment).toBe("stockfish");

    // Filter neural
    const resNeural = await handleMatches(d1, new URL("http://localhost/api/matches?opponentSegment=neural"));
    const dataNeural = await resNeural.json() as any;
    expect(dataNeural.total).toBe(1);
    expect(dataNeural.rows[0].match_id).toBe("m5");
    expect(dataNeural.rows[0].opponent_segment).toBe("neural");

    // Filter unknown
    const resUnknown = await handleMatches(d1, new URL("http://localhost/api/matches?opponentSegment=unknown"));
    const dataUnknown = await resUnknown.json() as any;
    expect(dataUnknown.total).toBe(1);
    expect(dataUnknown.rows[0].match_id).toBe("m6");
    expect(dataUnknown.rows[0].opponent_segment).toBe("unknown");
  });
});
