import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
import { createD1MatchAdapter } from "../src/infrastructure/d1/d1MatchAdapter.ts";
import type { EnrichedMatchDetailRecord } from "../src/ports/matchPort.ts";

function createTestDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(new URL("../migrations/0001_init.sql", import.meta.url).pathname, "utf8"));
  db.exec(fs.readFileSync(new URL("../migrations/0005_played_at.sql", import.meta.url).pathname, "utf8"));
  db.exec(fs.readFileSync(new URL("../migrations/0006_match_details.sql", import.meta.url).pathname, "utf8"));
  db.exec(fs.readFileSync(new URL("../migrations/0007_openings_and_phases.sql", import.meta.url).pathname, "utf8"));

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

describe("D1MatchAdapter Decoupling", () => {
  it("shouldEnsureD1MatchAdapterDoesNotImportFromAnalytics", () => {
    const fileContent = fs.readFileSync(path.resolve(__dirname, "../src/infrastructure/d1/d1MatchAdapter.ts"), "utf-8");
    expect(fileContent).not.toMatch(/from ["']\.\.\/analytics/);
  });

  it("shouldCreateD1MatchAdapterSatisfyingMatchPortInterface", () => {
    const mockDb = {
      prepare: () => ({
        bind: () => ({
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => ({}),
        }),
      }),
    } as unknown as D1Database;

    const adapter = createD1MatchAdapter(mockDb);
    expect(typeof adapter.getMatchUserAndColor).toBe("function");
    expect(typeof adapter.saveMatchDetail).toBe("function");
    expect(typeof adapter.getMatchDetail).toBe("function");
    expect(typeof adapter.getPendingMatchIds).toBe("function");
  });

  it("shouldGetUserAndColorViaD1MatchAdapter", async () => {
    const { db, d1 } = createTestDb();
    const adapter = createD1MatchAdapter(d1);

    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, user_color)
      VALUES ('m1', 'u1', 'snap1', datetime('now'), datetime('now'), '{}', 'white')
    `).run();

    const result = await adapter.getMatchUserAndColor("m1");
    expect(result).toEqual({ userId: "u1", userColor: "white" });

    const notFound = await adapter.getMatchUserAndColor("unknown");
    expect(notFound).toBeNull();
  });

  it("shouldSaveAndRetrieveMatchDetailViaD1MatchAdapter", async () => {
    const { d1 } = createTestDb();
    const adapter = createD1MatchAdapter(d1);

    const record: EnrichedMatchDetailRecord = {
      match_id: "m1",
      user_id: "u1",
      opponent_id: "bot",
      is_hard_match: 0,
      is_placement_match: 0,
      is_revenge_match: 0,
      predicted_elo_win: 1000,
      predicted_elo_loss: 980,
      predicted_elo_draw: 990,
      elo_after: 1000,
      outcome: "white",
      end_condition: "checkmate",
      status: "completed",
      move_history: JSON.stringify(["e2e4", "e7e5"]),
      move_timestamps: JSON.stringify([1, 2]),
      final_fen: null,
      reaction: null,
      session_duration: 60,
      opening_key: "e2e4",
      phase_key: "opening",
      ply_count: 2,
    };

    await adapter.saveMatchDetail(record);
    const fetched = await adapter.getMatchDetail("m1");

    expect(fetched).not.toBeNull();
    expect(fetched?.match_id).toBe("m1");
    expect(fetched?.opening_key).toBe("e2e4");
    expect(fetched?.phase_key).toBe("opening");
    expect(fetched?.ply_count).toBe(2);
  });

  it("shouldRetrievePendingMatchIDsViaD1MatchAdapterWithPaginationInfo", async () => {
    const { db, d1 } = createTestDb();
    const adapter = createD1MatchAdapter(d1);

    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at)
      VALUES ('m1', 'u1', 'snap1', datetime('now'), datetime('now'), '{}', 100)
    `).run();
    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at)
      VALUES ('m2', 'u1', 'snap1', datetime('now'), datetime('now'), '{}', 200)
    `).run();
    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at)
      VALUES ('m3', 'u1', 'snap1', datetime('now'), datetime('now'), '{}', 300)
    `).run();

    // Insert detail for m2 so only m1 and m3 are pending
    db.prepare(`
      INSERT INTO match_details (match_id, user_id, status, move_history, move_timestamps, created_at, updated_at)
      VALUES ('m2', 'u1', 'completed', '[]', '[]', datetime('now'), datetime('now'))
    `).run();

    const pending = await adapter.getPendingMatchIds(1);
    expect(pending.totalPending).toBe(2);
    expect(pending.items).toEqual([{ match_id: "m3" }]); // ordered by played_at DESC
    expect(pending.next).toBe(true);

    const pendingAll = await adapter.getPendingMatchIds(5);
    expect(pendingAll.totalPending).toBe(2);
    expect(pendingAll.items).toEqual([{ match_id: "m3" }, { match_id: "m1" }]);
    expect(pendingAll.next).toBe(false);
  });
});
