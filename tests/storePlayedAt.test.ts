import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";
const require = createRequire(import.meta.url);
const { DatabaseSync: SQLiteDatabase } = require("node:sqlite");
import { readFileSync } from "node:fs";
import { upsertMatches } from "../src/db/store.ts";
import type { MatchRow } from "../src/types.ts";

function makeD1(db: DatabaseSync) {
  return {
    prepare(sql: string) {
      return {
        bind(...args: any[]) {
          return {
            all: async () => ({ results: db.prepare(sql).all(...args) }),
            run: async () => {
              const res = db.prepare(sql).run(...args);
              return { meta: { changes: Number(res.changes) } };
            },
            _execute: () => db.prepare(sql).run(...args),
          };
        },
      };
    },
    async batch(stmts: any[]) {
      for (const s of stmts) {
        s._execute();
      }
      return stmts.map(() => ({ meta: { changes: 1 } }));
    },
  } as unknown as D1Database;
}

const makeRow = (match_id: string, played_at: number | null): { row: MatchRow; raw: any } => ({
  row: {
    match_id,
    user_id: "u1",
    opponent_id: null,
    opponent_name: null,
    opponent_type: "bot",
    opponent_elo: null,
    opponent_suspected_cheating: 0,
    user_color: "white",
    result: "win",
    outcome: "win",
    reviewed: 0,
    pvp_match_type: "normal",
    page_number: 0,
    index_in_page: 0,
    page_elo: null,
    played_at,
  },
  raw: { matchId: match_id },
});

describe("0005_played_at migration & backfill", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new SQLiteDatabase(":memory:");
    const initSql = readFileSync(new URL("../migrations/0001_init.sql", import.meta.url).pathname, "utf8");
    db.exec(initSql);
    // Insert test rows without played_at
    const insert = db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at)
      VALUES (?, 'u1', 's1', '{}', '2026-09-25T10:00:00Z', '2026-09-25T10:00:00Z')
    `);
    insert.run("bot|1766740707");
    insert.run("bot|1790000002|fixture-bot-002");
    insert.run("pvp|1790000003|1000001|fixture-opponent-001");
    insert.run("match-legacy-001");
  });

  it("shouldApplyMigration0005AndBackfillPlayedAtCorrectly", () => {
    const migSql = readFileSync(new URL("../migrations/0005_played_at.sql", import.meta.url).pathname, "utf8");
    db.exec(migSql);

    const rows = db.prepare("SELECT match_id, played_at FROM matches ORDER BY match_id").all();
    const map = Object.fromEntries(rows.map((r: any) => [r.match_id, r.played_at]));

    expect(map["bot|1766740707"]).toBe(1766740707);
    expect(map["bot|1790000002|fixture-bot-002"]).toBe(1790000002);
    expect(map["pvp|1790000003|1000001|fixture-opponent-001"]).toBe(1790000003);
    expect(map["match-legacy-001"]).toBeNull();

    // Verify index idx_matches_played_at exists and indexes COALESCE(played_at, 0)
    const indexRow = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_matches_played_at'").get() as any;
    expect(indexRow).toBeDefined();
    expect(indexRow.sql).toContain("COALESCE(played_at, 0)");

    // Verify query plan uses idx_matches_played_at for ORDER BY COALESCE(played_at, 0)
    const plan = db.prepare("EXPLAIN QUERY PLAN SELECT * FROM matches ORDER BY COALESCE(played_at, 0) DESC").all() as any[];
    expect(plan.some((p) => p.detail && p.detail.includes("idx_matches_played_at"))).toBe(true);
  });
});

describe("upsertMatches store persistence", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new SQLiteDatabase(":memory:");
    const initSql = readFileSync(new URL("../migrations/0001_init.sql", import.meta.url).pathname, "utf8");
    db.exec(initSql);
    const migSql = readFileSync(new URL("../migrations/0005_played_at.sql", import.meta.url).pathname, "utf8");
    db.exec(migSql);
  });

  it("shouldPersistPlayedAtOnInitialInsert", async () => {
    const d1 = makeD1(db);
    const item = makeRow("bot|1766740707", 1766740707);
    await upsertMatches(d1, [item], "snap1", "2026-09-25T12:00:00Z");

    const row = db.prepare("SELECT match_id, played_at FROM matches WHERE match_id = ?").get("bot|1766740707") as any;
    expect(row).toBeDefined();
    expect(row.played_at).toBe(1766740707);
  });

  it("shouldRetainExistingPlayedAtOnConflictWhenIncomingIsNull", async () => {
    const d1 = makeD1(db);
    const itemWithPlayedAt = makeRow("bot|1766740707", 1766740707);
    await upsertMatches(d1, [itemWithPlayedAt], "snap1", "2026-09-25T12:00:00Z");

    const itemNullPlayedAt = makeRow("bot|1766740707", null);
    await upsertMatches(d1, [itemNullPlayedAt], "snap2", "2026-09-25T13:00:00Z");

    const row = db.prepare("SELECT match_id, played_at, last_seen_at FROM matches WHERE match_id = ?").get("bot|1766740707") as any;
    expect(row.played_at).toBe(1766740707);
    expect(row.last_seen_at).toBe("2026-09-25T12:00:00Z"); // a known match is not rewritten: last_seen_at keeps the first sighting
  });

  it("shouldUpdatePlayedAtOnConflictWhenIncomingHasValueAndExistingIsNull", async () => {
    const d1 = makeD1(db);
    const itemNullPlayedAt = makeRow("bot|1766740707", null);
    await upsertMatches(d1, [itemNullPlayedAt], "snap1", "2026-09-25T12:00:00Z");

    const itemWithPlayedAt = makeRow("bot|1766740707", 1766740707);
    await upsertMatches(d1, [itemWithPlayedAt], "snap2", "2026-09-25T13:00:00Z");

    const row = db.prepare("SELECT match_id, played_at, last_seen_at FROM matches WHERE match_id = ?").get("bot|1766740707") as any;
    expect(row.played_at).toBe(1766740707);
    expect(row.last_seen_at).toBe("2026-09-25T12:00:00Z"); // learning the date does not touch last_seen_at either
  });
});
