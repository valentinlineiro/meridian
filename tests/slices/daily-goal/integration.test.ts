import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../../src/index.ts";
import type { Env } from "../../../src/types.ts";
import { createHmacSessionCodec } from "../../../src/infrastructure/auth/hmacSessionCodec.ts";
import { createSqliteD1 } from "../../helpers/sqliteD1.ts";

const SECRET = "x".repeat(48), ADMIN = "owner@example.com", BASE = "https://stats.example.com";
const SAME = { "sec-fetch-site": "same-origin", "content-type": "application/json" };
const cookie = async () => `__Host-session=${await createHmacSessionCodec(SECRET)!.sign({ sub: ADMIN, exp: Math.floor(Date.now() / 1000) + 600 })}`;

let state: ReturnType<typeof createSqliteD1>;
let env: Env;
beforeEach(() => {
  state = createSqliteD1(["0004_users.sql", "0010_login_failures.sql", "0015_user_settings.sql"]);
  state.db.exec(`INSERT INTO users VALUES ('u1','t'); INSERT INTO user_identities VALUES ('u1','cloudflare_access','${ADMIN}','t'); INSERT INTO user_provider_accounts VALUES ('u1','duolingo','2000001','t');`);
  env = { DB: state.d1, IMPORT_TOKEN: "t", SESSION_SECRET: SECRET, ADMIN_EMAIL: ADMIN, ADMIN_PASSWORD_HASH: "x" } as unknown as Env;
});

const call = async (method: string, body?: unknown, headers: Record<string, string> = {}) =>
  worker.fetch(new Request(`${BASE}/api/me/settings`, { method, headers: { cookie: await cookie(), ...SAME, ...headers }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) }), env);
const stored = () => state.db.prepare("SELECT user_id, daily_goal_xp, updated_at FROM user_settings").all();

describe("daily goal over HTTP and D1", () => {
  it("shouldReturnNullGoalWhenNeverConfigured", async () => {
    const res = await call("GET");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, dailyGoalXp: null });
  });

  it("shouldPersistTheGoalForTheProviderUserAndServeItBack", async () => {
    expect((await call("PUT", { dailyGoalXp: 50 })).status).toBe(200);
    expect(stored()).toMatchObject([{ user_id: "2000001", daily_goal_xp: 50 }]);
    expect(await (await call("GET")).json()).toEqual({ ok: true, dailyGoalXp: 50 });
  });

  it("shouldNotRewriteTheRowWhenTheSameGoalIsSavedAgain", async () => {
    await call("PUT", { dailyGoalXp: 50 });
    const first = stored();
    await new Promise((r) => setTimeout(r, 5));
    await call("PUT", { dailyGoalXp: 50 });
    expect(stored()).toEqual(first);
  });

  it("shouldClearTheGoalWhenNull", async () => {
    await call("PUT", { dailyGoalXp: 50 });
    await call("PUT", { dailyGoalXp: null });
    expect(await (await call("GET")).json()).toEqual({ ok: true, dailyGoalXp: null });
  });

  it("shouldAnswer400WithStableCodeWhenTheDomainRejectsTheGoal", async () => {
    const res = await call("PUT", { dailyGoalXp: 0 });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, code: "INVALID_DAILY_GOAL" });
    expect(stored()).toEqual([]);
  });

  it.each([[{ dailyGoalXp: "50" }], [{}], ["{nope"]])("shouldAnswer400InvalidCommandWhenTheBodyIsMalformed %#", async (body) => {
    const res = await call("PUT", body);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, code: "INVALID_COMMAND" });
  });

  it("shouldAnswer404WhenTheOwnerHasNoProviderAccount", async () => {
    state.db.exec("DELETE FROM user_provider_accounts");
    const res = await call("PUT", { dailyGoalXp: 50 });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("shouldRequireTheOwnerSessionAndRefuseTheImportToken", async () => {
    const noSession = await worker.fetch(new Request(`${BASE}/api/me/settings`, { method: "PUT", headers: SAME, body: JSON.stringify({ dailyGoalXp: 5 }) }), env);
    expect(noSession.status).toBe(401);
    const tokenOnly = await worker.fetch(new Request(`${BASE}/api/me/settings`, { method: "PUT", headers: { authorization: "Bearer t", ...SAME }, body: JSON.stringify({ dailyGoalXp: 5 }) }), env);
    expect(tokenOnly.status).toBe(401);
    expect((await worker.fetch(new Request(`${BASE}/api/me/settings`), env)).status).toBe(401);
  });

  it("shouldRefuseCrossSiteWrites", async () => {
    expect((await call("PUT", { dailyGoalXp: 5 }, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect(stored()).toEqual([]);
  });
});
