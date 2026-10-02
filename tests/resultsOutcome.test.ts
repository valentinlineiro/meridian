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

describe("GET /api/stats/results with end conditions", () => {
  it("shouldComputeEndConditionsAcrossMatchesAndMatchDetails", async () => {
    const { db, d1 } = createTestDb();

    // Insert 3 matches
    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result)
      VALUES 
        ('m1', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 100, 'win'),
        ('m2', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 200, 'loss'),
        ('m3', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 300, 'loss')
    `).run();

    // Insert details: m1 checkmate (win), m2 checkmate (loss), m3 disconnection (loss)
    db.prepare(`
      INSERT INTO match_details (match_id, user_id, status, move_history, move_timestamps, end_condition)
      VALUES 
        ('m1', 'u1', 'completed', '[]', '[]', 'checkmate'),
        ('m2', 'u1', 'completed', '[]', '[]', 'checkmate'),
        ('m3', 'u1', 'completed', '[]', '[]', 'disconnection')
    `).run();

    const res = await handleStats(d1, "results", new URL("http://localhost/api/stats/results"));
    expect(res.status).toBe(200);
    const body = await res.json() as any;

    expect(body.games).toBe(3);
    expect(body.wins).toBe(1);
    expect(body.losses).toBe(2);
    expect(body.endConditions).toBeDefined();
    expect(body.endConditions.checkmate).toEqual({ total: 2, win: 1, loss: 1, draw: 0 });
    expect(body.endConditions.disconnection).toEqual({ total: 1, win: 0, loss: 1, draw: 0 });
  });

  it("shouldFilterByUserIdWhenProvidedInQueryParameters", async () => {
    const { db, d1 } = createTestDb();

    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result)
      VALUES 
        ('m1', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 100, 'win'),
        ('m2', 'u2', 's1', '2026-09-28', '2026-09-28', '{}', 200, 'loss')
    `).run();

    db.prepare(`
      INSERT INTO match_details (match_id, user_id, status, move_history, move_timestamps, end_condition)
      VALUES 
        ('m1', 'u1', 'completed', '[]', '[]', 'checkmate'),
        ('m2', 'u2', 'completed', '[]', '[]', 'resignation')
    `).run();

    const res = await handleStats(d1, "results", new URL("http://localhost/api/stats/results?userId=u1"));
    expect(res.status).toBe(200);
    const body = await res.json() as any;

    expect(body.games).toBe(1);
    expect(body.wins).toBe(1);
    expect(body.losses).toBe(0);
    expect(body.endConditions.checkmate).toEqual({ total: 1, win: 1, loss: 0, draw: 0 });
    expect(body.endConditions.resignation).toBeUndefined();
  });

  it("shouldTreatMatchesWithoutMatchDetailsAsUnknownEndCondition", async () => {
    const { db, d1 } = createTestDb();

    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result)
      VALUES 
        ('m1', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 100, 'loss')
    `).run();

    const res = await handleStats(d1, "results", new URL("http://localhost/api/stats/results"));
    expect(res.status).toBe(200);
    const body = await res.json() as any;

    expect(body.games).toBe(1);
    expect(body.losses).toBe(1);
    expect(body.endConditions.unknown).toEqual({ total: 1, win: 0, loss: 1, draw: 0 });
  });

  it("shouldHandleEmptyDatabaseGracefully", async () => {
    const { d1 } = createTestDb();

    const res = await handleStats(d1, "results", new URL("http://localhost/api/stats/results"));
    expect(res.status).toBe(200);
    const body = await res.json() as any;

    expect(body.games).toBe(0);
    expect(body.wins).toBe(0);
    expect(body.losses).toBe(0);
    expect(body.draws).toBe(0);
    expect(body.percentages).toEqual({ win: null, loss: null, draw: null });
    expect(body.endConditions).toEqual({});
  });

  it("shouldTrackDrawsProperlyInEndConditions", async () => {
    const { db, d1 } = createTestDb();

    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result)
      VALUES 
        ('m1', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 100, 'draw'),
        ('m2', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 200, 'draw')
    `).run();

    db.prepare(`
      INSERT INTO match_details (match_id, user_id, status, move_history, move_timestamps, end_condition)
      VALUES 
        ('m1', 'u1', 'completed', '[]', '[]', 'stalemate'),
        ('m2', 'u1', 'completed', '[]', '[]', 'repetition')
    `).run();

    const res = await handleStats(d1, "results", new URL("http://localhost/api/stats/results"));
    expect(res.status).toBe(200);
    const body = await res.json() as any;

    expect(body.games).toBe(2);
    expect(body.draws).toBe(2);
    expect(body.endConditions.stalemate).toEqual({ total: 1, win: 0, loss: 0, draw: 1 });
    expect(body.endConditions.repetition).toEqual({ total: 1, win: 0, loss: 0, draw: 1 });
  });
});
