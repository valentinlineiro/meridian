import { describe, it, expect, beforeEach } from "vitest";
import { createD1MatchAdapter } from "../src/infrastructure/d1/d1MatchAdapter.ts";
import { createSqliteD1 } from "./helpers/sqliteD1.ts";
import type { MatchPort } from "../src/ports/matchPort.ts";

const MIGRATIONS = ["0001_init.sql", "0005_played_at.sql", "0006_match_details.sql", "0007_openings_and_phases.sql", "0017_opening_family_mate_type.sql", "0018_mate_threats.sql", "0019_engine_eval.sql"];
const OK = { v: 1 as const, status: "ok" as const, moves: 0, loss: 0, byPhase: { opening: [0, 0], middlegame: [0, 0], endgame: [0, 0] } as any, decisivePly: null, sustainedAdv: false, sustainedDis: false, minEval: 0, maxEval: 0, worst: [] };

describe("engine evaluation persistence", () => {
  let db: any;
  let port: MatchPort;
  const match = (id: string, playedAt: number | null, color: string | null = "white") =>
    db.prepare("INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result, user_color) VALUES (?, 'u1', 's', 'd', 'd', '{}', ?, 'win', ?)").run(id, playedAt, color);
  const detail = (id: string, moves = '["e2e4","e7e5"]', ev: string | null = null) =>
    db.prepare("INSERT INTO match_details (match_id, user_id, status, move_history, move_timestamps, ply_count, engine_eval) VALUES (?, 'u1', 'c', ?, '[]', ?, ?)").run(id, moves, JSON.parse(moves).length, ev);
  const stored = (id: string) => db.prepare("SELECT engine_eval FROM match_details WHERE match_id = ?").get(id).engine_eval;
  const resave = (id: string, moves: string) => port.saveMatchDetail({ match_id: id, user_id: "u1", status: "c", move_history: moves, move_timestamps: "[]", ply_count: JSON.parse(moves).length, opening_key: null, phase_key: null } as any);

  beforeEach(() => {
    const s = createSqliteD1(MIGRATIONS);
    db = s.db;
    port = createD1MatchAdapter(s.d1);
  });

  it("shouldListOnlyGamesWithADetailAndNoStoredEngineResultNewestFirstWithStableTies", async () => {
    match("old", 100); detail("old");
    match("newB", 300); detail("newB");
    match("newA", 300); detail("newA");
    match("undated", null); detail("undated");
    match("nodetail", 400);
    const { items, totalPending } = await port.getPendingEngine(10);
    expect(items.map((i) => i.match_id)).toEqual(["newA", "newB", "old", "undated"]);
    expect(totalPending).toBe(4);
    expect(items[0]).toEqual({ match_id: "newA", user_color: "white", move_history: '["e2e4","e7e5"]' });
  });

  it("shouldNotListAGameOnceItHasAnOkOrInvalidResult", async () => {
    match("a", 1); detail("a", '["e2e4"]', JSON.stringify(OK));
    match("b", 2); detail("b", '["e2e4"]', JSON.stringify({ v: 1, status: "invalid", reason: "illegal_game" }));
    match("c", 3); detail("c");
    expect((await port.getPendingEngine(10)).items.map((i) => i.match_id)).toEqual(["c"]);
  });

  it("shouldSkipGamesWithUnknownColourInThePendingQueue", async () => {
    match("w", 1, "white"); detail("w");
    match("x", 2, null); detail("x");
    const r = await port.getPendingEngine(10);
    expect(r.items.map((i) => i.match_id)).toEqual(["w"]);
    expect(r.totalPending).toBe(1);
  });

  it("shouldRespectTheLimitButReportTheFullPendingTotal", async () => {
    for (let i = 1; i <= 3; i++) { match(`m${i}`, i); detail(`m${i}`); }
    const r = await port.getPendingEngine(2);
    expect(r.items).toHaveLength(2);
    expect(r.totalPending).toBe(3);
  });

  it("shouldSaveTheResultWithOneUpdate", async () => {
    match("a", 1); detail("a");
    await port.saveEngineEval("a", OK);
    expect(JSON.parse(stored("a"))).toEqual(OK);
  });

  it("shouldResetEngineEvalWhenTheMoveHistoryChanges", async () => {
    match("a", 1); detail("a", '["e2e4","e7e5"]', JSON.stringify(OK));
    await resave("a", '["e2e4","e7e5","g1f3"]');
    expect(stored("a")).toBeNull();
  });

  it("shouldKeepEngineEvalWhenTheSameDetailIsSavedAgain", async () => {
    match("a", 1); detail("a", '["e2e4","e7e5"]', JSON.stringify(OK));
    await resave("a", '["e2e4","e7e5"]');
    expect(JSON.parse(stored("a"))).toEqual(OK);
  });
});
