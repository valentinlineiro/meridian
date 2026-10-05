import { describe, it, expect } from "vitest";
import { handleStats } from "../src/api/stats.ts";
import { setupTestDb } from "./helpers/testDb.ts";

// One opening, one phase, one colour: every route must read these matches the same way.
const RESULTS: Array<[string | null, string | null]> = [
  ["win", null], ["victory", null], ["won", null], // wins
  ["defeat", null],                                // loss
  ["tie", null],                                   // draw
  [null, "win"],                                   // result missing, outcome decides
  ["garbage", null], [null, null],                 // unknown
];
const EXPECTED = { games: 8, wins: 4, losses: 1, draws: 1, unknown: 2, winRate: 4 / 6, scoreRate: 4.5 / 6 };

async function seed() {
  const { db, d1 } = setupTestDb();
  RESULTS.forEach(([result, outcome], i) => {
    db.prepare("INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result, outcome, user_color) VALUES (?, 'u1', 's1', 'x', 'x', '{}', ?, ?, ?, 'white')").run(`m${i}`, 100 + i, result, outcome);
    db.prepare("INSERT INTO match_details (match_id, user_id, status, move_history, move_timestamps, opening_key, phase_key, ply_count) VALUES (?, 'u1', 'completed', '[]', '[]', 'e2e4', 'middlegame', 50)").run(`m${i}`);
  });
  return d1;
}
const get = async (d1: any, kind: string) => (await handleStats(d1, kind, new URL(`http://x/api/stats/${kind}`))).json() as Promise<any>;

describe("result rule parity", () => {
  it("shouldClassifyOpeningResultsLikeSummarizeWhenResultsAreVariantsOrMissing", async () => {
    const o = (await get(await seed(), "openings")).white.find((x: any) => x.key === "e2e4");
    expect(o).toMatchObject(EXPECTED);
  });

  it("shouldClassifyPhaseResultsLikeSummarizeWhenResultsAreVariantsOrMissing", async () => {
    const p = (await get(await seed(), "phases")).phases.find((x: any) => x.key === "middlegame");
    expect(p).toMatchObject(EXPECTED);
  });

  it("shouldAgreeAcrossColorOpeningsAndPhasesWhenSameMatches", async () => {
    const d1 = await seed();
    const c = (await get(d1, "color")).groups.find((g: any) => g.key === "white");
    const o = (await get(d1, "openings")).white[0];
    const p = (await get(d1, "phases")).phases[0];
    for (const g of [c, o, p]) expect({ wins: g.wins, losses: g.losses, draws: g.draws, unknown: g.unknown, winRate: g.winRate, scoreRate: g.scoreRate }).toEqual({ wins: 4, losses: 1, draws: 1, unknown: 2, winRate: 4 / 6, scoreRate: 4.5 / 6 });
  });
});
