import { describe, it, expect, beforeEach } from "vitest";
import { handleStats } from "../src/api/stats.ts";
import { createSqliteD1 } from "./helpers/sqliteD1.ts";

const MIGRATIONS = ["0001_init.sql", "0004_users.sql", "0005_played_at.sql", "0006_match_details.sql", "0007_openings_and_phases.sql", "0017_opening_family_mate_type.sql", "0018_mate_threats.sql", "0019_engine_eval.sql"];
type Phase = [moves: number, serious: number];
const ev = (o: { opening?: Phase; middle?: Phase; end?: Phase; loss?: number; decisivePly?: number | null; adv?: boolean; dis?: boolean } = {}) => {
  const opening = o.opening ?? [10, 1], middlegame = o.middle ?? [0, 0], endgame = o.end ?? [0, 0];
  const serious = opening[1] + middlegame[1] + endgame[1];
  return JSON.stringify({
    v: 1, status: "ok", moves: opening[0] + middlegame[0] + endgame[0], loss: o.loss ?? serious * 400,
    byPhase: { opening, middlegame, endgame }, decisivePly: o.decisivePly ?? null, sustainedAdv: o.adv ?? false, sustainedDis: o.dis ?? false,
    minEval: o.dis ? -400 : 0, maxEval: o.adv ? 400 : 0, worst: serious ? [{ ply: 1, loss: Math.max(300, (o.loss ?? serious * 400) / serious), best: "e2e4" }].slice(0, Math.min(serious, 1)) : [],
  });
};
const INVALID = JSON.stringify({ v: 1, status: "invalid", reason: "illegal_game" });

