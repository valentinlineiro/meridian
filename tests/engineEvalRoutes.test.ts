import { describe, it, expect, beforeEach } from "vitest";
import { handleGetPendingEngine, handlePostEngineEval } from "../src/api/chessDetail.ts";
import { createSqliteD1 } from "./helpers/sqliteD1.ts";

const MIGRATIONS = ["0001_init.sql", "0005_played_at.sql", "0006_match_details.sql", "0007_openings_and_phases.sql", "0017_opening_family_mate_type.sql", "0018_mate_threats.sql", "0019_engine_eval.sql"];
// white, 5 plies: the owner has plies 1, 3 and 5
const GOOD = { status: "ok", moves: 3, loss: 400, byPhase: { opening: [3, 1], middlegame: [0, 0], endgame: [0, 0] }, decisivePly: 3, sustainedAdv: false, sustainedDis: false, minEval: -400, maxEval: 0, worst: [{ ply: 3, loss: 400, best: "e2e4" }] };

describe("engine evaluation machine routes", () => {
  let db: any;
  let d1: D1Database;
  const seed = (id: string, color: string | null = "white", moves = '["e2e4","e7e5","g1f3","b8c6","f1c4"]') => {
    db.prepare("INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result, user_color) VALUES (?, 'u1', 's', 'd', 'd', '{}', 1, 'win', ?)").run(id, color);
    db.prepare("INSERT INTO match_details (match_id, user_id, status, move_history, move_timestamps, ply_count, end_condition) VALUES (?, 'u1', 'c', ?, '[]', ?, 'checkmate')").run(id, moves, JSON.parse(moves).length);
  };
  const post = (id: string, body: unknown, raw?: string) =>
    handlePostEngineEval(d1, new Request(`http://x/api/chess/matches/${id}/engine`, { method: "POST", body: raw ?? JSON.stringify(body) }), id);
  const stored = (id: string) => db.prepare("SELECT engine_eval FROM match_details WHERE match_id = ?").get(id)?.engine_eval ?? null;

  beforeEach(() => { const s = createSqliteD1(MIGRATIONS); db = s.db; d1 = s.d1; });

  it("shouldReturnOnlyTheThreeFieldsInPending", async () => {
    seed("g1");
    const res = await handleGetPendingEngine(d1, new Request("http://x/api/chess/matches/pending-engine?limit=5"));
    const body = await res.json() as any;
    expect(res.status).toBe(200);
    expect(body.totalPending).toBe(1);
    expect(Object.keys(body.items[0]).sort()).toEqual(["match_id", "move_history", "user_color"]);
  });

  it("shouldCapThePendingLimitAtOneHundred", async () => {
    for (let i = 0; i < 3; i++) seed(`g${i}`);
    const res = await handleGetPendingEngine(d1, new Request("http://x/p?limit=100000"));
    expect(((await res.json()) as any).items).toHaveLength(3);
  });

  it("shouldStoreAnOkResultAndStampVersionOne", async () => {
    seed("g1");
    expect((await post("g1", GOOD)).status).toBe(200);
    expect(JSON.parse(stored("g1"))).toEqual({ v: 1, ...GOOD });
  });

  it("shouldStoreAnInvalidMarkerAndKeepItOutOfPending", async () => {
    seed("g1");
    expect((await post("g1", { status: "invalid", reason: "illegal_game" })).status).toBe(200);
    expect(JSON.parse(stored("g1"))).toEqual({ v: 1, status: "invalid", reason: "illegal_game" });
    expect(((await (await handleGetPendingEngine(d1, new Request("http://x/p"))).json()) as any).totalPending).toBe(0);
  });

  it("shouldAnswer404WhenTheMatchHasNoDetail", async () => {
    db.prepare("INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, user_color) VALUES ('bare','u1','s','d','d','{}','white')").run();
    expect((await post("bare", GOOD)).status).toBe(404);
    expect((await post("missing", GOOD)).status).toBe(404);
  });

  it("shouldAnswer422AndWriteNothingOnAnInvariantViolation", async () => {
    seed("g1");
    await post("g1", GOOD);
    const before = stored("g1");
    const res = await post("g1", { ...GOOD, moves: 9 });
    expect(res.status).toBe(422);
    expect(((await res.json()) as any).code).toBe("INVALID_ENGINE_EVAL");
    expect(stored("g1")).toBe(before);
  });

  it("shouldRejectPliesOfTheOtherColour", async () => {
    seed("g1", "white");
    expect((await post("g1", { ...GOOD, decisivePly: 2 })).status).toBe(422);
    expect((await post("g1", { ...GOOD, worst: [{ ply: 2, loss: 400, best: "e2e4" }] })).status).toBe(422);
    expect(stored("g1")).toBeNull();
  });

  it.each([
    ["aVersion", { ...GOOD, v: 1 }],
    ["anUnknownKey", { ...GOOD, extra: true }],
    ["anUnknownStatus", { ...GOOD, status: "maybe" }],
    ["aMissingField", { status: "ok", moves: 1 }],
    ["aWrongType", { ...GOOD, moves: "3" }],
    ["tooManyWorstEntries", { ...GOOD, worst: Array.from({ length: 6 }, (_, i) => ({ ply: 2 * i + 1, loss: 400, best: "e2e4" })) }],
    ["aWorstEntryWithAnExtraKey", { ...GOOD, worst: [{ ply: 3, loss: 400, best: "e2e4", why: "x" }] }],
    ["aReasonOutsideTheSet", { status: "invalid", reason: "because" }],
    ["anInvalidMarkerWithFigures", { status: "invalid", reason: "illegal_game", moves: 1 }],
  ])("shouldReject422WhenTheBodyCarries_%s", async (_n, body) => {
    seed("g1");
    expect((await post("g1", body)).status).toBe(422);
    expect(stored("g1")).toBeNull();
  });

  it("shouldReject400OnInvalidJson", async () => {
    seed("g1");
    expect((await post("g1", null, "{nope")).status).toBe(400);
  });

  it("shouldBeIdempotentWhenPostedTwice", async () => {
    seed("g1");
    await post("g1", GOOD);
    const once = stored("g1");
    expect((await post("g1", GOOD)).status).toBe(200);
    expect(stored("g1")).toBe(once);
  });

  it("shouldReplaceAnEarlierResultInsteadOfAddingToIt", async () => {
    seed("g1");
    await post("g1", GOOD);
    await post("g1", { status: "invalid", reason: "engine_error" });
    expect(JSON.parse(stored("g1"))).toEqual({ v: 1, status: "invalid", reason: "engine_error" });
  });

  it("shouldNeverTouchOtherColumns", async () => {
    seed("g1");
    const row = () => { const { engine_eval: _e, updated_at: _u, ...rest } = db.prepare("SELECT * FROM match_details WHERE match_id='g1'").get(); return rest; };
    const before = row();
    await post("g1", GOOD);
    expect(row()).toEqual(before);
  });
});
