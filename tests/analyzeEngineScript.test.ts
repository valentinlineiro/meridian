import { describe, it, expect } from "vitest";
import { analyzeEngine, evaluateGame } from "../scripts/analyzeEngine.ts";
import type { Evaluator } from "../scripts/stockfishEngine.ts";
import { handleGetPendingEngine, handlePostEngineEval } from "../src/api/chessDetail.ts";
import { createSqliteD1 } from "./helpers/sqliteD1.ts";

const MIGRATIONS = ["0001_init.sql", "0005_played_at.sql", "0006_match_details.sql", "0007_openings_and_phases.sql", "0017_opening_family_mate_type.sql", "0018_mate_threats.sql", "0019_engine_eval.sql"];
const WORKER = "https://worker.example";
const SCHOLAR = ["e2e4", "e7e5", "f1c4", "b8c6", "d1h5", "g8f6", "h5f7"]; // white mates on ply 7
const OPENING = ["e2e4", "e7e5", "g1f3", "b8c6"];

// Answers positions in order; best is always e2e4 (a well-formed UCI move).
const scripted = (cps: number[], over: { failAt?: number } = {}): Evaluator & { calls: string[] } => {
  const calls: string[] = [];
  return { calls, close() {}, async eval(fen) { calls.push(fen); if (over.failAt === calls.length) throw new Error("engine exited"); return { cp: cps[calls.length - 1] ?? 0, best: "e2e4" }; } };
};

describe("evaluateGame", () => {
  it("shouldEvaluateEveryPositionOnceInOrder", async () => {
    const ev = scripted([10, 20, 30, 40, 50]);
    const r = await evaluateGame(OPENING, ev);
    expect(r.evals).toEqual([10, 20, 30, 40, 50]);
    expect(r.bests).toEqual(Array(5).fill("e2e4"));
    expect(ev.calls).toHaveLength(5);
  });

  it("shouldAssignTheMateScoreToTheFinalPositionWithoutAskingTheEngine", async () => {
    const ev = scripted(Array(7).fill(0));
    const r = await evaluateGame(SCHOLAR, ev);
    expect(ev.calls).toHaveLength(7); // 8 positions, the last one is mate
    expect(r.evals[7]).toBe(10000); // black is mated: good for White
    expect(r.bests[7]).toBeNull();
  });

  it("shouldScoreAStalemateAsZeroWithoutAskingTheEngine", async () => {
    const LOYD = "e2e3 a7a5 d1h5 a8a6 h5a5 h7h5 h2h4 a6h6 a5c7 f7f6 c7d7 e8f7 d7b7 d8d3 b7b8 d3h7 b8c8 f7g6 c8e6".split(" ");
    const ev = scripted(Array(19).fill(50));
    const r = await evaluateGame(LOYD, ev);
    expect(ev.calls).toHaveLength(19); // 20 positions, the last is stalemate
    expect(r.evals[19]).toBe(0);
    expect(r.bests[19]).toBeNull();
  });

  it("shouldThrowIllegalGameForAnIllegalMove", async () => {
    await expect(evaluateGame(["e2e5"], scripted([]))).rejects.toThrow(/illegal move/);
  });
});

function harness(moves: string[], color: "white" | "black" = "white") {
  const { db, d1 } = createSqliteD1(MIGRATIONS);
  db.prepare("INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result, user_color) VALUES ('g1', 'u1', 's', 'd', 'd', '{}', 1, 'win', ?)").run(color);
  db.prepare("INSERT INTO match_details (match_id, user_id, status, move_history, move_timestamps, ply_count, end_condition) VALUES ('g1', 'u1', 'c', ?, '[]', ?, 'checkmate')").run(JSON.stringify(moves), moves.length);
  const logs: string[] = [];
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    if (u.pathname === "/api/chess/matches/pending-engine") return handleGetPendingEngine(d1, new Request(url));
    const id = decodeURIComponent(u.pathname.split("/")[4]!);
    return handlePostEngineEval(d1, new Request(url, { method: "POST", body: init!.body as string }), id);
  }) as unknown as typeof fetch;
  const stored = () => db.prepare("SELECT engine_eval FROM match_details WHERE match_id = 'g1'").get().engine_eval as string | null;
  const run = (evaluator: Evaluator) => analyzeEngine({ fetch: fakeFetch, worker: WORKER, importToken: "t", sleep: async () => {}, evaluator, log: (l) => logs.push(l) });
  return { run, stored, logs, db };
}

describe("analyzeEngine", () => {
  it("shouldPostAnOkSummaryThatTheServerAcceptsForAReplayableGame", async () => {
    const h = harness(SCHOLAR);
    // white's turns are positions 0,2,4,6: eval drops on white's move 2 (position 2 -> 3) by 700
    const m = await run(h, [0, 0, 0, -700, -700, -700, -700]);
    expect(m).toMatchObject({ ok: 1, invalid: 0, failed: 0, remaining: 0, aborted: null });
    const s = JSON.parse(h.stored()!);
    expect(s).toMatchObject({ v: 1, status: "ok", moves: 4, loss: 700, decisivePly: 3, worst: [{ ply: 3, loss: 700, best: "e2e4" }] });
  });

  it("shouldPostInvalidIllegalGameForAnIllegalMove", async () => {
    const h = harness(["e2e4", "e7e5", "e2e4"]);
    await h.run(scripted([]));
    expect(JSON.parse(h.stored()!)).toEqual({ v: 1, status: "invalid", reason: "illegal_game" });
  });

  it("shouldPostInvalidCorruptGameForUnreadableHistory", async () => {
    const h = harness([]);
    h.db.prepare("UPDATE match_details SET move_history = 'not json' WHERE match_id = 'g1'").run();
    await h.run(scripted([]));
    expect(JSON.parse(h.stored()!)).toEqual({ v: 1, status: "invalid", reason: "corrupt_game" });
  });

  it("shouldCountEngineFailuresAsFailedAndLeaveTheGamePending", async () => {
    const h = harness(OPENING);
    const m = await h.run(scripted([], { failAt: 2 }));
    expect(m.failed).toBe(1);
    expect(m.aborted).toMatch(/no progress/);
    expect(h.stored()).toBeNull();
  });

  it("shouldStopWithinTheBudgetBeforeStartingAGame", async () => {
    const h = harness(OPENING);
    const ev = scripted([]);
    const m = await analyzeEngine({ fetch: (async (u: string, i?: RequestInit) => new Response(JSON.stringify({ items: [{ match_id: "g1", user_color: "white", move_history: "[]" }], totalPending: 1 }))) as unknown as typeof fetch, worker: WORKER, importToken: "t", budgetMs: 0, now: () => 5, evaluator: ev });
    expect(m.ok + m.invalid + m.failed).toBe(0);
    expect(ev.calls).toHaveLength(0);
    void h;
  });

  it("shouldNotLogIdsOrMoves", async () => {
    const h = harness(OPENING);
    await h.run(scripted([], { failAt: 1 }));
    expect(h.logs.join(" ")).not.toMatch(/g1|e2e4/);
  });
});

async function run(h: ReturnType<typeof harness>, cps: number[]) { return h.run(scripted(cps)); }
