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

describe("GET /api/stats/openings", () => {
  it("shouldReturnOpeningsSortedByGamesDescWithMetadata", async () => {
    const { db, d1 } = createTestDb();

    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result, user_color)
      VALUES 
        ('m1', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 100, 'win', 'white'),
        ('m2', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 200, 'loss', 'white'),
        ('m3', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 300, 'draw', 'white'),
        ('m4', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 400, 'win', 'white'),
        ('m5', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 500, 'win', 'white'),
        ('m6', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 600, 'win', 'black'),
        ('m7', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 700, 'loss', 'black'),
        ('m8', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 800, 'draw', 'black'),
        ('m9', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 900, 'win', 'black')
    `).run();

    db.prepare(`
      INSERT INTO match_details (match_id, user_id, status, move_history, move_timestamps, opening_key, phase_key, ply_count)
      VALUES 
        ('m1', 'u1', 'completed', '[]', '[]', 'e2e4', 'middlegame', 50),
        ('m2', 'u1', 'completed', '[]', '[]', 'e2e4', 'middlegame', 60),
        ('m3', 'u1', 'completed', '[]', '[]', 'e2e4', 'endgame', 90),
        ('m4', 'u1', 'completed', '[]', '[]', 'd2d4', 'opening', 30),
        ('m5', 'u1', 'completed', '[]', '[]', 'other_white', 'opening', 20),
        ('m6', 'u1', 'completed', '[]', '[]', 'e2e4 e7e5', 'middlegame', 70),
        ('m7', 'u1', 'completed', '[]', '[]', 'e2e4 e7e5', 'middlegame', 75),
        ('m8', 'u1', 'completed', '[]', '[]', 'e2e4 c7c5', 'endgame', 100),
        ('m9', 'u1', 'completed', '[]', '[]', 'other_black', 'opening', 15)
    `).run();

    const res = await handleStats(d1, "openings", new URL("http://localhost/api/stats/openings"));
    expect(res.status).toBe(200);
    const body = await res.json() as any;

    expect(body.population).toEqual({
      hydrated: 9,
      totalMatches: 9,
    });

    // White openings sorted by games DESC
    expect(body.white).toBeDefined();
    expect(body.white.length).toBe(3);

    // e2e4: 3 games (1 win, 1 loss, 1 draw)
    const e4 = body.white[0];
    expect(e4.key).toBe("e2e4");
    expect(e4.name).toBe("Peón de Rey");
    expect(e4.notation).toBe("1. e4");
    expect(e4.games).toBe(3);
    expect(e4.wins).toBe(1);
    expect(e4.losses).toBe(1);
    expect(e4.draws).toBe(1);
    expect(e4.winRate).toBe(1 / 3);
    expect(e4.scoreRate).toBe((1 + 0.5) / 3);

    // other_white fallback
    const otherW = body.white.find((w: any) => w.key === "other_white");
    expect(otherW).toBeDefined();
    expect(otherW.name).toBe("Otras secuencias con Blancas");
    expect(otherW.notation).toBe("-");

    // Black openings sorted by games DESC
    expect(body.black).toBeDefined();
    expect(body.black.length).toBe(3);

    // e2e4 e7e5: 2 games (1 win, 1 loss, 0 draws)
    const openGame = body.black[0];
    expect(openGame.key).toBe("e2e4 e7e5");
    expect(openGame.name).toBe("Partida Abierta");
    expect(openGame.notation).toBe("1. e4 e5");
    expect(openGame.games).toBe(2);
    expect(openGame.wins).toBe(1);
    expect(openGame.losses).toBe(1);
    expect(openGame.draws).toBe(0);
    expect(openGame.winRate).toBe(0.5);
    expect(openGame.scoreRate).toBe(0.5);

    // other_black fallback
    const otherB = body.black.find((b: any) => b.key === "other_black");
    expect(otherB).toBeDefined();
    expect(otherB.name).toBe("Otras secuencias con Negras");
    expect(otherB.notation).toBe("-");
  });

  it("shouldFilterOpeningsStatsByUserIdWhenProvided", async () => {
    const { db, d1 } = createTestDb();

    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result, user_color)
      VALUES 
        ('m1', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 100, 'win', 'white'),
        ('m2', 'u2', 's1', '2026-09-28', '2026-09-28', '{}', 200, 'win', 'white')
    `).run();

    db.prepare(`
      INSERT INTO match_details (match_id, user_id, status, move_history, move_timestamps, opening_key, phase_key, ply_count)
      VALUES 
        ('m1', 'u1', 'completed', '[]', '[]', 'e2e4', 'opening', 30),
        ('m2', 'u2', 'completed', '[]', '[]', 'd2d4', 'opening', 30)
    `).run();

    const res = await handleStats(d1, "openings", new URL("http://localhost/api/stats/openings?userId=u1"));
    expect(res.status).toBe(200);
    const body = await res.json() as any;

    expect(body.population.totalMatches).toBe(1);
    expect(body.population.hydrated).toBe(1);
    expect(body.white.length).toBe(1);
    expect(body.white[0].key).toBe("e2e4");
  });
});
