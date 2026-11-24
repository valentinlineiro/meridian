import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { handleStats } from "../src/api/stats.ts";
import type { Weekly } from "../src/domain/chessWeekly.ts";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");

const MIGRATIONS = ["0001_init", "0005_played_at", "0006_match_details", "0007_openings_and_phases", "0017_opening_family_mate_type"];

function createDb() {
  const db = new DatabaseSync(":memory:");
  for (const m of MIGRATIONS) db.exec(readFileSync(new URL(`../migrations/${m}.sql`, import.meta.url).pathname, "utf8"));
  const prepared: string[] = [];
  const d1: any = {
    prepare(sql: string) {
      prepared.push(sql);
      const stmt = (args: any[]) => ({
        first: async () => db.prepare(sql).get(...args),
        all: async () => ({ results: db.prepare(sql).all(...args) }),
      });
      return { ...stmt([]), bind: (...args: any[]) => stmt(args) };
    },
  };
  return { db, d1, prepared };
}

const utc = (iso: string) => Math.floor(Date.parse(iso) / 1000);
let n = 0;
function game(db: any, o: { user?: string; at: number | null; result?: string; color?: string; family?: string; phase?: string; ec?: string; eloAfter?: number }) {
  const id = `m${++n}`, user = o.user ?? "u1";
  db.prepare(`INSERT INTO matches (match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at, played_at, result, user_color)
    VALUES (?, ?, 's', '{}', 'x', 'x', ?, ?, ?)`).run(id, user, o.at, o.result ?? "win", o.color ?? "white");
  db.prepare(`INSERT INTO match_details (match_id, user_id, end_condition, status, move_history, move_timestamps, opening_family, phase_key, elo_after)
    VALUES (?, ?, ?, 'done', '', '', ?, ?, ?)`).run(id, user, o.ec ?? "checkmate", o.family ?? "Italiana", o.phase ?? "middlegame", o.eloAfter ?? null);
}
function snapshot(db: any, id: string, createdAt: string, elo: number, user = "u1") {
  db.prepare(`INSERT INTO snapshots (id, created_at, source, user_id, raw_json, games_count, pages_count, checksum, size_bytes)
    VALUES (?, ?, 'duolingo-chess', ?, ?, 0, 0, ?, 0)`).run(id, createdAt, user, JSON.stringify({ eloRating: elo }), id);
}
const get = async (d1: any, qs = "userId=u1") =>
  (await (await handleStats(d1, "weekly", new URL(`http://x/api/stats/weekly?${qs}`))).json()) as Weekly;

describe("GET /api/stats/weekly", () => {
  it("shouldReturnOneBucketPerMondayUtcWhenGamesSpanSeveralDays", async () => {
    const { db, d1 } = createDb();
    game(db, { at: utc("2026-11-22T23:59:59Z") }); // Sunday: belongs to the week of Monday 2026-11-16
    game(db, { at: utc("2026-11-23T00:00:00Z") }); // Monday 00:00: starts a new week
    game(db, { at: utc("2026-11-16T00:00:00Z") });
    const { weeks } = await get(d1);
    expect(weeks.map((w) => [w.week, w.games])).toEqual([["2026-11-16", 2], ["2026-11-23", 1]]);
  });

  it("shouldExcludeOtherUsersWhenUserIdIsGiven", async () => {
    const { db, d1 } = createDb();
    game(db, { at: utc("2026-11-17T10:00:00Z") });
    game(db, { user: "u2", at: utc("2026-11-17T10:00:00Z") });
    game(db, { user: "u2", at: null });
    const out = await get(d1);
    expect(out.weeks[0]!.games).toBe(1);
    expect(out.undated.games).toBe(0);
  });

  it("shouldReportUndatedWhenPlayedAtIsNull", async () => {
    const { db, d1 } = createDb();
    game(db, { at: null, result: "loss" });
    game(db, { at: null });
    const out = await get(d1);
    expect(out.weeks).toEqual([]);
    expect(out.undated).toEqual({ games: 2, w: 1, d: 0, l: 1, u: 0, disconnections: 0 });
  });

  it("shouldAttachLatestEloAfterOfTheWeekWhenKnown", async () => {
    const { db, d1 } = createDb();
    game(db, { at: utc("2026-11-16T08:00:00Z"), eloAfter: 900 });
    game(db, { at: utc("2026-11-18T08:00:00Z"), eloAfter: 925 });
    game(db, { at: utc("2026-11-19T08:00:00Z") }); // no elo_after: must not hide 925
    expect((await get(d1)).weeks[0]!.eloEnd).toBe(925);
  });

  it("shouldFallBackToSnapshotEloWhenNoEloAfterInTheWeek", async () => {
    const { db, d1 } = createDb();
    game(db, { at: utc("2026-11-17T08:00:00Z") });
    snapshot(db, "s1", "2026-11-16T10:00:00Z", 880);
    snapshot(db, "s2", "2026-11-20T10:00:00Z", 905);
    snapshot(db, "s3", "2026-11-17T10:00:00Z", 1400, "u2");
    expect((await get(d1)).weeks[0]!.eloEnd).toBe(905);
  });

  it("shouldCountDisconnectionLossesApartWhenEndConditionIsDisconnection", async () => {
    const { db, d1 } = createDb();
    game(db, { at: utc("2026-11-17T10:00:00Z"), result: "loss", ec: "disconnection" });
    game(db, { at: utc("2026-11-17T11:00:00Z"), result: "win", ec: "disconnection" });
    expect((await get(d1)).weeks[0]!.total).toEqual({ w: 1, d: 0, l: 1, u: 0, disconnections: 1 });
  });

  it("shouldMergeColorSpellingsWhenCaseDiffers", async () => {
    const { db, d1 } = createDb();
    game(db, { at: utc("2026-11-17T10:00:00Z"), color: "White" });
    game(db, { at: utc("2026-11-17T11:00:00Z"), color: "white" });
    expect(Object.keys((await get(d1)).weeks[0]!.byColor)).toEqual(["white"]);
  });

  it("shouldIssueOnlyGroupedQueriesWhenCalled", async () => {
    const { db, d1, prepared } = createDb();
    game(db, { at: utc("2026-11-17T10:00:00Z") });
    await get(d1);
    expect(prepared.length).toBeGreaterThan(0);
    for (const sql of prepared) {
      expect(sql).not.toMatch(/move_history|move_timestamps/);
      if (/FROM matches/i.test(sql)) expect(sql).toMatch(/GROUP BY|PARTITION BY/i);
    }
  });
});
