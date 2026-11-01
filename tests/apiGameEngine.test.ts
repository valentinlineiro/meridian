import { describe, it, expect, beforeEach } from "vitest";
import worker from "../src/index.ts";
import type { Env } from "../src/types.ts";
import { createHmacSessionCodec } from "../src/infrastructure/auth/hmacSessionCodec.ts";
import { createSqliteD1 } from "./helpers/sqliteD1.ts";

const SECRET = "x".repeat(48);
const ADMIN = "owner@example.com";
const cookie = async () => `__Host-session=${await createHmacSessionCodec(SECRET)!.sign({ sub: ADMIN, exp: Math.floor(Date.now() / 1000) + 600 })}`;
const OK = { v: 1, status: "ok", moves: 2, loss: 650, byPhase: { opening: [2, 2], middlegame: [0, 0], endgame: [0, 0] }, decisivePly: 1, sustainedAdv: false, sustainedDis: false, minEval: -400, maxEval: 0,
  worst: [{ ply: 3, loss: 350, best: "g1f3" }, { ply: 1, loss: 300, best: "d2d4" }] };

describe("GET /api/me/matches/:id/game engine fields", () => {
  let db: ReturnType<typeof createSqliteD1>["db"];
  let env: Env;
  const seed = (id: string, engine: string | null) =>
    db.prepare("INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result, user_color, opponent_name) VALUES (?, 'u1', 's', 'd', 'd', '{}', 1, 'loss', 'white', 'Ana')").run(id)
      && db.prepare("INSERT INTO match_details (match_id, user_id, status, move_history, move_timestamps, engine_eval) VALUES (?, 'u1', 'done', '[\"e2e4\",\"e7e5\",\"f1c4\",\"b8c6\"]', '[]', ?)").run(id, engine);
  beforeEach(() => {
    const s = createSqliteD1(["0001_init.sql", "0004_users.sql", "0005_played_at.sql", "0006_match_details.sql", "0007_openings_and_phases.sql", "0018_mate_threats.sql", "0019_engine_eval.sql"]);
    db = s.db;
    env = { DB: s.d1, IMPORT_TOKEN: "secret", SESSION_SECRET: SECRET, ADMIN_EMAIL: ADMIN, ADMIN_PASSWORD_HASH: "x" } as unknown as Env;
    db.exec(`
      INSERT INTO users (id, created_at) VALUES ('owner', 'd');
      INSERT INTO user_identities (user_id, provider, subject, created_at) VALUES ('owner', 'cloudflare_access', '${ADMIN}', 'd');
      INSERT INTO user_provider_accounts (user_id, provider, provider_user_id, created_at) VALUES ('owner', 'duolingo', 'u1', 'd');`);
  });
  const get = async (id: string) => (await worker.fetch(new Request(`https://stats.example.com/api/me/matches/${id}/game`, { headers: { cookie: await cookie() } }), env)).json() as Promise<any>;

  it("shouldReturnEngineWorstMovesWithTheBestMoveInSanAndTheSummary", async () => {
    seed("g", JSON.stringify(OK));
    const b = await get("g");
    expect(b.engineWorst).toEqual([{ ply: 3, loss: 350, best: "g1f3", bestSan: "Nf3" }, { ply: 1, loss: 300, best: "d2d4", bestSan: "d4" }]);
    expect(b.engineSummary).toEqual({ moves: 2, serious: 2, acpl: 325 });
  });

  it("shouldReturnEmptyForPendingInvalidOrUnknownEngineEval", async () => {
    seed("p", null); seed("i", JSON.stringify({ v: 1, status: "invalid", reason: "illegal_game" })); seed("u", JSON.stringify({ v: 9, status: "ok" })); seed("b", "{nope");
    for (const id of ["p", "i", "u", "b"]) { const b = await get(id); expect(b.engineWorst).toEqual([]); expect(b.engineSummary).toBeNull(); }
  });

  it("shouldKeepTheViewerWorkingWhenTheStoredBestMoveIsNotLegalHere", async () => {
    seed("g", JSON.stringify({ ...OK, worst: [{ ply: 1, loss: 300, best: "e7e5" }] }));
    const b = await get("g");
    expect(b.engineWorst[0]).toMatchObject({ ply: 1, best: "e7e5", bestSan: null });
  });
});
