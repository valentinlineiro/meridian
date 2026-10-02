import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";
const require = createRequire(import.meta.url);
const { DatabaseSync: SQLiteDatabase } = require("node:sqlite");
import { readFileSync } from "node:fs";
import worker from "../src/index.ts";
import type { Env } from "../src/types.ts";

function createTestD1(db: DatabaseSync): D1Database {
  const makeStatement = (sql: string, boundArgs: any[] = []) => ({
    bind(...newArgs: any[]) {
      return makeStatement(sql, newArgs);
    },
    all: async () => ({ results: db.prepare(sql).all(...boundArgs) }),
    first: async () => db.prepare(sql).get(...boundArgs) ?? null,
    run: async () => {
      const res = db.prepare(sql).run(...boundArgs);
      return { meta: { changes: Number(res.changes) } };
    },
    _execute: () => db.prepare(sql).run(...boundArgs),
  });
  return {
    prepare(sql: string) {
      return makeStatement(sql);
    },
    async batch(stmts: any[]) {
      for (const s of stmts) s._execute();
      return stmts.map(() => ({ meta: { changes: 1 } }));
    },
  } as unknown as D1Database;
}

const validPayload = {
  source: "duolingo-lang",
  userId: "u-test",
  data: {
    user: { id: "u-test", totalXp: 10, streak: 1, currentCourseId: "DUOLINGO_XA_EN" },
    courses: [{ id: "DUOLINGO_XA_EN", title: "Demo Alpha", subject: "language", xp: 10 }],
  },
};

describe("POST /api/import boundary", () => {
  let db: DatabaseSync;
  let env: Env;

  beforeEach(() => {
    db = new SQLiteDatabase(":memory:");
    db.exec(readFileSync(new URL("../migrations/0001_init.sql", import.meta.url).pathname, "utf8"));
    db.exec(readFileSync(new URL("../migrations/0004_users.sql", import.meta.url).pathname, "utf8"));
    db.exec(readFileSync(new URL("../migrations/0008_languages.sql", import.meta.url).pathname, "utf8"));
    env = { DB: createTestD1(db), IMPORT_TOKEN: "secret" } as unknown as Env;
  });

  it("shouldReturn200WhenImportPayloadIsValid", async () => {
    const res = await worker.fetch(
      new Request("http://localhost/api/import", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer secret" },
        body: JSON.stringify(validPayload),
      }),
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
  });

  it("shouldReturn400InvalidImportPayloadWhenUserIdIsMissing", async () => {
    const res = await worker.fetch(
      new Request("http://localhost/api/import", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer secret" },
        body: JSON.stringify({ source: "duolingo-lang", data: validPayload.data }),
      }),
      env
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body).toEqual({ ok: false, error: "invalid import payload" });
  });

  it("shouldReturn400InvalidJsonBodyWhenBodyIsNotJson", async () => {
    const res = await worker.fetch(
      new Request("http://localhost/api/import", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer secret" },
        body: "not-json{",
      }),
      env
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body).toEqual({ ok: false, error: "invalid json body" });
  });

  it.each(["/api/import", "/api/snapshot"])("shouldReturn401WhenAuthorizationHeaderIsMissingOn %s", async (path) => {
    const res = await worker.fetch(
      new Request(`http://localhost${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validPayload),
      }),
      env
    );
    expect(res.status).toBe(401);
  });

  it.each([undefined, ""])("shouldReturn401WhenImportTokenIsNotConfigured (%j)", async (token) => {
    const res = await worker.fetch(
      new Request("http://localhost/api/snapshot", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer anything" },
        body: JSON.stringify(validPayload),
      }),
      { ...env, IMPORT_TOKEN: token } as unknown as Env
    );
    expect(res.status).toBe(401);
    const n = db.prepare("SELECT COUNT(*) AS n FROM snapshots").get() as { n: number };
    expect(n.n).toBe(0);
  });

  it("shouldReturn401WhenImportTokenDoesNotMatch", async () => {
    const res = await worker.fetch(
      new Request("http://localhost/api/snapshot", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer wrong" },
        body: JSON.stringify(validPayload),
      }),
      { ...env, IMPORT_TOKEN: "secret" } as unknown as Env
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body).toEqual({ ok: false, error: "unauthorized" });
  });

  describe("write-closed-by-default middleware", () => {
    const call = (method: string, path: string, headers: Record<string, string> = {}, e: Env = env) =>
      worker.fetch(new Request(`http://localhost${path}`, { method, headers, body: method === "GET" ? undefined : "{}" }), e);

    it("shouldReturn401WhenPostingToAnyUnknownApiRouteWithoutToken", async () => {
      expect((await call("POST", "/api/some/future/route")).status).toBe(401);
    });

    it.each(["PUT", "PATCH", "DELETE"])("shouldReturn401WhenUsing %s without token", async (m) => {
      expect((await call(m, "/api/snapshot")).status).toBe(401);
    });

    it("shouldRejectRawTokenWithoutBearerScheme", async () => {
      expect((await call("POST", "/api/snapshot", { authorization: "secret" })).status).toBe(401);
    });

    it("shouldAcceptBearerSchemeCaseInsensitively", async () => {
      expect((await call("POST", "/api/snapshot", { authorization: "bearer secret" })).status).not.toBe(401);
    });

    it("shouldNotWriteToDbWhenDetailPostIsUnauthorized", async () => {
      db.exec(readFileSync(new URL("../migrations/0006_match_details.sql", import.meta.url).pathname, "utf8"));
      const res = await worker.fetch(
        new Request("http://localhost/api/chess/matches/m1/detail", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ matchId: "m1", userId: "1000001", moveHistory: ["e2e4"], status: "completed" }),
        }),
        env
      );
      expect(res.status).toBe(401);
      const n = db.prepare("SELECT COUNT(*) AS n FROM match_details").get() as { n: number };
      expect(n.n).toBe(0);
    });
  });

  describe("POST /api/chess/matches/:id/detail auth", () => {
    const post = (headers: Record<string, string>, e: Env) =>
      worker.fetch(
        new Request("http://localhost/api/chess/matches/m1/detail", {
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          body: JSON.stringify("just a string"),
        }),
        e
      );

    it("shouldReturn401WhenAuthorizationHeaderIsMissing", async () => {
      expect((await post({}, env)).status).toBe(401);
    });

    it("shouldReturn401WhenTokenIsWrong", async () => {
      expect((await post({ authorization: "Bearer wrong" }, env)).status).toBe(401);
    });

    it.each([undefined, ""])("shouldReturn401WhenImportTokenIsNotConfigured (%j)", async (token) => {
      const res = await post({ authorization: "Bearer anything" }, { ...env, IMPORT_TOKEN: token } as unknown as Env);
      expect(res.status).toBe(401);
    });

    it("shouldReachValidationWhenTokenIsCorrect", async () => {
      expect((await post({ authorization: "Bearer secret" }, env)).status).toBe(400);
    });
  });

  it("shouldReturn400InvalidMatchDetailPayloadWhenDetailBodyIsNotAnObject", async () => {
    const res = await worker.fetch(
      new Request("http://localhost/api/chess/matches/m1/detail", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer secret" },
        body: JSON.stringify("just a string"),
      }),
      env
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body).toEqual({ ok: false, error: "invalid match detail payload" });
  });
});
