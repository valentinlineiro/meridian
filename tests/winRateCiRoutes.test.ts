import { describe, it, expect } from "vitest";
import { handleStats } from "../src/api/stats.ts";
import { wilson } from "../src/domain/proportion.ts";
import { setupTestDb } from "./helpers/testDb.ts";

// 4 wins / 1 loss / 2 draws decided, 2 unknown: the interval comes from 4/7 and ignores the unknowns.
const RESULTS = ["win", "victory", "won", "win", "defeat", "tie", "draw", "garbage", null];
const EXPECTED = (() => { const c = wilson(4, 7)!; return { lower: c.lower, upper: c.upper }; })();

function seed(opts: { opponentType?: string } = {}) {
  const { db, d1 } = setupTestDb();
  RESULTS.forEach((result, i) => {
    db.prepare("INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result, user_color, opponent_type) VALUES (?, 'u1', 's1', 'x', 'x', '{}', ?, ?, 'white', ?)").run(`m${i}`, 100 + i, result, opts.opponentType ?? "bot");
    db.prepare("INSERT INTO match_details (match_id, user_id, status, move_history, move_timestamps, opening_key, phase_key, ply_count) VALUES (?, 'u1', 'completed', '[]', '[]', 'e2e4', 'middlegame', 50)").run(`m${i}`);
  });
  return d1;
}
const get = async (d1: any, kind: string, qs = "") => (await handleStats(d1, kind, new URL(`http://x/api/stats/${kind}${qs}`))).json() as Promise<any>;

describe("winRateCi on every win-rate route", () => {
  it("shouldExposeIntervalInSummaryAndResults", async () => {
    const d1 = seed();
    expect((await get(d1, "summary")).winRateCi).toEqual(EXPECTED);
    expect((await get(d1, "results")).winRateCi).toEqual(EXPECTED);
  });

  it("shouldExposeIntervalInColorGroups", async () => {
    expect((await get(seed(), "color")).groups[0].winRateCi).toEqual(EXPECTED);
  });

  it("shouldExposeIntervalInOpponentSegmentsAndMacro", async () => {
    const o = await get(seed(), "opponents");
    expect(o.segments[0].winRateCi).toEqual(EXPECTED);
    expect(o.macro[0].winRateCi).toEqual(EXPECTED);
  });

  it("shouldExposeIntervalInRecentWindowBeforeAndColorGroups", async () => {
    // Window = last 3 (draw, garbage, null): 0 wins of 1 decided. Before = first 6: 4 wins of 6 decided.
    const r = await get(seed(), "recent", "?limit=3");
    const ci = (w: number, n: number) => ({ lower: wilson(w, n)!.lower, upper: wilson(w, n)!.upper });
    expect(r.winRateCi).toEqual(ci(0, 1));
    expect(r.before.winRateCi).toEqual(ci(4, 6));
    expect(r.colorGroups[0].winRateCi).toEqual(ci(0, 1));
  });

  it("shouldExposeIntervalInOpeningsAndPhases", async () => {
    const d1 = seed();
    expect((await get(d1, "openings")).white[0].winRateCi).toEqual(EXPECTED);
    expect((await get(d1, "phases")).phases.find((p: any) => p.key === "middlegame").winRateCi).toEqual(EXPECTED);
  });

  it("shouldReturnNullIntervalWhenNothingDecided", async () => {
    const { d1 } = setupTestDb();
    expect((await get(d1, "summary")).winRateCi).toBeNull();
  });

  it("shouldExposeWindowMinusBeforeDeltaOnRecentAsFraction", async () => {
    // Window (last 3): 0 wins of 1 decided. Before: 4 wins of 6 decided. diff = 0 − 4/6.
    const r = await get(seed(), "recent", "?limit=3");
    expect(r.delta.diff).toBeCloseTo(-4 / 6, 12);
    expect(r.delta.lower).toBeLessThan(r.delta.diff);
    expect(r.delta.upper).toBeGreaterThan(r.delta.diff);
  });

  it("shouldReturnNullRecentDeltaWhenEitherSideHasNoDecidedGames", async () => {
    expect((await get(seed(), "recent", "?limit=50")).delta).toBeNull(); // before is empty
  });

  it("shouldExposeWhiteMinusBlackDifferenceOnColorAsFraction", async () => {
    const { db, d1 } = setupTestDb();
    const rows: Array<[string, string]> = [["white", "win"], ["white", "win"], ["white", "loss"], ["black", "loss"], ["black", "loss"], ["black", "win"]];
    rows.forEach(([c, r], i) => db.prepare("INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result, user_color) VALUES (?, 'u1', 's1', 'x', 'x', '{}', ?, ?, ?)").run(`m${i}`, i, r, c));
    const c = await get(d1, "color");
    expect(c.difference.diff).toBeCloseTo(2 / 3 - 1 / 3, 12);
    expect(c.difference.lower).toBeLessThan(0); // 3 vs 3 games: no evidence
  });

  it("shouldReturnNullColorDifferenceWhenOneColourIsMissing", async () => {
    expect((await get(seed(), "color")).difference).toBeNull(); // seed() has white only
  });
});
