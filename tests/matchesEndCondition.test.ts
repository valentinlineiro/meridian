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

describe("GET /api/matches with end_condition", () => {
  it("shouldReturnEndConditionOnRowsAndFilterByEndConditionParam", async () => {
    const { db, d1 } = createTestDb();

    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result)
      VALUES 
        ('m1', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 100, 'win'),
        ('m2', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 200, 'loss')
    `).run();

    db.prepare(`
      INSERT INTO match_details (match_id, user_id, status, move_history, move_timestamps, end_condition)
      VALUES 
        ('m1', 'u1', 'completed', '[]', '[]', 'checkmate'),
        ('m2', 'u1', 'completed', '[]', '[]', 'disconnection')
    `).run();

    // 1. Check all rows include end_condition
    const resAll = await handleMatches(d1, new URL("http://localhost/api/matches"));
    const dataAll = await resAll.json() as any;
    expect(dataAll.total).toBe(2);
    expect(dataAll.rows[0].end_condition).toBeDefined();

    // 2. Filter by ?endCondition=disconnection
    const resFiltered = await handleMatches(d1, new URL("http://localhost/api/matches?endCondition=disconnection"));
    const dataFiltered = await resFiltered.json() as any;
    expect(dataFiltered.total).toBe(1);
    expect(dataFiltered.rows[0].match_id).toBe("m2");
    expect(dataFiltered.rows[0].end_condition).toBe("disconnection");
  });
});
