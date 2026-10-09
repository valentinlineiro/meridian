import { describe, it, expect } from "vitest";
import { setupTestDb } from "./helpers/testDb.ts";
import { createD1WhatChangedAdapter } from "../src/infrastructure/d1/d1WhatChangedAdapter.ts";
import { getWhatChangedUseCase } from "../src/application/getWhatChangedUseCase.ts";
import { ingestSnapshot } from "../src/api/import.ts";
import { failOnceOn } from "./helpers/failOnce.ts";

// Amendment A4 (docs/contracts/2026-10-06-discarded-signals-contract.md §12): a snapshot's ELO belongs to its anchor game only.
// These tests go through the real adapter and use case, so emission, discard and the response fields come from one evaluation.
const SINCE = "2026-09-20T00:00:00.000Z";
const UNTIL = "2026-09-27T00:00:00.000Z";
const since = Math.floor(new Date(SINCE).getTime() / 1000);
const until = Math.floor(new Date(UNTIL).getTime() / 1000);

function world(games: Array<[id: string, snapshot: string, playedAt: number, pageElo: number | null]>) {
  const { db, d1 } = setupTestDb();
  for (const [id, snap, at, elo] of games) {
    db.prepare(`INSERT OR IGNORE INTO snapshots (id, created_at, source, user_id, raw_json, games_count, pages_count, checksum, size_bytes)
      VALUES (?, '2026-12-31T00:00:00.000Z', 'duolingo-chess', 'u1', '{}', 0, 0, ?, 2)`).run(snap, "chk-" + snap);
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

  it("shouldGiveNoBaselineAndNoDeltaWhenTheBaselineBatchTiesAndALaterAnchorIsValid", async () => {
    const { r, jump } = await run([
      ["tie_a", "s1", since - 100, 1000],
      ["tie_b", "s1", since - 100, 1000], // tied last second: no anchor, so no baseline ELO
      ["valid_later", "s2", since + 100, 1040],
    ]);
    expect(r.chess.baselineRating).toBeNull();
    expect(r.chess.currentRating).toBe(1040);
    expect(r.chess.ratingDelta).toBeNull(); // not 1040 - something invented, and not 0
    expect(jump.reasons).toEqual(["data_unavailable"]);
  });

  it("shouldExposeWhereEachRatingWasPlacedWithoutClaimingItIsTheEloAfterThatGame", async () => {
    const { r } = await run([
      ["base", "s1", since - 100, 1000],
      ["now", "s2", since + 100, 1030],
    ]);
    expect(r.chess.baselineRatingAt).toBe(new Date((since - 100) * 1000).toISOString());
    expect(r.chess.currentRatingAt).toBe(new Date((since + 100) * 1000).toISOString());
  });

  it("shouldKeepEveryNonEloFindingIndependentOfTheEloInputs", async () => {
    // Same games, results and XP; only the ELO observations change. Everything but CHESS_RATING_JUMP must be identical.
    const build = (elo: (i: number) => number | null) => {
      const { db, d1 } = setupTestDb();
      const games: Array<[string, number, string, string]> = [];
      for (let i = 0; i < 20; i++) games.push([`g${i}`, since + 1000 + i * 1000, i < 10 ? "white" : "black", i < 10 ? (i < 9 ? "win" : "loss") : (i < 19 ? "loss" : "win")]);
      for (const [i, [id, at, color, result]] of games.entries()) {
        db.prepare(`INSERT OR IGNORE INTO snapshots (id, created_at, source, user_id, raw_json, games_count, pages_count, checksum, size_bytes) VALUES (?, '2026-12-31T00:00:00.000Z', 'duolingo-chess', 'u1', '{}', 0, 0, ?, 2)`).run(`s${i}`, `chk${i}`);
        db.prepare(`INSERT INTO matches (match_id, user_id, snapshot_id, raw_json, first_seen_at, last_seen_at, played_at, user_color, result, page_elo) VALUES (?, 'u1', ?, '{}', '2026-09-21', '2026-09-21', ?, ?, ?, ?)`).run(id, `s${i}`, at, color, result, elo(i));
      }
      // long history of modest XP, then a big week: LANG_XP_ACCELERATION emits
      for (let d = 0; d < 60; d++) db.prepare("INSERT INTO xp_summaries (user_id, date, gained_xp, num_sessions, total_session_time, updated_at) VALUES ('u1', ?, 100, 2, 600, 'x')").run(since - (60 - d) * 86400);
      for (let d = 1; d <= 7; d++) db.prepare("INSERT INTO xp_summaries (user_id, date, gained_xp, num_sessions, total_session_time, updated_at) VALUES ('u1', ?, 400, 4, 1200, 'x')").run(Math.floor(since / 86400) * 86400 + d * 86400);
      return d1;
    };
    const run1 = (d1: any) => getWhatChangedUseCase(createD1WhatChangedAdapter(d1), { since: SINCE, until: UNTIL, userId: "u1" });
    const withElo = await run1(build((i) => 1000 + i * 3));
    const noElo = await run1(build(() => null));
    const nonElo = (r: typeof withElo) => ({ f: r.findings.filter((f) => f.id !== "CHESS_RATING_JUMP"), e: r.evaluations.filter((e) => e.id !== "CHESS_RATING_JUMP") });
    expect(nonElo(withElo)).toEqual(nonElo(noElo));
    const ids = withElo.findings.map((f) => f.id);
    expect(ids).toContain("LANG_XP_ACCELERATION"); // the comparison is not vacuous
    expect(ids).toContain("CHESS_COLOR_ASYMMETRY");
  });

  describe("batch identity through the real ingestion", () => {
    const chess = (matchIds: string[], elo: number) => ({ source: "duolingo-chess", userId: "u1", data: { eloRating: elo, matchHistory: matchIds.map((matchId) => ({ matchId, userColor: "white", result: "win" })) } });

    it("shouldKeepAGameInTheBatchOfTheSnapshotThatSawItFirstWhenLaterSnapshotsRepeatIt", async () => {
      const { db, d1 } = setupTestDb();
      await ingestSnapshot(d1, { ...chess(["bot|1790000100|a", "bot|1790000200|b"], 1000), createdAt: "2026-09-26T10:00:00.000Z" });
      await ingestSnapshot(d1, { ...chess(["bot|1790000100|a", "bot|1790000200|b", "bot|1790000300|c"], 1030), createdAt: "2026-09-26T12:00:00.000Z" });
      const rows = db.prepare("SELECT match_id, snapshot_id, page_elo FROM matches ORDER BY played_at").all() as any[];
      expect(rows.map((r) => r.page_elo)).toEqual([1000, 1000, 1030]); // a and b keep the first snapshot's ELO
      expect(new Set(rows.map((r) => r.snapshot_id)).size).toBe(2);
      const a = createD1WhatChangedAdapter(d1);
      const w = await a.getChessInterval("u1", "2026-09-01T00:00:00.000Z", "2026-12-01T00:00:00.000Z");
      expect(w.latestRating).toBe(1030); // the later anchor
    });

    it("shouldNotUseTheBatchOfAnAttemptWhoseSnapshotRowWasNeverWritten", async () => {
      const { db, d1 } = setupTestDb();
      const payload = chess(["bot|1790000100|a", "bot|1790000200|b"], 950);
      const flaky = failOnceOn(d1, "snapshots");
      await expect(ingestSnapshot(flaky, payload)).rejects.toThrow("transient D1 error"); // games written, snapshot row not
      await ingestSnapshot(flaky, payload); // the retry stores the snapshot under a NEW id; the games keep the first attempt's
      const ids = db.prepare("SELECT DISTINCT snapshot_id FROM matches").all() as any[];
      const stored = db.prepare("SELECT id FROM snapshots").all() as any[];
      expect(ids.length).toBe(1);
      expect(stored.map((r) => r.id)).not.toContain(ids[0].snapshot_id);
      const w = await createD1WhatChangedAdapter(d1).getChessInterval("u1", "2026-01-01T00:00:00.000Z", "2030-01-01T00:00:00.000Z");
      expect(w.gamesCount).toBe(2);
      expect(w.latestRating).toBeNull(); // a missing ELO, not an attributed one
    });
  });
});
