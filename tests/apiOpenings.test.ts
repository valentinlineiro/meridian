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
  db.exec(readFileSync(new URL("../migrations/0017_opening_family_mate_type.sql", import.meta.url).pathname, "utf8"));
  db.exec(readFileSync(new URL("../migrations/0018_mate_threats.sql", import.meta.url).pathname, "utf8"));

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
  const seed = (db: any) => {
    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result, user_color)
      VALUES
        ('m1', 'u1', 's1', 'd', 'd', '{}', 100, 'win', 'white'),
        ('m2', 'u1', 's1', 'd', 'd', '{}', 200, 'loss', 'white'),
        ('m3', 'u1', 's1', 'd', 'd', '{}', 300, 'draw', 'white'),
        ('m4', 'u1', 's1', 'd', 'd', '{}', 400, 'win', 'white'),
        ('m5', 'u1', 's1', 'd', 'd', '{}', 500, 'win', 'black'),
        ('m6', 'u1', 's1', 'd', 'd', '{}', 600, 'loss', 'black'),
        ('m7', 'u1', 's1', 'd', 'd', '{}', 700, 'win', 'black'),
        ('m8', 'u1', 's1', 'd', 'd', '{}', 800, 'win', 'white'),
        ('m9', 'u1', 's1', 'd', 'd', '{}', 900, 'win', 'white')
    `).run();
    db.prepare(`
      INSERT INTO match_details (match_id, user_id, status, move_history, move_timestamps, opening_family, ply_count)
      VALUES
        ('m1', 'u1', 'completed', '[]', '[]', 'italian', 50),
        ('m2', 'u1', 'completed', '[]', '[]', 'italian', 60),
        ('m3', 'u1', 'completed', '[]', '[]', 'italian', 90),
        ('m4', 'u1', 'completed', '[]', '[]', 'queens_gambit', 30),
        ('m5', 'u1', 'completed', '[]', '[]', 'sicilian', 70),
        ('m6', 'u1', 'completed', '[]', '[]', 'sicilian', 75),
        ('m7', 'u1', 'completed', '[]', '[]', 'other', 15),
        ('m8', 'u1', 'completed', '[]', '[]', NULL, 20),
        ('m9', 'u1', 'completed', '[]', '[]', 'unclassified', 1)
    `).run();
  };

  it("shouldGroupByFamilyPerColourSortedByGamesWithSpanishNames", async () => {
    const { db, d1 } = createTestDb();
    seed(db);
    const res = await handleStats(d1, "openings", new URL("http://localhost/api/stats/openings"));
    const body = await res.json() as any;

    expect(body.white.map((w: any) => w.key)).toEqual(["italian", "queens_gambit"]);
    const italian = body.white[0];
    expect(italian.name).toBe("Italiana");
    expect(italian).toMatchObject({ games: 3, wins: 1, losses: 1, draws: 1 });
    expect(italian.winRate).toBe(1 / 3);
    expect(body.white[1].name).toBe("Gambito de Dama");

    expect(body.black.map((b: any) => [b.key, b.name, b.games])).toEqual([["sicilian", "Siciliana", 2], ["other", "Otra apertura", 1]]);
  });

  it("shouldCountRowsWithoutFamilyAsUnclassifiedInsteadOfListingThem", async () => {
    const { db, d1 } = createTestDb();
    seed(db);
    const body = await (await handleStats(d1, "openings", new URL("http://localhost/api/stats/openings"))).json() as any;
    expect(body.unclassified).toBe(2);
    expect(JSON.stringify(body.white) + JSON.stringify(body.black)).not.toContain("unclassified");
    expect(body.population).toEqual({ hydrated: 9, totalMatches: 9 });
  });

  it("shouldFilterOpeningsStatsByUserIdWhenProvided", async () => {
    const { db, d1 } = createTestDb();
    db.prepare(`INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result, user_color)
      VALUES ('m1', 'u1', 's1', 'd', 'd', '{}', 100, 'win', 'white'), ('m2', 'u2', 's1', 'd', 'd', '{}', 200, 'win', 'white')`).run();
    db.prepare(`INSERT INTO match_details (match_id, user_id, status, move_history, move_timestamps, opening_family, ply_count)
      VALUES ('m1', 'u1', 'completed', '[]', '[]', 'italian', 30), ('m2', 'u2', 'completed', '[]', '[]', 'scotch', 30)`).run();
    const body = await (await handleStats(d1, "openings", new URL("http://localhost/api/stats/openings?userId=u1"))).json() as any;
    expect(body.population.totalMatches).toBe(1);
    expect(body.white.map((w: any) => w.key)).toEqual(["italian"]);
  });
});
