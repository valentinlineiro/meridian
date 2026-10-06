import { describe, it, expect, beforeAll } from "vitest";
import worker from "../src/index.ts";
import type { Env } from "../src/types.ts";
import { createHmacSessionCodec } from "../src/infrastructure/auth/hmacSessionCodec.ts";
import { createSqliteD1 } from "./helpers/sqliteD1.ts";

const SECRET = "x".repeat(48);
const ADMIN = "owner@example.com";
const BASE = "https://stats.example.com"; // not localhost: no dev shortcuts apply
const SAME = { "sec-fetch-site": "same-origin" };

const codec = createHmacSessionCodec(SECRET)!;
const nowSec = () => Math.floor(Date.now() / 1000);
const cookieFor = async (claims = { sub: ADMIN, exp: nowSec() + 600 }, c = codec) => `__Host-session=${await c.sign(claims)}`;

let d1: D1Database;
beforeAll(() => { d1 = createSqliteD1(["0004_users.sql", "0010_login_failures.sql"]).d1; });

const env = (over: Partial<Env> = {}): Env =>
  ({ DB: d1, IMPORT_TOKEN: "secret", SESSION_SECRET: SECRET, ADMIN_EMAIL: ADMIN, ADMIN_PASSWORD_HASH: "x", ...over }) as unknown as Env;
const call = (method: string, path: string, headers: Record<string, string> = {}, e = env()) =>
  worker.fetch(new Request(BASE + path, { method, headers, redirect: "manual", body: ["GET", "HEAD"].includes(method) ? undefined : "{}" }), e);

const HTML_READS = ["/", "/index.html", "/overview", "/chess", "/languages", "/languages/it", "/changes", "/trajectory", "/raw"];
const API_READS = [
  "/api/stats/summary", "/api/stats/recent", "/api/stats/lang", "/api/languages", "/api/languages/xp", "/api/languages/analytics",
  "/api/languages/courses", "/api/languages/courses/X", "/api/matches", "/api/snapshots", "/api/snapshots/abc?raw=1",
  "/api/what-changed", "/api/trajectory", "/api/chess/matches/m1/detail", "/api/me/stats/lang", "/api/me/sync/status",
  "/api/some/route/nobody/wrote", "/anything-else",
];
const USER_READS = [...HTML_READS, ...API_READS];
const MACHINE_READS = ["/api/chess/matches/pending-details"];
const WRITES = ["/api/import", "/api/snapshot", "/api/chess/matches/m1/detail", "/api/unknown-write", "/unknown-write"];

const denied = (res: Response, path: string) =>
  !path.startsWith("/api/") ? res.status === 303 && res.headers.get("location")!.startsWith("/login?next=") : res.status === 401;

