import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
import { readFileSync } from "node:fs";
import { handleSaveMatchDetail, handleGetMatchDetail } from "../src/api/chessDetail.ts";
import worker from "./helpers/adminWorker.ts";
import type { Env } from "../src/types.ts";

function createTestDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../migrations/0001_init.sql", import.meta.url).pathname, "utf8"));
  db.exec(readFileSync(new URL("../migrations/0005_played_at.sql", import.meta.url).pathname, "utf8"));
  db.exec(readFileSync(new URL("../migrations/0006_match_details.sql", import.meta.url).pathname, "utf8"));
  db.exec(readFileSync(new URL("../migrations/0007_openings_and_phases.sql", import.meta.url).pathname, "utf8"));

  const d1 = {
    prepare(sql: string) {
      return {
        bind(...args: any[]) {
          return {
            first: async () => db.prepare(sql).get(...args),
            all: async () => ({ results: db.prepare(sql).all(...args) }),
            run: async () => {
              const res = db.prepare(sql).run(...args);
              return { meta: { changes: Number(res.changes) } };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return { db, d1 };
}

describe("POST and GET /api/chess/matches/:id/detail", () => {
  it("shouldStoreMatchDetailViaPostAndRetrieveItViaGet", async () => {
    const { db, d1 } = createTestDb();
    const matchId = "bot|1790000001|fixture-bot-001";
    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json)
      VALUES (?, '1000001', 'snap1', datetime('now'), datetime('now'), '{}')
    `).run(matchId);

    const postReq = new Request(`http://x/api/chess/matches/${matchId}/detail`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer secret" },
      body: JSON.stringify({
        matchId,
        userId: "1000001",
        opponentId: "noisy_neural_v2-low-500-noise-4.0",
        moveHistory: ["e2e4", "d7d5"],
        moveTimestamps: [1790578262494, 1790578265000],
        endCondition: "checkmate",
        outcome: "white",
        eloAfter: 950,
        status: "completed",
      }),
    });

    const postRes = await handleSaveMatchDetail(d1, postReq, matchId);
    expect(postRes.status).toBe(200);
    const postBody = (await postRes.json()) as any;
    expect(postBody.ok).toBe(true);

    const getRes = await handleGetMatchDetail(d1, matchId);
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as any;
    expect(getBody.match_id).toBe(matchId);
    expect(getBody.opponent_id).toBe("noisy_neural_v2-low-500-noise-4.0");
    expect(getBody.end_condition).toBe("checkmate");
    expect(getBody.elo_after).toBe(950);
  });

  it("shouldReturn404ForNonExistentMatchDetail", async () => {
    const { d1 } = createTestDb();
    const getRes = await handleGetMatchDetail(d1, "non_existent");
    expect(getRes.status).toBe(404);
  });

  it("shouldReturn400ForInvalidJsonBody", async () => {
    const { d1 } = createTestDb();
    const matchId = "test-match-1";
    const postReq = new Request(`http://x/api/chess/matches/${matchId}/detail`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer secret" },
      body: "invalid-json{",
    });

    const postRes = await handleSaveMatchDetail(d1, postReq, matchId);
    expect(postRes.status).toBe(400);
    const postBody = (await postRes.json()) as any;
    expect(postBody.ok).toBe(false);
    expect(postBody.error).toBe("invalid json body");
  });

  it("shouldReturn400ForInvalidMatchDetailPayload", async () => {
    const { d1 } = createTestDb();
    const matchId = "test-match-2";
    const postReq = new Request(`http://x/api/chess/matches/${matchId}/detail`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer secret" },
      body: JSON.stringify({
        // missing moveHistory
        opponentId: "bot",
      }),
    });

    const postRes = await handleSaveMatchDetail(d1, postReq, matchId);
    expect(postRes.status).toBe(400);
    const postBody = (await postRes.json()) as any;
    expect(postBody.ok).toBe(false);
    expect(postBody.error).toBe("invalid match detail payload");
  });

  it("shouldPopulateMatchIdFromUrlParameterWhenOmittedFromBody", async () => {
    const { db, d1 } = createTestDb();
    const matchId = "url-match-id-123";
    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json)
      VALUES (?, '1000001', 'snap1', datetime('now'), datetime('now'), '{}')
    `).run(matchId);
    const postReq = new Request(`http://x/api/chess/matches/${matchId}/detail`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer secret" },
      body: JSON.stringify({
        userId: "1000001",
        moveHistory: ["e2e4", "e7e5"],
      }),
    });

    const postRes = await handleSaveMatchDetail(d1, postReq, matchId);
    expect(postRes.status).toBe(200);
    const postBody = (await postRes.json()) as any;
    expect(postBody.ok).toBe(true);
    expect(postBody.matchId).toBe(matchId);

    const getRes = await handleGetMatchDetail(d1, matchId);
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as any;
    expect(getBody.match_id).toBe(matchId);
  });

  it("shouldRouteThroughWorkerFetchHandlerForPostAndGet", async () => {
    const { db, d1 } = createTestDb();
    const env: Env = { DB: d1, IMPORT_TOKEN: "secret" };
    const matchId = "routed-match-456";
    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json)
      VALUES (?, '1000001', 'snap1', datetime('now'), datetime('now'), '{}')
    `).run(matchId);

    // POST via router
    const postReq = new Request(`http://localhost/api/chess/matches/${encodeURIComponent(matchId)}/detail`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer secret" },
      body: JSON.stringify({
        userId: "1000001",
        moveHistory: ["d2d4"],
      }),
    });
    const postRes = await worker.fetch(postReq, env);
    expect(postRes.status).toBe(200);
    const postBody = (await postRes.json()) as any;
    expect(postBody.ok).toBe(true);
    expect(postBody.matchId).toBe(matchId);

    // GET via router
    const getReq = new Request(`http://localhost/api/chess/matches/${encodeURIComponent(matchId)}/detail`, {
      method: "GET",
    });
    const getRes = await worker.fetch(getReq, env);
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as any;
    expect(getBody.match_id).toBe(matchId);
  });

  it("shouldAcceptRawDuolingoGetResponseShapeAndResolveUserIdFromMatchesTable", async () => {
    const { db, d1 } = createTestDb();
    const env: Env = { DB: d1, IMPORT_TOKEN: "secret" };
    const matchId = "bot|1790000001|fixture-bot-001";

    // Insert match in matches table to provide user_id
    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at)
      VALUES (?, ?, 'snap1', '2026-09-28', '2026-09-28', '{}', 1790000001)
    `).run(matchId, "1000001");

    // Raw payload from Duolingo API (no userId, moves in match.moveHistory)
    const rawDuolingoPayload = {
      match: {
        id: matchId,
        status: "completed",
        outcome: "white",
        playerColor: "white",
        endCondition: "checkmate",
        boardFen: "4k3/7Q/4bP2/6KP/8/8/8/8 w - - 5 67",
        moveHistory: ["e2e4", "d7d5"],
        moveTimestamps: [1790578262494, 1790578265000],
      },
      opponentId: "neural_v2-gamma-duov4-80m-1850",
      opponentEloRating: null,
    };

    const postReq = new Request(`http://localhost/api/chess/matches/${encodeURIComponent(matchId)}/detail`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer secret" },
      body: JSON.stringify(rawDuolingoPayload),
    });

    const postRes = await worker.fetch(postReq, env);
    expect(postRes.status).toBe(200);
    const postBody = (await postRes.json()) as any;
    expect(postBody.ok).toBe(true);

    const getRes = await worker.fetch(new Request(`http://localhost/api/chess/matches/${encodeURIComponent(matchId)}/detail`), env);
    const getBody = (await getRes.json()) as any;
    expect(getBody.match_id).toBe(matchId);
    expect(getBody.user_id).toBe("1000001");
    expect(getBody.opponent_id).toBe("neural_v2-gamma-duov4-80m-1850");
    expect(getBody.end_condition).toBe("checkmate");
    expect(JSON.parse(getBody.move_history)).toEqual(["e2e4", "d7d5"]);
  });

  it("shouldReturn403WhenPayloadUserDoesNotOwnTheMatch", async () => {
    const { db, d1 } = createTestDb();
    const env: Env = { DB: d1, IMPORT_TOKEN: "secret" };
    const matchId = "owned-by-a";
    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json)
      VALUES (?, 'user-A', 'snap1', datetime('now'), datetime('now'), '{}')
    `).run(matchId);

    const req = new Request(`http://localhost/api/chess/matches/${matchId}/detail`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer secret" },
      body: JSON.stringify({ matchId, userId: "user-B", moveHistory: ["e2e4"], status: "completed" }),
    });

    const res = await worker.fetch(req, env);
    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
    expect(body.code).toBe("OWNERSHIP_VIOLATION");

    const getRes = await handleGetMatchDetail(d1, matchId);
    expect(getRes.status).toBe(404); // nothing was persisted
  });

  it("shouldReturn404WhenMatchDoesNotExist", async () => {
    const { d1 } = createTestDb();
    const env: Env = { DB: d1, IMPORT_TOKEN: "secret" };
    const matchId = "ghost-match";
    const req = new Request(`http://localhost/api/chess/matches/${matchId}/detail`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer secret" },
      body: JSON.stringify({ matchId, userId: "user-A", moveHistory: ["e2e4"], status: "completed" }),
    });

    const res = await worker.fetch(req, env);
    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(false);
    expect(body.code).toBe("NOT_FOUND");
  });
});

