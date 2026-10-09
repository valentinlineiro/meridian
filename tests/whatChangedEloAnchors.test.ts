import { describe, it, expect } from "vitest";
import { setupTestDb } from "./helpers/testDb.ts";
import { createD1WhatChangedAdapter } from "../src/infrastructure/d1/d1WhatChangedAdapter.ts";
import { getWhatChangedUseCase } from "../src/application/getWhatChangedUseCase.ts";

// Amendment A4 (docs/contracts/2026-10-06-discarded-signals-contract.md §12): a snapshot's ELO belongs to its anchor game only.
// These tests go through the real adapter and use case, so emission, discard and the response fields come from one evaluation.
const SINCE = "2026-09-20T00:00:00.000Z";
const UNTIL = "2026-09-27T00:00:00.000Z";
const since = Math.floor(new Date(SINCE).getTime() / 1000);
const until = Math.floor(new Date(UNTIL).getTime() / 1000);

function world(games: Array<[id: string, snapshot: string, playedAt: number, pageElo: number | null]>) {
  const { db, d1 } = setupTestDb();
  for (const [id, snap, at, elo] of games) {
    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at, played_at, user_color, result, page_elo)
      VALUES (?, 'u1', ?, '{}', '2026-09-21', '2026-09-21', ?, 'white', 'win', ?)
    `).run(id, snap, at, elo);
  }
  return d1;
}

async function run(games: Parameters<typeof world>[0]) {
  const r = await getWhatChangedUseCase(createD1WhatChangedAdapter(world(games)), { since: SINCE, until: UNTIL, userId: "u1" });
  const jump = r.evaluations.find((e) => e.id === "CHESS_RATING_JUMP")!;
  // one evaluation feeds both: the finding exists exactly when the evaluation is emitted
  expect(r.findings.some((f) => f.id === "CHESS_RATING_JUMP")).toBe(jump.status === "emitted");
  return { r, jump };
}

describe("What Changed ELO with anchors (A4)", () => {
  it("shouldCompareTheAnchorsOfTwoSnapshotsAndEmitWhenTheDeltaReachesTheThreshold", async () => {
    const { r, jump } = await run([
      ["base", "s1", since - 100, 1000],
      ["now", "s2", since + 100, 1030],
    ]);
    expect(r.chess.ratingDelta).toBe(30);
    expect(jump.status).toBe("emitted");
  });

  it("shouldKeepTheCriterionWhenTheAnchorsDifferByLessThanTheThreshold", async () => {
    const { r, jump } = await run([
      ["base", "s1", since - 100, 1000],
      ["now", "s2", since + 100, 1010],
    ]);
    expect(r.chess.ratingDelta).toBe(10);
    expect(jump.reasons).toEqual(["effect_below_threshold"]);
  });

  it("shouldReportDataUnavailableInsteadOfAZeroWhenBaselineAndCurrentShareOneBatch", async () => {
    // Before A4: both games carried the same page_elo, so delta = 0 and the card read "SIN INDICIO".
    const { r, jump } = await run([
      ["old_game", "s_hist", since - 100, 992],
      ["newer_game", "s_hist", since + 100, 992],
    ]);
    expect(r.chess.ratingDelta).toBeNull();
    expect(r.chess.baselineRating).toBeNull(); // old_game is not its batch's anchor
    expect(jump.reasons).toEqual(["data_unavailable"]);
  });

  it("shouldReportDataUnavailableWhenTheWindowOnlyHoldsNonAnchorGames", async () => {
    const { r, jump } = await run([
      ["base", "s1", since - 100, 1000],
      ["in_window", "s2", since + 100, 1040],
      ["anchor_after_window", "s2", until + 100, 1040],
    ]);
    expect(r.chess.baselineRating).toBe(1000);
    expect(r.chess.currentRating).toBeNull();
    expect(r.chess.ratingDelta).toBeNull();
    expect(jump.reasons).toEqual(["data_unavailable"]);
  });

  it("shouldNoLongerEmitTheJumpThatRestedOnANonAnchorElo", async () => {
    // Regression for the one intended change of results (§12.5): the old rule read the window game's own page_elo (1040)
    // and emitted +40; that value is the ELO of snapshot s2, read after "anchor_after_window", so it is not that game's ELO.
    const { r, jump } = await run([
      ["base", "s1", since - 100, 1000],
      ["in_window", "s2", since + 100, 1040],
      ["anchor_after_window", "s2", until + 100, 1040],
    ]);
    expect(r.findings.map((f) => f.id)).not.toContain("CHESS_RATING_JUMP");
    expect(jump.status).toBe("not_emitted");
  });

  it("shouldReportDataUnavailableWhenNoGameHasAnElo", async () => {
    const { jump } = await run([["m1", "s1", since + 100, null]]);
    expect(jump.reasons).toEqual(["data_unavailable"]);
  });
});
