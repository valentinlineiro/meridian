import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
import { readFileSync } from "node:fs";
import { handleStats } from "../src/api/stats.ts";

function createTestDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../migrations/0001_init.sql", import.meta.url).pathname, "utf8"));
  db.exec(readFileSync(new URL("../migrations/0005_played_at.sql", import.meta.url).pathname, "utf8"));
  db.exec(readFileSync(new URL("../migrations/0006_match_details.sql", import.meta.url).pathname, "utf8"));

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
        first: async () => db.prepare(sql).get() ?? null,
        all: async () => ({ results: db.prepare(sql).all() }),
        run: async () => {
          const res = db.prepare(sql).run();
          return { meta: { changes: Number(res.changes) } };
        },
      };
    },
  } as unknown as D1Database;

  return { db, d1 };
}

describe("GET /api/stats/opponents", () => {
  it("shouldReturnCanonicalSegmentsOrderedByVolumeDescWithMacroBotsVsPvp", async () => {
    const { db, d1 } = createTestDb();

    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result, opponent_type)
      VALUES 
        ('m1', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 100, 'win', 'bot'),
        ('m2', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 200, 'win', 'bot'),
        ('m3', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 300, 'loss', 'bot'),
        ('m4', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 400, 'loss', 'pvp')
    `).run();

    db.prepare(`
      INSERT INTO match_details (match_id, user_id, status, move_history, move_timestamps, opponent_id)
      VALUES 
        ('m1', 'u1', 'completed', '[]', '[]', 'noisy_neural_v2-mid'),
        ('m2', 'u1', 'completed', '[]', '[]', 'noisy_neural_v2-high'),
        ('m3', 'u1', 'completed', '[]', '[]', 'stockfish-difficulty-9'),
        ('m4', 'u1', 'completed', '[]', '[]', '2000000001')
    `).run();

    const res = await handleStats(d1, "opponents", new URL("http://localhost/api/stats/opponents"));
    expect(res.status).toBe(200);
    const body = await res.json() as any;

    expect(body.segments).toBeDefined();
    expect(body.segments.length).toBe(3);
    // Ordered by games DESC
    expect(body.segments[0].key).toBe("noisy_neural");
    expect(body.segments[0].label).toBe("Noisy Neural");
    expect(body.segments[0].games).toBe(2);
    expect(body.segments[0].wins).toBe(2);
    expect(body.segments[0].winRate).toBe(1.0);

    expect(body.macro).toBeDefined();
    expect(body.macro.find((m: any) => m.key === "bot").games).toBe(3);
    expect(body.macro.find((m: any) => m.key === "pvp").games).toBe(1);

    expect(body.groups).toBeDefined(); // legacy alias
    expect(body.groups).toEqual(body.macro);
  });

  it("shouldFilterStatsByUserIdWhenProvided", async () => {
    const { db, d1 } = createTestDb();

    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result, opponent_type)
      VALUES 
        ('m1', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 100, 'win', 'bot'),
        ('m2', 'u2', 's1', '2026-09-28', '2026-09-28', '{}', 200, 'win', 'bot')
    `).run();

    db.prepare(`
      INSERT INTO match_details (match_id, user_id, status, move_history, move_timestamps, opponent_id)
      VALUES 
        ('m1', 'u1', 'completed', '[]', '[]', 'stockfish'),
        ('m2', 'u2', 'completed', '[]', '[]', 'blended-7')
    `).run();

    const res = await handleStats(d1, "opponents", new URL("http://localhost/api/stats/opponents?userId=u1"));
    expect(res.status).toBe(200);
    const body = await res.json() as any;

    expect(body.segments.length).toBe(1);
    expect(body.segments[0].key).toBe("stockfish");
    expect(body.macro.find((m: any) => m.key === "bot").games).toBe(1);
  });
});
