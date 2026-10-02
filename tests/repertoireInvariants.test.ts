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

describe("Repertoire and Phases Contract Invariants", () => {
  it("shouldEnforcePartitionInvariantsAcrossPhasesAndColors", async () => {
    const { db, d1 } = createTestDb();

    // Insert 6 matches across colors and phases
    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result, user_color)
      VALUES 
        ('m1', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 100, 'win', 'white'),
        ('m2', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 200, 'loss', 'white'),
        ('m3', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 300, 'draw', 'white'),
        ('m4', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 400, 'win', 'black'),
        ('m5', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 500, 'loss', 'black'),
        ('m6', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 600, 'draw', 'black')
    `).run();

    db.prepare(`
      INSERT INTO match_details (match_id, user_id, status, move_history, move_timestamps, opening_key, phase_key, ply_count)
      VALUES 
        ('m1', 'u1', 'completed', '[]', '[]', 'e2e4', 'opening', 20),
        ('m2', 'u1', 'completed', '[]', '[]', 'd2d4', 'middlegame', 50),
        ('m3', 'u1', 'completed', '[]', '[]', 'e2e3', 'endgame', 90),
        ('m4', 'u1', 'completed', '[]', '[]', 'e2e4 e7e5', 'opening', 30),
        ('m5', 'u1', 'completed', '[]', '[]', 'd2d4 d7d5', 'middlegame', 70),
        ('m6', 'u1', 'completed', '[]', '[]', 'e2e4 e7e6', 'endgame', 110)
    `).run();

    const [openingsRes, phasesRes] = await Promise.all([
      handleStats(d1, "openings", new URL("http://localhost/api/stats/openings")),
      handleStats(d1, "phases", new URL("http://localhost/api/stats/phases")),
    ]);

    const openings = (await openingsRes.json()) as any;
    const phases = (await phasesRes.json()) as any;

    const hydrated = openings.population.hydrated;
    expect(hydrated).toBe(6);
    expect(openings.population.totalMatches).toBe(6);
    expect(phases.population.hydrated).toBe(6);

    // Invariant 1: white + black games == hydrated
    const totalWhite = openings.white.reduce((acc: number, o: any) => acc + o.games, 0);
    const totalBlack = openings.black.reduce((acc: number, o: any) => acc + o.games, 0);
    expect(totalWhite + totalBlack).toBe(hydrated);

    // Invariant 2: sum of phase games == hydrated
    const totalPhaseGames = phases.phases.reduce((acc: number, p: any) => acc + p.games, 0);
    expect(totalPhaseGames).toBe(hydrated);

    // Invariant 3: wins + losses + draws == games for every opening entry
    for (const entry of [...openings.white, ...openings.black]) {
      expect(entry.wins + entry.losses + entry.draws).toBe(entry.games);
      expect(entry.winRate).toBe(entry.games > 0 ? entry.wins / entry.games : null);
      expect(entry.scoreRate).toBe(entry.games > 0 ? (entry.wins + 0.5 * entry.draws) / entry.games : null);
    }

    // Invariant 4: wins + losses + draws == games for every phase entry
    for (const phase of phases.phases) {
      expect(phase.wins + phase.losses + phase.draws).toBe(phase.games);
      expect(phase.winRate).toBe(phase.games > 0 ? phase.wins / phase.games : null);
      expect(phase.scoreRate).toBe(phase.games > 0 ? (phase.wins + 0.5 * phase.draws) / phase.games : null);
    }

    // Invariant 5: median plies calculation for even number of items [20, 30, 50, 70, 90, 110]
    // Middle values are 50 and 70 -> median is (50 + 70) / 2 = 60
    expect(phases.medianPlies).toBe(60);
  });

  it("shouldHandleZeroMatchesGracefullyWithoutNaNOrErrors", async () => {
    const { d1 } = createTestDb();

    const [openingsRes, phasesRes] = await Promise.all([
      handleStats(d1, "openings", new URL("http://localhost/api/stats/openings")),
      handleStats(d1, "phases", new URL("http://localhost/api/stats/phases")),
    ]);

    expect(openingsRes.status).toBe(200);
    expect(phasesRes.status).toBe(200);

    const openings = (await openingsRes.json()) as any;
    const phases = (await phasesRes.json()) as any;

    expect(openings.population).toEqual({ hydrated: 0, totalMatches: 0 });
    expect(openings.white).toEqual([]);
    expect(openings.black).toEqual([]);

    expect(phases.population).toEqual({ hydrated: 0, totalMatches: 0 });
    expect(phases.medianPlies).toBe(0);
    expect(phases.phases).toEqual([]);
  });
});
