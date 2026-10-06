import { describe, it, expect } from "vitest";
import { setupTestDb } from "./helpers/testDb.ts";
import { createD1WhatChangedAdapter } from "../src/infrastructure/d1/d1WhatChangedAdapter.ts";
import { getWhatChangedUseCase } from "../src/application/getWhatChangedUseCase.ts";
import { newcombeDiff, scaleDelta } from "../src/domain/proportion.ts";

const SINCE = "2026-09-20T00:00:00.000Z", UNTIL = "2026-09-27T00:00:00.000Z";
const s = Date.parse(SINCE) / 1000, u = Date.parse(UNTIL) / 1000;

// The historical group is exactly the games played on or before `since`; the interval group is (since, until]. Boundaries and
// out-of-population rows are placed so that any drift in either group changes the numbers below.
async function run() {
  const { db, d1 } = setupTestDb();
  let i = 0;
  const put = (t: number | null, color: string | null, result: string | null) =>
    db.prepare("INSERT INTO matches (match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at, played_at, user_color, result) VALUES (?, 'u1', 's1', '{}', 'x', 'x', ?, ?, ?)").run(`m${i++}`, t, color, result);
  // before since: 6 wins, 4 losses (+1 unknown) -> 10 decided; one of the wins sits exactly on `since`
  for (let k = 0; k < 5; k++) put(s - 1000 - k, "white", "win");
  put(s, "black", "win");
  for (let k = 0; k < 4; k++) put(s - 500 - k, "black", "loss");
  put(s - 10, "white", "garbage");
  // interval: 8 wins, 2 losses -> 10 decided; one loss exactly on `until`
  for (let k = 0; k < 8; k++) put(s + 100 + k, "white", "win");
  put(s + 200, "black", "loss"); put(u, "black", "loss");
  // outside both groups: after until, no timestamp, no colour
  put(u + 1, "white", "win"); put(null, "white", "win"); put(s + 300, null, "win");

  const port = createD1WhatChangedAdapter(d1);
  const baseline = await port.getChessBaseline("u1", SINCE);
  const r = await getWhatChangedUseCase(port, { since: SINCE, until: UNTIL, userId: "u1" });
  return { baseline, r };
}

describe("historicalDelta compares the interval with the games up to since", () => {
  it("shouldTallyTheBaselineGroupAsGamesPlayedOnOrBeforeSince", async () => {
    const { baseline } = await run();
    expect(baseline.data).toMatchObject({ lifetimeGames: 11, lifetimeDecided: 10, lifetimeWins: 6 });
  });

  it("shouldEqualTheExactNewcombeIntervalOfIntervalVersusPriorGames", async () => {
    const { r } = await run();
    expect(r.chess).toMatchObject({ gamesCount: 10, decidedCount: 10 });
    expect(r.chess.historicalDelta).toEqual(scaleDelta(newcombeDiff({ wins: 8, n: 10 }, { wins: 6, n: 10 }), 100));
  });

  it("shouldKeepTheDiffIdenticalToTheExistingHistoricalWinRateDelta", async () => {
    const { r } = await run();
    expect(r.chess.historicalWinRateDelta).toBeCloseTo(20, 9); // 80% − 60%
    expect(r.chess.historicalDelta!.diff).toBeCloseTo(r.chess.historicalWinRateDelta!, 9);
  });
});
