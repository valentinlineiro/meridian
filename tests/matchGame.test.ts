import { describe, it, expect, beforeEach } from "vitest";
import worker from "../src/index.ts";
import type { Env } from "../src/types.ts";
import { createHmacSessionCodec } from "../src/infrastructure/auth/hmacSessionCodec.ts";
import { createSqliteD1 } from "./helpers/sqliteD1.ts";

const SECRET = "x".repeat(48);
const ADMIN = "owner@example.com";
const cookie = async () => `__Host-session=${await createHmacSessionCodec(SECRET)!.sign({ sub: ADMIN, exp: Math.floor(Date.now() / 1000) + 600 })}`;

describe("GET /api/me/matches/:id/game", () => {
  let db: ReturnType<typeof createSqliteD1>["db"];
  let env: Env;
  beforeEach(() => {
    const s = createSqliteD1(["0001_init.sql", "0004_users.sql", "0005_played_at.sql", "0006_match_details.sql", "0007_openings_and_phases.sql"]);
    db = s.db;
    env = { DB: s.d1, IMPORT_TOKEN: "secret", SESSION_SECRET: SECRET, ADMIN_EMAIL: ADMIN, ADMIN_PASSWORD_HASH: "x" } as unknown as Env;
    db.exec(`
      INSERT INTO users (id, created_at) VALUES ('owner', 'd');
      INSERT INTO user_identities (user_id, provider, subject, created_at) VALUES ('owner', 'cloudflare_access', '${ADMIN}', 'd');
      INSERT INTO user_provider_accounts (user_id, provider, provider_user_id, created_at) VALUES ('owner', 'duolingo', 'u1', 'd');
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result, user_color, opponent_name)
        VALUES ('m1', 'u1', 's', 'd', 'd', '{}', 1700000000, 'win', 'white', 'Ana'),
               ('nodetail', 'u1', 's', 'd', 'd', '{}', 1700000100, 'loss', 'black', 'Bob'),
               ('bad', 'u1', 's', 'd', 'd', '{}', 1700000200, 'loss', 'black', 'Cy'),
               ('junk', 'u1', 's', 'd', 'd', '{}', 1700000250, 'loss', 'black', 'Di'),
               ('theirs', 'u2', 's', 'd', 'd', '{}', 1700000300, 'win', 'white', 'Eve');
      INSERT INTO match_details (match_id, user_id, status, move_history, move_timestamps, final_fen)
        VALUES ('m1', 'u1', 'done', '["e2e4","e7e5"]', '[5,9]', 'f'),
               ('bad', 'u1', 'done', '["e2e4","e2e4"]', '[]', null),
               ('theirs', 'u2', 'done', '["e2e4"]', '[]', null),
               ('junk', 'u1', 'done', '{not json', '[]', null);
    `);
  });
  const get = async (path: string, withSession = true) =>
    worker.fetch(new Request(`https://stats.example.com/api/me/matches/${path}`, { headers: withSession ? { cookie: await cookie() } : {} }), env);

  it("shouldReturnPliesWithSanFenAndTimeWhenMatchIsOwnedAndHasDetail", async () => {
    const res = await get("m1/game");
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.plies.map((p: any) => p.san)).toEqual(["e4", "e5"]);
    expect(body.plies.map((p: any) => p.t)).toEqual([5, 9]);
    expect(body.userColor).toBe("white");
    expect(body.opponent).toBe("Ana");
  });

  it("shouldDownloadPgnWithOwnerAsWhiteWhenColorIsWhite", async () => {
    const res = await get("m1/game.pgn");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-chess-pgn");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="meridian-m1.pgn"');
    const pgn = await res.text();
    expect(pgn).toContain('[White "Yo"]');
    expect(pgn).toContain('[Black "Ana"]');
    expect(pgn).toContain('[Date "2023.11.14"]');
    expect(pgn).toContain('[Result "1-0"]');
  });

  it("shouldRespond404WhenMatchBelongsToAnotherUser", async () => {
    expect((await get("theirs/game")).status).toBe(404);
    expect((await get("theirs/game.pgn")).status).toBe(404);
  });

  it("shouldRespond404WhenMatchHasNoDetail", async () => {
    expect((await get("nodetail/game")).status).toBe(404);
  });

  it("shouldRespond422WhenStoredMovesAreIllegal", async () => {
    const res = await get("bad/game");
    expect(res.status).toBe(422);
    expect(((await res.json()) as any).code).toBe("ILLEGAL_GAME");
  });

  it("shouldRespond422CorruptGameWhenStoredJsonIsMalformed", async () => {
    const res = await get("junk/game");
    expect(res.status).toBe(422);
    expect(((await res.json()) as any).code).toBe("CORRUPT_GAME");
  });

  it("shouldReturnStartFenInTheGameBody", async () => {
    expect(((await (await get("m1/game")).json()) as any).startFen).toMatch(/^rnbqkbnr\/pppppppp/);
  });

  it("shouldRefuseWhenNoSession", async () => {
    expect((await get("m1/game", false)).status).toBe(401);
  });
});