describe("access policy (table-driven over the audit matrix)", () => {
  describe.each(USER_READS)("user read GET %s", (path) => {
    it("shouldBeDeniedWithoutASession", async () => expect(denied(await call("GET", path), path)).toBe(true));
    it("shouldBeDeniedWhenOnlyImportTokenIsPresented", async () => {
      expect(denied(await call("GET", path, { authorization: "Bearer secret" }), path)).toBe(true);
    });
    it("shouldIgnoreAccessStyleIdentityHeaders", async () => {
      const h = { "cf-access-authenticated-user-email": ADMIN, "cf-access-jwt-assertion": "x", "x-debug-email": ADMIN };
      expect(denied(await call("GET", path, h), path)).toBe(true);
    });
    it("shouldPassTheGateWithAValidOwnerSession", async () => {
      const res = await call("GET", path, { cookie: await cookieFor() });
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(303);
    });
  });

  describe.each(USER_READS)("HEAD %s follows the same gate", (path) => {
    it("shouldBeDeniedWithoutASession", async () => expect(denied(await call("HEAD", path), path)).toBe(true));
    it("shouldPassWithAValidOwnerSession", async () => {
      const res = await call("HEAD", path, { cookie: await cookieFor() });
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(303);
    });
  });

  describe("session rejections", () => {
    const attempt = async (cookie: string, e = env()) => denied(await call("GET", "/api/stats/summary", { cookie }, e), "/api/stats/summary");
    it("shouldRejectExpiredSession", async () => expect(await attempt(await cookieFor({ sub: ADMIN, exp: nowSec() - 1 }))).toBe(true));
    it("shouldRejectAnotherSubject", async () => expect(await attempt(await cookieFor({ sub: "stranger@example.com", exp: nowSec() + 600 }))).toBe(true));
    it("shouldRejectCookieSignedWithAnotherSecret", async () => {
      expect(await attempt(await cookieFor(undefined, createHmacSessionCodec("y".repeat(48))!))).toBe(true);
    });
    it("shouldRejectTamperedCookie", async () => expect(await attempt((await cookieFor()) + "x")).toBe(true));
    it("shouldRejectGarbageCookie", async () => expect(await attempt("__Host-session=not.a.token")).toBe(true));
    it("shouldIgnoreACookieWithoutTheHostPrefix", async () => {
      expect(await attempt(`session=${await codec.sign({ sub: ADMIN, exp: nowSec() + 600 })}`)).toBe(true);
    });
    it("shouldAcceptOwnerEmailCaseInsensitively", async () => {
      const res = await call("GET", "/api/stats/summary", { cookie: await cookieFor() }, env({ ADMIN_EMAIL: "OWNER@example.com" }));
      expect(res.status).not.toBe(401);
    });
  });

  describe.each(MACHINE_READS)("machine read GET %s", (path) => {
    it("shouldReturn401WithoutToken", async () => expect((await call("GET", path)).status).toBe(401));
    it("shouldReturn401WithAnOwnerSessionButNoToken", async () => {
      expect((await call("GET", path, { cookie: await cookieFor() })).status).toBe(401);
    });
    it("shouldPassTheGateWithImportToken", async () => {
      expect((await call("GET", path, { authorization: "Bearer secret" })).status).not.toBe(401);
    });
    it("shouldRequireImportTokenOnHeadToo", async () => {
      expect((await call("HEAD", path)).status).toBe(401);
      expect((await call("HEAD", path, { authorization: "Bearer secret" })).status).not.toBe(401);
    });
  });

  describe.each(WRITES)("write POST %s", (path) => {
    it("shouldReturn401WithoutToken", async () => expect((await call("POST", path)).status).toBe(401));
    it("shouldReturn401WithAnOwnerSessionButNoToken", async () => {
      expect((await call("POST", path, { cookie: await cookieFor(), ...SAME })).status).toBe(401);
    });
    it("shouldPassTheGateWithImportToken", async () => {
      expect((await call("POST", path, { authorization: "Bearer secret" })).status).not.toBe(401);
    });
  });

  describe.each(["/api/me/sync", "/logout"])("identity write POST %s", (path) => {
    it("shouldReturn401WithoutASession", async () => expect((await call("POST", path, SAME)).status).toBe(401));
    it("shouldReturn401WithImportTokenOnly", async () => {
      expect((await call("POST", path, { authorization: "Bearer secret", ...SAME })).status).toBe(401);
    });
    it("shouldRefuseCrossSiteRequestsEvenWithAValidSession", async () => {
      const res = await call("POST", path, { cookie: await cookieFor(), "sec-fetch-site": "cross-site" });
      expect(res.status).toBe(403);
    });
    it("shouldRefuseRequestsWithoutAnyOriginSignal", async () => {
      expect((await call("POST", path, { cookie: await cookieFor() })).status).toBe(403);
    });
    it("shouldAcceptOriginHeaderMatchingOurHostWhenSecFetchSiteIsAbsent", async () => {
      const res = await call("POST", path, { cookie: await cookieFor(), origin: BASE });
      expect(res.status).not.toBe(403);
    });
    it("shouldRefuseAForeignOriginHeader", async () => {
      expect((await call("POST", path, { cookie: await cookieFor(), origin: "https://evil.example" })).status).toBe(403);
    });
  });

  it("shouldReachTheMeSyncHandlerWithASameOriginOwnerSession", async () => {
    const res = await call("POST", "/api/me/sync", { cookie: await cookieFor(), ...SAME });
    expect(res.status).toBe(404); // identity ok, but no provider account in the empty test DB
    expect(((await res.json()) as any).code).toBe("NO_PROVIDER_ACCOUNT");
  });

  it("shouldClearTheSessionCookieOnLogout", async () => {
    const res = await call("POST", "/logout", { cookie: await cookieFor(), ...SAME });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/login");
    expect(res.headers.get("set-cookie")).toMatch(/^__Host-session=; .*Max-Age=0/);
  });

  describe("fail closed on configuration", () => {
    it.each(["SESSION_SECRET", "ADMIN_EMAIL"] as const)("shouldDenyEverythingWhenMissing %s", async (k) => {
      const res = await call("GET", "/api/stats/summary", { cookie: await cookieFor() }, env({ [k]: undefined }));
      expect(res.status).toBe(401);
    });
    it("shouldDenyWhenTheSecretIsTooShortEvenIfTheCookieIsSignedWithIt", async () => {
      const weak = "short";
      const cookie = `__Host-session=${Buffer.from(JSON.stringify({ sub: ADMIN, exp: nowSec() + 600 })).toString("base64url")}.AAAA`;
      expect((await call("GET", "/api/stats/summary", { cookie }, env({ SESSION_SECRET: weak }))).status).toBe(401);
    });
    it("shouldDenyMachineRoutesWhenImportTokenIsMissing", async () => {
      expect((await call("GET", "/api/chess/matches/pending-details", { authorization: "Bearer x" }, env({ IMPORT_TOKEN: undefined }))).status).toBe(401);
    });
    it.each(["1", "true"])("shouldIgnoreAnyLegacyBypassVariable (%s)", async (v) => {
      const e = { ...env(), ACCESS_DEV_BYPASS: v } as unknown as Env;
      expect(denied(await call("GET", "/api/stats/summary", { "x-debug-email": ADMIN }, e), "/api/stats/summary")).toBe(true);
    });
  });

  it("shouldNotAnswerPreflights", async () => {
    const res = await call("OPTIONS", "/api/stats/summary", { origin: "https://evil.example" });
    expect(res.status).toBe(401);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("shouldKeepLoginPageAndOnlyItPublic", async () => {
    expect((await call("GET", "/login")).status).toBe(200);
    expect((await call("HEAD", "/login")).status).toBe(200);
    expect((await call("GET", "/login/extra")).status).toBe(303);
  });

  describe("dev entry (src/dev.ts)", () => {
    it("shouldRefuseNonLoopbackHostsEvenIfDeployedByMistake", async () => {
      const dev = (await import("../src/dev.ts")).default;
      expect((await dev.fetch(new Request(BASE + "/api/stats/summary"), env())).status).toBe(403);
    });
    it("shouldGrantIdentityOnLoopbackOnly", async () => {
      const dev = (await import("../src/dev.ts")).default;
      expect((await dev.fetch(new Request("http://127.0.0.1:8787/api/stats/summary"), env())).status).not.toBe(401);
    });
  });
});
