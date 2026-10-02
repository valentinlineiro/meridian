import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";
const require = createRequire(import.meta.url);
const { DatabaseSync: SQLiteDatabase } = require("node:sqlite");
import { readFileSync } from "node:fs";
import { handleMatches, handleStats } from "../src/api/stats.ts";

function createTestDb() {
  const db = new SQLiteDatabase(":memory:");
  const initSql = readFileSync(new URL("../migrations/0001_init.sql", import.meta.url).pathname, "utf8");
  db.exec(initSql);
  const migSql = readFileSync(new URL("../migrations/0005_played_at.sql", import.meta.url).pathname, "utf8");
  db.exec(migSql);
  const mdSql = readFileSync(new URL("../migrations/0006_match_details.sql", import.meta.url).pathname, "utf8");
  db.exec(mdSql);
  const opSql = readFileSync(new URL("../migrations/0007_openings_and_phases.sql", import.meta.url).pathname, "utf8");
  db.exec(opSql);

  const d1 = {
    prepare(sql: string) {
      return {
        bind(...args: any[]) {
          return {
            first: async () => db.prepare(sql).get(...args),
            all: async () => ({ results: db.prepare(sql).all(...args) }),
            run: async () => {
              const res = db.prepare(sql).run(...args);
              return { meta: { changes: Number(res.changes) } };
            },
          };
        },
        first: async () => db.prepare(sql).get(),
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

const stubDb = (queries: string[]) =>
  ({
    prepare: (sql: string) => {
      queries.push(sql);
      const first = async () => ({ c: 2 });
      const all = async () => ({
        results: [
          { match_id: "new", first_seen_at: "2026-09-25", played_at: 1790000000 },
          { match_id: "old", first_seen_at: "2026-09-23", played_at: 1700000000 },
        ],
      });
      return { bind: () => ({ first, all }), first, all } as any;
    },
  }) as any;

describe("GET /api/matches", () => {
  it("shouldReturnNewestMatchesFirstWhenListingMatches", async () => {
    const queries: string[] = [];
    const res = await handleMatches(stubDb(queries), new URL("http://x/api/matches?limit=10"));
    const body: any = await res.json();
    expect(queries.some((q) => q.includes("ORDER BY COALESCE(m.played_at, 0) DESC, m.rowid DESC"))).toBe(true);
    expect(body.total).toBe(2);
    expect(body.rows[0].match_id).toBe("new");
    expect(body.rows[0].played_at).toBe(1790000000);
  });

  it("shouldOrderMatchesByPlayedAtDescWithNullsLast", async () => {
    const { db, d1 } = createTestDb();
    const insert = db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at, played_at)
      VALUES (?, 'u1', 's1', '{}', '2026-09-25T10:00:00Z', '2026-09-25T10:00:00Z', ?)
    `);

    // Insert out of chronological order
    insert.run("m_early", 1700000000);
    insert.run("m_null_1", null);
    insert.run("m_latest", 1790000000);
    insert.run("m_mid", 1750000000);
    insert.run("m_null_2", null);

    const res = await handleMatches(d1, new URL("http://x/api/matches?limit=10"));
    const body: any = await res.json();

    expect(body.total).toBe(5);
    // played_at DESC, rowid DESC tie-breaker:
    // m_latest (1790000000) -> m_mid (1750000000) -> m_early (1700000000) -> m_null_2 (rowid 5) -> m_null_1 (rowid 2)
    expect(body.rows.map((r: any) => r.match_id)).toEqual([
      "m_latest",
      "m_mid",
      "m_early",
      "m_null_2",
      "m_null_1",
    ]);

    // Verify played_at column is returned in rows
    expect(body.rows[0].played_at).toBe(1790000000);
    expect(body.rows[1].played_at).toBe(1750000000);
    expect(body.rows[2].played_at).toBe(1700000000);
    expect(body.rows[3].played_at).toBeNull();
    expect(body.rows[4].played_at).toBeNull();
  });

  it("shouldComputeRecentStatsFromHighestPlayedAtGames", async () => {
    const { db, d1 } = createTestDb();
    const insert = db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at, played_at, result, user_color)
      VALUES (?, 'u1', 's1', '{}', '2026-09-25T10:00:00Z', '2026-09-25T10:00:00Z', ?, ?, 'white')
    `);

    // Insert 4 matches out of order:
    // rowid 1: 1710000000, loss
    // rowid 2: 1790000000, win (newest game)
    // rowid 3: 1700000000, loss (oldest game)
    // rowid 4: 1780000000, win (second newest game)
    insert.run("g1", 1710000000, "loss");
    insert.run("g2", 1790000000, "win");
    insert.run("g3", 1700000000, "loss");
    insert.run("g4", 1780000000, "win");

    // When querying recent limit=2, it must select the 2 games with highest played_at (g2 and g4),
    // which are both wins (winRate = 1.0).
    // If ordered by rowid ASC, slice(-2) would take g3 (loss) and g4 (win), giving winRate = 0.5.
    const res = await handleStats(d1, "recent", new URL("http://x/api/stats/recent?limit=2"));
    const body: any = await res.json();

    expect(body.games).toBe(2);
    expect(body.wins).toBe(2);
    expect(body.losses).toBe(0);
    expect(body.winRate).toBe(1);
  });

  it("shouldSearchRivalAcrossAllMatchesWhenQueryingByName", async () => {
    const stored = [
      { match_id: "1", opponent_name: "Michael" },
      { match_id: "2", opponent_name: null },
      { match_id: "3", opponent_name: "michaelangelo" },
    ];
    const queries: string[] = [];
    const db = {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => {
          queries.push(sql);
          const pat = sql.includes("opponent_name LIKE") ? String(args[0]).toLowerCase() : null;
          const filt = pat ? stored.filter((r) => (r.opponent_name ?? "").toLowerCase().includes(pat)) : stored;
          const offset = args[args.length - 1];
          const limit = args[args.length - 2];
          return {
            first: async () => ({ c: filt.length }),
            all: async () => ({ results: filt.slice(offset, offset + limit) }),
          } as any;
        },
      }),
    } as any;
    const res = await handleMatches(db, new URL("http://x/api/matches?q=mich&limit=10"));
    const body: any = await res.json();
    expect(queries.some((q) => q.includes("opponent_name LIKE"))).toBe(true);
    expect(body.total).toBe(2);
    expect(body.rows.map((r: any) => r.match_id)).toEqual(["1", "3"]);
  });

  it("shouldCombineTypeResultColorAndQueryAsAndWhenAllPresent", async () => {
    const stored = [
      { match_id: "1", opponent_type: "pvp", result: "win", user_color: "white", opponent_name: "Michael" },
      { match_id: "2", opponent_type: "pvp", result: "loss", user_color: "white", opponent_name: "Michael" },
      { match_id: "3", opponent_type: "bot", result: "win", user_color: "white", opponent_name: null },
      { match_id: "4", opponent_type: "pvp", result: "win", user_color: "black", opponent_name: "Michael" },
    ];
    const db = {
      prepare: (sql: string) => ({
        bind: (...args: any[]) => {
          expect(sql).toMatch(/opponent_type=\?/);
          expect(sql).toMatch(/result=\?/);
          expect(sql).toMatch(/user_color=\?/);
          expect(sql).toMatch(/opponent_name LIKE/);
          // args order: result, user_color, opponent_type, q, limit, offset
          const [r, c, t, q] = args;
          const filt = stored.filter(
            (m) => m.opponent_type === t && m.result === r && m.user_color === c &&
              (m.opponent_name ?? "").toLowerCase().includes(String(q).toLowerCase())
          );
          return {
            first: async () => ({ c: filt.length }),
            all: async () => ({ results: filt }),
          } as any;
        },
      }),
    } as any;
    const res = await handleMatches(db, new URL("http://x/api/matches?opponentType=pvp&result=win&color=white&q=mich"));
    const body: any = await res.json();
    expect(body.total).toBe(1);
    expect(body.rows.map((x: any) => x.match_id)).toEqual(["1"]);
  });
});
