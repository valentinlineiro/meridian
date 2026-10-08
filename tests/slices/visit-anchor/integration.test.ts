import { describe, it, expect, beforeEach } from "vitest";
import worker from "../../../src/index.ts";
import type { Env } from "../../../src/types.ts";
import { createHmacSessionCodec } from "../../../src/infrastructure/auth/hmacSessionCodec.ts";
import { D1SeenThroughRepository } from "../../../src/slices/visit-anchor/infrastructure/D1SeenThroughRepository.ts";
import { SeenThrough } from "../../../src/slices/visit-anchor/domain/SeenThrough.ts";
import { createSqliteD1 } from "../../helpers/sqliteD1.ts";

const SECRET = "x".repeat(48), ADMIN = "owner@example.com", BASE = "https://stats.example.com";
const SAME = { "sec-fetch-site": "same-origin", "content-type": "application/json" };
const cookie = async () => `__Host-session=${await createHmacSessionCodec(SECRET)!.sign({ sub: ADMIN, exp: Math.floor(Date.now() / 1000) + 600 })}`;
const past = (ms: number) => new Date(Date.now() - ms).toISOString();

let state: ReturnType<typeof createSqliteD1>;
let env: Env;
beforeEach(() => {
  state = createSqliteD1(["0004_users.sql", "0010_login_failures.sql", "0016_user_view_state.sql"]);
  state.db.exec(`INSERT INTO users VALUES ('u1','t'); INSERT INTO user_identities VALUES ('u1','cloudflare_access','${ADMIN}','t'); INSERT INTO user_provider_accounts VALUES ('u1','duolingo','2000001','t');`);
  env = { DB: state.d1, IMPORT_TOKEN: "t", SESSION_SECRET: SECRET, ADMIN_EMAIL: ADMIN, ADMIN_PASSWORD_HASH: "x" } as unknown as Env;
});

const call = async (method: string, body?: unknown, headers: Record<string, string> = {}) =>
  worker.fetch(new Request(`${BASE}/api/me/changes-anchor`, { method, headers: { cookie: await cookie(), ...SAME, ...headers }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) }), env);
const stored = () => state.db.prepare("SELECT user_id, changes_seen_through FROM user_view_state").all();

describe("visit anchor over HTTP and D1", () => {
  it("shouldReturnNullWhenNeverMarked", async () => {
    const res = await call("GET");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, seenThrough: null });
  });

  it("shouldNotWriteWhenReadingNorCreateARowOnGet", async () => {
    await call("GET");
    await call("GET");
    expect(stored()).toEqual([]);
  });

  it("shouldPersistTheInstantForTheProviderUserAndServeItBack", async () => {
    const t = past(3 * 864e5);
    const put = await call("PUT", { seenThrough: t });
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ ok: true, seenThrough: t });
    expect(stored()).toMatchObject([{ user_id: "2000001", changes_seen_through: t }]);
    expect(await (await call("GET")).json()).toEqual({ ok: true, seenThrough: t });
  });

  it("shouldAnswerTheValueInForceWhenAnOlderInstantIsSentAndNotMoveBackwards", async () => {
    const newer = past(1 * 864e5), older = past(5 * 864e5);
    await call("PUT", { seenThrough: newer });
    const res = await call("PUT", { seenThrough: older });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, seenThrough: newer });
    expect(stored()).toMatchObject([{ changes_seen_through: newer }]);
  });

  it("shouldAdvanceWhenALaterInstantIsSent", async () => {
    await call("PUT", { seenThrough: past(5 * 864e5) });
    const later = past(1 * 864e5);
    expect(await (await call("PUT", { seenThrough: later })).json()).toEqual({ ok: true, seenThrough: later });
  });

  it("shouldAnswer400WithStableCodeWhenTheInstantIsInTheFuture", async () => {
    const res = await call("PUT", { seenThrough: "2999-01-01T00:00:00.000Z" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, code: "INVALID_SEEN_THROUGH" });
    expect(stored()).toEqual([]);
  });

  it("shouldAnswer400WithStableCodeWhenTheInstantIsNotAnInstant", async () => {
    const res = await call("PUT", { seenThrough: "yesterday" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "INVALID_SEEN_THROUGH" });
  });

  it.each([[{ seenThrough: 5 }], [{}], ["{nope"]])("shouldAnswer400InvalidCommandWhenTheBodyIsMalformed %#", async (body) => {
    const res = await call("PUT", body);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, code: "INVALID_COMMAND" });
  });

  it("shouldAnswer404WhenTheOwnerHasNoProviderAccount", async () => {
    state.db.exec("DELETE FROM user_provider_accounts");
    expect((await call("GET")).status).toBe(404);
    expect((await call("PUT", { seenThrough: past(1000) })).status).toBe(404);
  });

  it("shouldRequireTheOwnerSessionAndRefuseTheImportToken", async () => {
    const noSession = await worker.fetch(new Request(`${BASE}/api/me/changes-anchor`, { method: "PUT", headers: SAME, body: JSON.stringify({ seenThrough: past(1000) }) }), env);
    expect(noSession.status).toBe(401);
    const tokenOnly = await worker.fetch(new Request(`${BASE}/api/me/changes-anchor`, { method: "PUT", headers: { authorization: "Bearer t", ...SAME }, body: JSON.stringify({ seenThrough: past(1000) }) }), env);
    expect(tokenOnly.status).toBe(401);
    expect((await worker.fetch(new Request(`${BASE}/api/me/changes-anchor`), env)).status).toBe(401);
  });

  it("shouldRefuseCrossSiteWrites", async () => {
    expect((await call("PUT", { seenThrough: past(1000) }, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect(stored()).toEqual([]);
  });
});

describe("D1SeenThroughRepository guard", () => {
  it("shouldNeverMoveBackwardsEvenWhenAnOlderWriteArrivesAfterTheCheck", async () => {
    // the use case checks then writes; two devices can interleave, so the SQL itself must refuse to regress
    const repo = new D1SeenThroughRepository(state.d1);
    const now = new Date();
    const newer = SeenThrough.of(past(1 * 864e5), now), older = SeenThrough.of(past(5 * 864e5), now);
    await repo.advance("2000001", newer, "t1");
    await repo.advance("2000001", older, "t2");
    expect((await repo.find("2000001"))?.iso).toBe(newer.iso);
    expect(state.db.prepare("SELECT updated_at FROM user_view_state").all()).toEqual([{ updated_at: "t1" }]);
  });
});
