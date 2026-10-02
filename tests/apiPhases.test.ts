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

describe("GET /api/stats/phases", () => {
  it("shouldReturnPhasesOrderedChronologicallyWithLabelsAndMedianPlies", async () => {
    const { db, d1 } = createTestDb();

    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result)
      VALUES 
        ('m1', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 100, 'win'),
        ('m2', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 200, 'loss'),
        ('m3', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 300, 'win'),
        ('m4', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 400, 'draw'),
        ('m5', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 500, 'win')
    `).run();

    db.prepare(`
      INSERT INTO match_details (match_id, user_id, status, move_history, move_timestamps, phase_key, ply_count)
      VALUES 
        ('m1', 'u1', 'completed', '[]', '[]', 'endgame', 90),
        ('m2', 'u1', 'completed', '[]', '[]', 'opening', 20),
        ('m3', 'u1', 'completed', '[]', '[]', 'middlegame', 60),
        ('m4', 'u1', 'completed', '[]', '[]', 'middlegame', 70),
        ('m5', 'u1', 'completed', '[]', '[]', 'endgame', 110)
    `).run();

    const res = await handleStats(d1, "phases", new URL("http://localhost/api/stats/phases"));
    expect(res.status).toBe(200);
    const body = await res.json() as any;

    expect(body.population).toEqual({
      hydrated: 5,
      totalMatches: 5,
    });

    // median plies of [20, 60, 70, 90, 110] is 70
    expect(body.medianPlies).toBe(70);

    // Phases in canonical order: opening, middlegame, endgame
    expect(body.phases).toBeDefined();
    expect(body.phases.length).toBe(3);

    expect(body.phases[0].key).toBe("opening");
    expect(body.phases[0].label).toBe("Apertura (< 40 plies)");
    expect(body.phases[0].games).toBe(1);
    expect(body.phases[0].wins).toBe(0);
    expect(body.phases[0].losses).toBe(1);
    expect(body.phases[0].draws).toBe(0);
    expect(body.phases[0].winRate).toBe(0);
    expect(body.phases[0].scoreRate).toBe(0);

    expect(body.phases[1].key).toBe("middlegame");
    expect(body.phases[1].label).toBe("Medio juego (40–80 plies)");
    expect(body.phases[1].games).toBe(2);
    expect(body.phases[1].wins).toBe(1);
    expect(body.phases[1].losses).toBe(0);
    expect(body.phases[1].draws).toBe(1);
    expect(body.phases[1].winRate).toBe(0.5); // 1 / 2
    expect(body.phases[1].scoreRate).toBe(0.75); // (1 + 0.5) / 2

    expect(body.phases[2].key).toBe("endgame");
    expect(body.phases[2].label).toBe("Final (> 80 plies)");
    expect(body.phases[2].games).toBe(2);
    expect(body.phases[2].wins).toBe(2);
    expect(body.phases[2].losses).toBe(0);
    expect(body.phases[2].draws).toBe(0);
    expect(body.phases[2].winRate).toBe(1.0);
    expect(body.phases[2].scoreRate).toBe(1.0);
  });

  it("shouldFilterPhasesStatsByUserIdWhenProvided", async () => {
    const { db, d1 } = createTestDb();

    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result)
      VALUES 
        ('m1', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 100, 'win'),
        ('m2', 'u2', 's1', '2026-09-28', '2026-09-28', '{}', 200, 'loss')
    `).run();

    db.prepare(`
      INSERT INTO match_details (match_id, user_id, status, move_history, move_timestamps, phase_key, ply_count)
      VALUES 
        ('m1', 'u1', 'completed', '[]', '[]', 'opening', 30),
        ('m2', 'u2', 'completed', '[]', '[]', 'endgame', 100)
    `).run();

    const res = await handleStats(d1, "phases", new URL("http://localhost/api/stats/phases?userId=u1"));
    expect(res.status).toBe(200);
    const body = await res.json() as any;

    expect(body.population.totalMatches).toBe(1);
    expect(body.population.hydrated).toBe(1);
    expect(body.medianPlies).toBe(30);
    expect(body.phases.length).toBe(1);
    expect(body.phases[0].key).toBe("opening");
  });
});
