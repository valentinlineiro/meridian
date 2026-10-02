import { describe, it, expect, beforeEach } from "vitest";
import worker from "./helpers/adminWorker.ts";
import { setupTestDb } from "./helpers/testDb.ts";
import type { D1Database } from "@cloudflare/workers-types";
import type { Env } from "../src/types.ts";

describe("API Trajectory (Integration)", () => {
  let db: any;
  let d1: D1Database;
  let env: Env;

  beforeEach(() => {
    const setup = setupTestDb();
    db = setup.db;
    d1 = setup.d1;
    env = { DB: d1 } as unknown as Env;

    db.prepare("INSERT INTO users (id, created_at) VALUES (?, ?)").run("1000001", "2026-01-01T00:00:00Z");
  });

  it("shouldReturn404NotFoundWhenUserDoesNotExist", async () => {
    const res = await worker.fetch(
      new Request("http://localhost/api/trajectory?userId=non-existent-user"),
      env
    );
    expect(res.status).toBe(404);
  });

  it("shouldReturn200WithEmptyFindingsWhenUserHasZeroActivity", async () => {
    const res = await worker.fetch(
      new Request("http://localhost/api/trajectory?userId=1000001"),
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.userId).toBe("1000001");
    expect(body.temporalSpan.startedAt).toBeNull();
    expect(body.temporalSpan.totalDays).toBeNull();
    expect(body.findings).toEqual([]);
  });

  it("shouldReturn200WithFindingsWhenLongitudinalPatternsExist", async () => {
    // Spread 80 matches across 80 distinct days to satisfy activeDays >= 60 gate.
    // H1 = first 40 days (Jan 1 – Feb 9): 40 white wins + 40 black losses
    // H2 = last 40 days (Apr 1 – May 10): 40 white wins + 40 black losses
    // Split-mid falls between H1 and H2 groups.
    const DAY = 86400; // seconds in a day
    const h1Start = Math.floor(new Date("2026-01-01T12:00:00Z").getTime() / 1000);
    const h2Start = Math.floor(new Date("2026-04-01T12:00:00Z").getTime() / 1000);

    for (let i = 0; i < 40; i++) {
      const t1 = h1Start + i * DAY;
      const t2 = h2Start + i * DAY;
      db.prepare(`
        INSERT INTO matches (match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at, played_at, user_color, result)
        VALUES (?, '1000001', 's1', '{}', '2026-01-01', '2026-01-01', ?, 'white', 'win')
      `).run(`m_w1_${i}`, t1);
      db.prepare(`
        INSERT INTO matches (match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at, played_at, user_color, result)
        VALUES (?, '1000001', 's1', '{}', '2026-01-01', '2026-01-01', ?, 'black', 'loss')
      `).run(`m_b1_${i}`, t1 + 3600);
      db.prepare(`
        INSERT INTO matches (match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at, played_at, user_color, result)
        VALUES (?, '1000001', 's1', '{}', '2026-04-01', '2026-04-01', ?, 'white', 'win')
      `).run(`m_w2_${i}`, t2);
      db.prepare(`
        INSERT INTO matches (match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at, played_at, user_color, result)
        VALUES (?, '1000001', 's1', '{}', '2026-04-01', '2026-04-01', ?, 'black', 'loss')
      `).run(`m_b2_${i}`, t2 + 3600);
    }

    const res = await worker.fetch(
      new Request("http://localhost/api/trajectory?userId=1000001"),
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.findings).toHaveLength(1);
    expect(body.findings[0].type).toBe("CHESS_COLOR_ASYMMETRY_LONGITUDINAL");
  });

});
