import { describe, it, expect, beforeEach } from "vitest";
import { createD1MatchAdapter } from "../src/infrastructure/d1/d1MatchAdapter.ts";
import { createSqliteD1 } from "./helpers/sqliteD1.ts";
import type { MatchPort } from "../src/ports/matchPort.ts";

const MIGRATIONS = ["0001_init.sql", "0005_played_at.sql", "0006_match_details.sql", "0007_openings_and_phases.sql", "0017_opening_family_mate_type.sql", "0018_mate_threats.sql"];
const OK = { v: 1 as const, status: "ok" as const, faced: 0, neutralized: 0, missed: 0, unpunished: 0, byPhase: { opening: [0, 0, 0], middlegame: [0, 0, 0], endgame: [0, 0, 0] } as any, missedPlies: [] };

describe("mate threats persistence", () => {
  let db: any;
  let port: MatchPort;
  const match = (id: string, playedAt: number | null, color: string | null = "white") =>
    db.prepare("INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result, user_color) VALUES (?, 'u1', 's', 'd', 'd', '{}', ?, 'win', ?)").run(id, playedAt, color);
  const detail = (id: string, moves = '["e2e4","e7e5"]', threats: string | null = null) =>
    db.prepare("INSERT INTO match_details (match_id, user_id, status, move_history, move_timestamps, ply_count, mate_threats) VALUES (?, 'u1', 'c', ?, '[]', ?, ?)").run(id, moves, JSON.parse(moves).length, threats);

  beforeEach(() => {
    const s = createSqliteD1(MIGRATIONS);
    db = s.db;
    port = createD1MatchAdapter(s.d1);
  });

  it("shouldListOnlyGamesWithADetailAndNoStoredResultNewestFirstWithStableTies", async () => {
    match("old", 100); detail("old");
    match("newB", 300); detail("newB");
    match("newA", 300); detail("newA");
    match("undated", null); detail("undated");
    match("nodetail", 400);
    const { items, totalPending } = await port.getPendingThreats(10);
    expect(items.map((i) => i.match_id)).toEqual(["newA", "newB", "old", "undated"]);
    expect(totalPending).toBe(4);
    expect(items[0]).toEqual({ match_id: "newA", user_color: "white", move_history: '["e2e4","e7e5"]' });
  });

  it("shouldNotListAGameOnceItHasAnOkOrInvalidResult", async () => {
    match("a", 1); detail("a", '["e2e4"]', JSON.stringify(OK));
    match("b", 2); detail("b", '["e2e4"]', JSON.stringify({ v: 1, status: "invalid", reason: "illegal_game" }));
    match("c", 3); detail("c");
    expect((await port.getPendingThreats(10)).items.map((i) => i.match_id)).toEqual(["c"]);
  });

  it("shouldKeepGamesWithAnUnknownColourOutOfTheQueue", async () => {
    match("known", 1); detail("known");
    match("nocolour", 2, null); detail("nocolour");
    match("blank", 3, "  "); detail("blank");
    const r = await port.getPendingThreats(10);
    expect(r.items.map((i) => i.match_id)).toEqual(["known"]);
    expect(r.totalPending).toBe(1);
  });

  it("shouldLimitTheBatchButCountEveryPendingGame", async () => {
    for (let i = 0; i < 5; i++) { match(`m${i}`, i); detail(`m${i}`); }
    const r = await port.getPendingThreats(2);
    expect(r.items).toHaveLength(2);
    expect(r.totalPending).toBe(5);
  });

  it("shouldReturnNullTargetWhenThereIsNoDetailOrTheColourIsUnknown", async () => {
    match("nodetail", 1);
    match("nocolour", 2, null); detail("nocolour");
    expect(await port.getThreatTarget("nodetail")).toBeNull();
    expect(await port.getThreatTarget("nocolour")).toBeNull();
    expect(await port.getThreatTarget("missing")).toBeNull();
  });

  it("shouldReturnThePlyCountAndTheNormalisedColour", async () => {
    match("g", 1, "Black"); detail("g", '["e2e4","e7e5","g1f3"]');
    expect(await port.getThreatTarget("g")).toEqual({ plyCount: 3, userColor: "black" });
  });

  it("shouldPersistTheJsonInOneUpdateAndOnlyThatColumn", async () => {
    match("g", 1); detail("g");
    const before = db.prepare("SELECT * FROM match_details WHERE match_id='g'").get();
    await port.saveMateThreats("g", OK);
    const after = db.prepare("SELECT * FROM match_details WHERE match_id='g'").get();
    expect(JSON.parse(after.mate_threats)).toEqual(OK);
    const { mate_threats: _a, updated_at: _u1, ...restAfter } = after; const { mate_threats: _b, updated_at: _u2, ...restBefore } = before;
    expect(restAfter).toEqual(restBefore);
  });

  it("shouldBeIdempotentWhenSavingTheSameResultTwice", async () => {
    match("g", 1); detail("g");
    await port.saveMateThreats("g", OK);
    const once = db.prepare("SELECT mate_threats FROM match_details WHERE match_id='g'").get().mate_threats;
    await port.saveMateThreats("g", OK);
    expect(db.prepare("SELECT mate_threats FROM match_details WHERE match_id='g'").get().mate_threats).toBe(once);
  });

  // A stored result describes one move list. If the game is saved again with different moves, the old result no longer describes it.
  describe("when the detail is saved again", () => {
    const record = (moves: string[]) => ({
      match_id: "g", user_id: "u1", opponent_id: null, is_hard_match: null, is_placement_match: null, is_revenge_match: null,
      predicted_elo_win: null, predicted_elo_loss: null, predicted_elo_draw: null, elo_after: null, outcome: null, end_condition: null,
      status: "completed", move_history: JSON.stringify(moves), move_timestamps: "[]", final_fen: null, reaction: null, session_duration: null,
      opening_key: null, phase_key: null, ply_count: moves.length,
    });

    it("shouldKeepTheResultWhenTheMovesAreTheSame", async () => {
      match("g", 1);
      await port.saveMatchDetail(record(["e2e4", "e7e5"]));
      await port.saveMateThreats("g", OK);
      await port.saveMatchDetail(record(["e2e4", "e7e5"]));
      expect(JSON.parse(db.prepare("SELECT mate_threats FROM match_details WHERE match_id='g'").get().mate_threats)).toEqual(OK);
    });

    it("shouldMakeTheGamePendingAgainWhenTheMovesChange", async () => {
      match("g", 1);
      await port.saveMatchDetail(record(["e2e4", "e7e5"]));
      await port.saveMateThreats("g", OK);
      await port.saveMatchDetail(record(["e2e4", "e7e5", "g1f3"]));
      expect(db.prepare("SELECT mate_threats FROM match_details WHERE match_id='g'").get().mate_threats).toBeNull();
      expect((await port.getPendingThreats(10)).items.map((i) => i.match_id)).toEqual(["g"]);
    });
  });
});