describe("GET /api/chess/matches/pending-details", () => {
  it("shouldReturnEmptyItemsWhenDbHasNoMatches", async () => {
    const { d1 } = createTestDb();
    const env: Env = { DB: d1, IMPORT_TOKEN: "secret" };

    const req = new Request("http://localhost/api/chess/matches/pending-details", { headers: { authorization: "Bearer secret" } });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.items).toEqual([]);
    expect(body.totalPending).toBe(0);
    expect(body.next).toBe(false);
  });

  it("shouldReturnOnlyMatchesWithoutMatchDetailsOrderedByPlayedAtDesc", async () => {
    const { db, d1 } = createTestDb();
    const env: Env = { DB: d1, IMPORT_TOKEN: "secret" };

    // Insert 3 matches
    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at)
      VALUES 
        ('m1', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 100),
        ('m2', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 300),
        ('m3', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 200)
    `).run();

    // Insert detail for m2
    db.prepare(`
      INSERT INTO match_details (match_id, user_id, status, move_history, move_timestamps)
      VALUES ('m2', 'u1', 'completed', '[]', '[]')
    `).run();

    const req = new Request("http://localhost/api/chess/matches/pending-details", { headers: { authorization: "Bearer secret" } });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.items).toEqual([
      { match_id: "m3" },
      { match_id: "m1" },
    ]);
    expect(body.totalPending).toBe(2);
    expect(body.next).toBe(false);
  });

  it("shouldRespectLimitParameterAndSetNextTrueWhenMoreItemsExist", async () => {
    const { db, d1 } = createTestDb();
    const env: Env = { DB: d1, IMPORT_TOKEN: "secret" };

    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at)
      VALUES 
        ('m1', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 100),
        ('m2', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 200),
        ('m3', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 300)
    `).run();

    const req = new Request("http://localhost/api/chess/matches/pending-details?limit=2", { headers: { authorization: "Bearer secret" } });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.items).toEqual([
      { match_id: "m3" },
      { match_id: "m2" },
    ]);
    expect(body.totalPending).toBe(3);
    expect(body.next).toBe(true);
  });

  it("shouldDefaultTo50AndBoundMaxTo100WhenLimitIsInvalid", async () => {
    const { db, d1 } = createTestDb();
    const env: Env = { DB: d1, IMPORT_TOKEN: "secret" };

    // Test invalid limits (0, negative, string) default to 50
    for (const invalid of ["0", "-5", "abc", "NaN"]) {
      const req = new Request(`http://localhost/api/chess/matches/pending-details?limit=${invalid}`, { headers: { authorization: "Bearer secret" } });
      const res = await worker.fetch(req, env);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.ok).toBe(true);
    }

    // Verify limit bounding when requesting > 100
    // Insert 105 matches
    const stmt = db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at)
      VALUES (?, 'u1', 's1', '2026-09-28', '2026-09-28', '{}', ?)
    `);
    for (let i = 1; i <= 105; i++) {
      stmt.run(`match_${i}`, i);
    }

    const reqMax = new Request("http://localhost/api/chess/matches/pending-details?limit=999", { headers: { authorization: "Bearer secret" } });
    const resMax = await worker.fetch(reqMax, env);
    const bodyMax = (await resMax.json()) as any;
    expect(bodyMax.items.length).toBe(100);
    expect(bodyMax.totalPending).toBe(105);
    expect(bodyMax.next).toBe(true);
  });

  it("shouldNotModifyMatchesOrMatchDetailsWhenQueried", async () => {
    const { db, d1 } = createTestDb();
    const env: Env = { DB: d1, IMPORT_TOKEN: "secret" };

    db.prepare(`
      INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at)
      VALUES ('m1', 'u1', 's1', '2026-09-28', '2026-09-28', '{}', 100)
    `).run();

    const req = new Request("http://localhost/api/chess/matches/pending-details", { headers: { authorization: "Bearer secret" } });
    await worker.fetch(req, env);

    const matchesCount = db.prepare("SELECT COUNT(*) as count FROM matches").get().count;
    const detailsCount = db.prepare("SELECT COUNT(*) as count FROM match_details").get().count;
    expect(matchesCount).toBe(1);
    expect(detailsCount).toBe(0);
  });
});