describe("player profile reads", () => {
  let db: any;
  let d1: D1Database;
  let at = 0;
  const game = (id: string, engine: string | null, over: { result?: string; color?: string; type?: string; playedAt?: number | null; userId?: string; end?: string } = {}) => {
    const t = over.playedAt === undefined ? ++at : over.playedAt;
    db.prepare("INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result, user_color, opponent_type) VALUES (?, ?, 's', 'd', 'd', '{}', ?, ?, ?, ?)")
      .run(id, over.userId ?? "u1", t, over.result ?? "win", over.color ?? "white", over.type ?? "bot");
    db.prepare("INSERT INTO match_details (match_id, user_id, status, move_history, move_timestamps, ply_count, engine_eval, end_condition) VALUES (?, ?, 'c', '[]', '[]', 0, ?, ?)").run(id, over.userId ?? "u1", engine, over.end ?? null);
  };
  const profile = async (qs = "") => (await handleStats(d1, "profile", new URL(`http://x/api/stats/profile${qs}`))).json() as Promise<any>;

  beforeEach(() => { const s = createSqliteD1(MIGRATIONS); db = s.db; d1 = s.d1; at = 0; });

  it("shouldAggregateOnlyOkResultsAndCountTheRestApart", async () => {
    game("a", ev({ opening: [10, 1] }));
    game("b", ev({ opening: [10, 3] }));
    game("pending", null);
    game("invalid", INVALID);
    game("future", JSON.stringify({ v: 2, status: "ok" }));
    game("broken", "{nope");
    const p = await profile();
    expect(p).toMatchObject({ analysed: 2, pending: 1, invalid: 1, unknownVersion: 2 });
    expect(p.all).toMatchObject({ games: 2, moves: 20, serious: 4, ratePer100: 20, acpl: 4 * 400 / 20 });
  });

  it("shouldCountGamesWithoutDetailsApartInsteadOfDroppingThem", async () => {
    game("a", ev({ opening: [10, 1] }));
    db.prepare("INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result, user_color, opponent_type) VALUES ('nd', 'u1', 's', 'd', 'd', '{}', 99, 'win', 'white', 'bot')").run();
    const p = await profile();
    expect(p).toMatchObject({ analysed: 1, pending: 0, noDetail: 1, bots: { total: 2 } });
  });

  it("shouldComputeRatesPer100MovesByPhaseAndColour", async () => {
    game("w", ev({ opening: [10, 1], middle: [30, 3], end: [10, 0] }), { color: "white" });
    game("b", ev({ opening: [10, 2], middle: [10, 0] }), { color: "black" });
    const p = await profile();
    expect(p.all.byPhase.opening).toEqual({ moves: 20, serious: 3, ratePer100: 15 });
    expect(p.all.byPhase.middlegame).toEqual({ moves: 40, serious: 3, ratePer100: 7.5 });
    expect(p.all.byPhase.endgame).toEqual({ moves: 10, serious: 0, ratePer100: 0 });
    expect(p.all.byColor.white).toMatchObject({ games: 1, moves: 50, serious: 4 });
    expect(p.all.byColor.black).toMatchObject({ games: 1, moves: 20, serious: 2, ratePer100: 10 });
  });

  it("shouldReturnNullRatesWithZeroDenominators", async () => {
    const empty = await profile();
    expect(empty.all).toMatchObject({ games: 0, moves: 0, ratePer100: null, acpl: null });
    expect(empty.all.byPhase.endgame.ratePer100).toBeNull();
    expect(empty.bots.share).toBeNull();
    expect(empty.blocks).toEqual([]);
    game("zero", ev({ opening: [0, 0] }));
    const p = await profile();
    expect(p.all.ratePer100).toBeNull();
    expect(p.review.worst).toEqual([]);
  });

  it("shouldCountBotsFromTheOpponentTypeLive", async () => {
    game("a", ev(), { type: "bot" }); game("b", ev(), { type: "pvp" }); game("c", ev(), { type: "Bot" }); game("d", ev(), { type: "bot" });
    expect((await profile()).bots).toEqual({ games: 3, total: 4, share: 0.75 });
  });

  it("shouldBuildBlocksOf50InPlayedAtOrderWithAPartialLastBlock", async () => {
    for (let i = 0; i < 120; i++) game(`g${String(i).padStart(3, "0")}`, ev({ opening: [10, i < 50 ? 2 : 1] }));
    const { blocks } = await profile();
    expect(blocks.map((b: any) => [b.games, b.partial])).toEqual([[50, false], [50, false], [20, true]]);
    expect(blocks[0]).toMatchObject({ moves: 500, serious: 100, ratePer100: 20 });
    expect(blocks[1].ratePer100).toBe(10);
  });

  it("shouldClassifyDecisiveMomentsOnLostGamesByMoveAndPhase", async () => {
    game("l1", ev({ decisivePly: 7 }), { result: "loss" });   // move 4, opening
    game("l2", ev({ decisivePly: 41 }), { result: "loss" });  // move 21, middlegame
    game("l3", ev({ decisivePly: 81 }), { result: "loss" });  // move 41, endgame
    game("l4", ev({ decisivePly: null }), { result: "loss" });
    game("w1", ev({ decisivePly: 5 }), { result: "win" });    // wins are not part of it
    const d = (await profile()).all.decisive;
    expect(d).toMatchObject({ lossGames: 4, withDecisive: 3, medianMove: 21, byPhase: { opening: 1, middlegame: 1, endgame: 1 } });
    expect(d.competitive).toEqual({ lossGames: 4, withDecisive: 3, medianMove: 21, byPhase: { opening: 1, middlegame: 1, endgame: 1 } });
    expect(d.disconnection).toEqual({ lossGames: 0, withDecisive: 0, byPhase: { opening: 0, middlegame: 0, endgame: 0 } });
  });

  it("shouldSeparateDisconnectionLossesFromCompetitiveOnesWithoutRemovingThem", async () => {
    game("c1", ev({ decisivePly: 7 }), { result: "loss", end: "checkmate" });     // move 4, opening
    game("c2", ev({ decisivePly: 41 }), { result: "loss", end: "resignation" });  // move 21, middlegame
    game("c3", ev({ decisivePly: null }), { result: "loss", end: "checkmate" });
    game("d1", ev({ decisivePly: 5 }), { result: "loss", end: "disconnection" }); // move 3, opening
    game("d2", ev({ decisivePly: 9 }), { result: "loss", end: "disconnection" }); // move 5, opening
    game("d3", ev({ decisivePly: null }), { result: "loss", end: "disconnection" });
    game("w1", ev({ decisivePly: 5 }), { result: "win", end: "disconnection" });  // the opponent's disconnection: not the owner's
    game("n1", ev({ decisivePly: 7 }), { result: "loss" });                       // no end condition recorded: competitive
    const d = (await profile()).all.decisive;
    expect(d).toMatchObject({ lossGames: 7, withDecisive: 5, byPhase: { opening: 4, middlegame: 1, endgame: 0 } }); // every loss, as before
    expect(d.competitive).toEqual({ lossGames: 4, withDecisive: 3, medianMove: 4, byPhase: { opening: 2, middlegame: 1, endgame: 0 } });
    expect(d.disconnection).toEqual({ lossGames: 3, withDecisive: 2, byPhase: { opening: 2, middlegame: 0, endgame: 0 } });
    expect(d.competitive.lossGames + d.disconnection.lossGames).toBe(d.lossGames); // nothing lost, nothing counted twice
  });

  it("shouldCountOutcomesAfterSustainedAdvantageAndDisadvantageWithDrawsApart", async () => {
    game("a1", ev({ adv: true }), { result: "win" }); game("a2", ev({ adv: true }), { result: "draw" }); game("a3", ev({ adv: true }), { result: "loss" });
    game("d1", ev({ dis: true }), { result: "win" }); game("d2", ev({ dis: true }), { result: "loss" });
    game("n", ev(), { result: "win" });
    const c = (await profile()).all.conversion;
    expect(c.advantage).toEqual({ games: 3, win: 1, draw: 1, loss: 1 });
    expect(c.disadvantage).toEqual({ games: 2, win: 1, draw: 0, loss: 1 });
    expect(c.thrown).toBe(1);
  });

  it("shouldSplitBeforeAndAfterTheSinceGame", async () => {
    game("a", ev({ opening: [10, 2] })); game("cut", ev({ opening: [10, 2] })); game("b", ev({ opening: [10, 0] })); game("c", ev({ opening: [10, 1] }));
    const p = await profile("?since=cut");
    expect(p.since).toEqual({ matchId: "cut", playedAt: 2 });
    expect(p.before).toMatchObject({ games: 2, serious: 4 });
    expect(p.after).toMatchObject({ games: 2, serious: 1, ratePer100: 5 });
  });

  it("shouldSplitGamesSharingTheCutTimestampByInsertionOrderAndLeaveUndatedGamesOut", async () => {
    game("a", ev({ opening: [10, 2] }), { playedAt: 5 }); game("cut", ev({ opening: [10, 2] }), { playedAt: 5 });
    game("tie", ev({ opening: [10, 0] }), { playedAt: 5 }); game("later", ev({ opening: [10, 1] }), { playedAt: 9 });
    game("undated", ev({ opening: [10, 9] }), { playedAt: null });
    const p = await profile("?since=cut");
    expect(p.before).toMatchObject({ games: 2, serious: 4 });
    expect(p.after).toMatchObject({ games: 2, serious: 1 });
  });

  it("shouldIgnoreAnUnknownOrUndatedSinceWithoutFailing", async () => {
    game("a", ev()); game("undated", ev(), { playedAt: null });
    for (const since of ["nope", "undated"]) {
      const p = await profile(`?since=${since}`);
      expect(p.since).toBeNull();
      expect(p.before).toBeNull();
      expect(p.after).toBeNull();
      expect(p.all.games).toBe(2);
    }
  });

  it("shouldRankReviewByAcplWithAtLeast20OwnMovesAndExcludePendingInvalid", async () => {
    game("short", ev({ opening: [19, 19], loss: 19 * 900 }));      // too short to rank
    game("bad", ev({ opening: [20, 10], loss: 20 * 300 }));       // acpl 300
    game("mid", ev({ opening: [30, 3], loss: 30 * 50 }));         // acpl 50
    game("good", ev({ opening: [40, 0], loss: 40 * 5 }));         // acpl 5
    game("pending", null); game("invalid", INVALID);
    const { review } = await profile();
    expect(review.worst.map((r: any) => r.matchId)).toEqual(["bad", "mid", "good"]);
    expect(review.best.map((r: any) => r.matchId)).toEqual(["good", "mid", "bad"]);
    expect(review.worst[0]).toEqual({ matchId: "bad", opponent: null, playedAt: 2, color: "white", result: "win", moves: 20, serious: 10, acpl: 300, decisivePly: null });
  });

  it("shouldFilterByUser", async () => {
    game("mine", ev(), { userId: "u1" }); game("other", ev(), { userId: "u2" });
    const p = (await (await handleStats(d1, "profile", new URL("http://x/api/stats/profile?userId=u1"))).json()) as any;
    expect(p.analysed).toBe(1);
  });
});
