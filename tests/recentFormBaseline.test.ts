import { describe, it, expect } from "vitest";
import { handleStats } from "../src/api/stats.ts";
import { DASHBOARD_HTML } from "../src/frontend.ts";
import { setupTestDb } from "./helpers/testDb.ts";

function seed(rows: Array<[string, number, string | null]>) {
  const { db, d1 } = setupTestDb();
  const ins = db.prepare("INSERT INTO matches (match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at, played_at, user_color, result) VALUES (?, 'u1', 's', '{}', 'x', 'x', ?, 'white', ?)");
  for (const [id, playedAt, result] of rows) ins.run(id, playedAt, result);
  return d1;
}
const recent = async (d1: any, limit: number) => (await handleStats(d1, "recent", new URL(`http://x/api/stats/recent?limit=${limit}`))).json() as Promise<any>;

describe("recent form baseline", () => {
  // Inserted out of order on purpose: the window is the latest by played_at, not by rowid.
  const rows: Array<[string, number, string | null]> = [
    ["g5", 500, "win"], ["g1", 100, "win"], ["g6", 600, "win"], ["g2", 200, "loss"], ["g4", 400, "loss"], ["g3", 300, "win"],
  ];

  it("shouldCompareWindowAgainstGamesBeforeItWhenBaselineRequested", async () => {
    const r = await recent(seed(rows), 2);
    expect(r).toMatchObject({ games: 2, wins: 2, winRate: 1 });             // g5, g6
    expect(r.before).toMatchObject({ games: 4, wins: 2, losses: 2, winRate: 0.5 }); // g1..g4
    expect(r.games + r.before.games).toBe(6);                                // no overlap
  });

  it("shouldClassifyBaselineWithSharedRuleWhenUnknownResultsAreBeforeWindow", async () => {
    const r = await recent(seed([["a", 100, "victory"], ["b", 200, "garbage"], ["c", 300, "loss"], ["d", 400, "win"]]), 1);
    expect(r.before).toMatchObject({ games: 3, wins: 1, losses: 1, unknown: 1, winRate: 0.5 });
  });

  it("shouldReturnEmptyBaselineWhenWindowCoversEveryGame", async () => {
    const r = await recent(seed(rows), 50);
    expect(r.games).toBe(6);
    expect(r.before).toMatchObject({ games: 0, winRate: null, scoreRate: null });
  });
});

describe("recent form rendering", () => {
  const form = DASHBOARD_HTML.match(/function renderForm\(r\)\{([\s\S]*?)\n\}/)?.[1] ?? "";

  it("shouldCompareAgainstBaselineExcludingWindowWhenRenderingForm", () => {
    expect(form).toMatch(/r\.before/);
    expect(form).not.toMatch(/=\s*hist\b/);
  });

  it("shouldLabelTheDeltaAsVsPreviousGamesNotVsHistory", () => {
    expect(form).toMatch(/vs\s+anteriores/);
    expect(form).not.toMatch(/score\s+vs\s+anteriores/); // scoreRate has no interval, so no delta
    expect(form).not.toMatch(/vs\s+hist/);
  });
});
