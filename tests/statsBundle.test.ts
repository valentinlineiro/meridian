import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { handleStats } from "../src/api/stats.ts";
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite");

const MIGRATIONS = ["0001_init", "0005_played_at", "0006_match_details", "0007_openings_and_phases"];

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

let n = 0;
function match(db: any, o: { user?: string; playedAt?: number | null; result?: string | null; outcome?: string | null; elo?: number | null;
  type?: string | null; color?: string | null; reviewed?: number | null; ec?: string | null | undefined; opp?: string | null }) {
  const id = `m${++n}`;
  db.prepare(`INSERT INTO matches (match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at, played_at, result, outcome,
      opponent_elo, opponent_type, user_color, reviewed) VALUES (?, ?, 's', '{}', 'x', 'x', ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, o.user ?? "u1", o.playedAt ?? null, o.result ?? null, o.outcome ?? null, o.elo ?? null, o.type ?? null, o.color ?? null, o.reviewed ?? null);
  if (o.ec !== undefined || o.opp !== undefined) {
    db.prepare(`INSERT INTO match_details (match_id, user_id, opponent_id, end_condition, status, move_history, move_timestamps)
      VALUES (?, ?, ?, ?, 'done', '', '')`).run(id, o.user ?? "u1", o.opp ?? null, o.ec ?? null);
  }
}
function snapshot(db: any, i: number, o: { user?: string; raw: string }) {
  db.prepare(`INSERT INTO snapshots (id, created_at, source, user_id, raw_json, games_count, pages_count, checksum, size_bytes)
    VALUES (?, ?, 'duolingo-chess', ?, ?, 0, 0, ?, 0)`).run(`s${i}`, `2026-10-${String(i).padStart(2, "0")}T10:00:00Z`, o.user ?? "u1", o.raw, `c${i}`);
}

function seed(db: any) {
  // ties on played_at, NULL played_at, outcome-only rows, null result, every colour spelling, bots / pvp / unknown opponents
  match(db, { playedAt: 1700000000, result: "win", elo: 900, type: "bot", color: "White", reviewed: 1, ec: "checkmate", opp: null });
  match(db, { playedAt: 1700000000, result: "loss", elo: 1000, type: "pvp", color: "black", ec: "resign", opp: "p1" });
  match(db, { playedAt: 1700000000, result: "draw", elo: null, type: "pvp", color: "white", ec: "stalemate", opp: "p2" });
  match(db, { playedAt: null, result: null, outcome: "victory", elo: 1100, type: null, color: null });
  match(db, { playedAt: null, result: "loss", elo: 800, type: "BOT", color: "black", reviewed: 1, ec: null, opp: null });
  match(db, { playedAt: 1710000000, result: "win", elo: 1200, type: "pvp", color: "white", ec: "checkmate", opp: "p1" });
  match(db, { playedAt: 1720000000, result: "win", outcome: "loss", elo: 1250, type: "pvp", color: "black", ec: "resign", opp: "p3" });
  match(db, { playedAt: 1730000000, result: "unknown", outcome: "tie", color: "white" });
  for (let i = 0; i < 60; i++) match(db, { playedAt: 1740000000 + (i % 5), result: i % 3 ? "win" : "loss", elo: 700 + i * 10, type: i % 2 ? "bot" : "pvp", color: i % 2 ? "white" : "black", ec: i % 4 ? "checkmate" : "timeout", opp: i % 2 ? null : `p${i % 7}` });
  match(db, { user: "u2", playedAt: 1750000000, result: "win", elo: 1500, type: "pvp", color: "white", ec: "checkmate", opp: "x" });
  snapshot(db, 1, { raw: '{"eloRating":900}' });
  snapshot(db, 2, { raw: "{}" });
  snapshot(db, 3, { raw: '{"eloRating":1010}' });
  snapshot(db, 4, { user: "u2", raw: '{"eloRating":1400}' });
}

const KEYS: [string, string][] = [["summary", "summary"], ["results", "results"], ["color", "color"], ["opponents", "opponents"],
  ["opponentElo", "opponent-elo"], ["timeline", "timeline"], ["recent", "recent"]];
const body = async (d1: any, kind: string, qs = "") => (await handleStats(d1, kind, new URL(`http://x/api/stats/${kind}${qs}`))).json() as Promise<any>;

describe("GET /api/stats/bundle", () => {
  for (const [label, qs] of [["all users", ""], ["one user", "?userId=u1"], ["unknown user", "?userId=nobody"]] as const) {
    it.each(KEYS)(`shouldEqualTheIndividualRouteWhen%sIsRead (${label})`, async (key, kind) => {
      const { db, d1 } = createDb();
      seed(db);
      const bundle = await body(d1, "bundle", qs);
      const single = await body(d1, kind, qs);
      // stringify, not toEqual: the key order of the body is part of the contract
      expect(JSON.stringify(bundle[key])).toBe(JSON.stringify(single));
    });
  }

  it("shouldEqualTheIndividualRoutesWhenThereAreNoRows", async () => {
    const { d1 } = createDb();
    const bundle = await body(d1, "bundle");
    for (const [key, kind] of KEYS) expect(JSON.stringify(bundle[key])).toBe(JSON.stringify(await body(d1, kind)));
  });

  it("shouldExposeExactlyTheSevenKeys", async () => {
    const { d1 } = createDb();
    expect(Object.keys(await body(d1, "bundle")).sort()).toEqual(KEYS.map(([k]) => k).sort());
  });

  it("shouldIssueOneMatchesQueryAndOneSnapshotsQuery", async () => {
    const { db, d1, prepared } = createDb();
    seed(db);
    prepared.length = 0;
    await body(d1, "bundle", "?userId=u1");
    expect(prepared).toHaveLength(2);
    expect(prepared.filter((q) => /FROM matches/.test(q))).toHaveLength(1);
    expect(prepared.filter((q) => /FROM snapshots/.test(q))).toHaveLength(1);
  });
});
