import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import worker from "../src/index.ts";
import type { Env } from "../src/types.ts";
import { hashPassword } from "../src/infrastructure/auth/pbkdf2PasswordVerifier.ts";
import { MAX_FAILURES } from "../src/infrastructure/d1/d1LoginThrottleAdapter.ts";
import { createSqliteD1 } from "./helpers/sqliteD1.ts";

const BASE = "https://stats.example.com";
const ADMIN = "owner@example.com";
const PASSWORD = "a long random password 123";
const SECRET = "z".repeat(48);

let hash: string;
let state: ReturnType<typeof createSqliteD1>;
let env: Env;
beforeAll(async () => { hash = await hashPassword(PASSWORD); });
beforeEach(() => {
  state = createSqliteD1(["0004_users.sql", "0010_login_failures.sql"]);
  env = { DB: state.d1, SESSION_SECRET: SECRET, ADMIN_EMAIL: ADMIN, ADMIN_PASSWORD_HASH: hash, IMPORT_TOKEN: "t" } as unknown as Env;
});

const login = (fields: Record<string, string>, headers: Record<string, string> = { "sec-fetch-site": "same-origin" }, e = env) =>
  worker.fetch(
    new Request(`${BASE}/login`, {
      method: "POST", redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
      body: new URLSearchParams(fields).toString(),
    }),
    e,
  );
const good = { email: ADMIN, password: PASSWORD };
const failures = () => (state.db.prepare("SELECT COUNT(*) AS n FROM login_failures").get() as { n: number }).n;

describe("login flow", () => {
  it("shouldServeTheLoginPageWithHardenedHeaders", async () => {
    const res = await worker.fetch(new Request(`${BASE}/login`), env);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("content-security-policy")).toContain("form-action 'self'");
    expect(await res.text()).toContain('type="password"');
  });

  it("shouldSetAHardenedSessionCookieAndRedirectWhenCredentialsAreValid", async () => {
    const res = await login({ ...good, next: "/chess" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/chess");
    const cookie = res.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^__Host-session=[\w-]+\.[\w-]+;/);
    for (const attr of ["Path=/", "HttpOnly", "Secure", "SameSite=Lax", "Max-Age=604800"]) expect(cookie).toContain(attr);
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it("shouldLetTheIssuedCookieOpenTheDashboard", async () => {
    const cookie = (await login(good)).headers.get("set-cookie")!.split(";")[0]!;
    const res = await worker.fetch(new Request(`${BASE}/api/me/stats/lang`, { headers: { cookie } }), env);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(303);
  });

  it("shouldRejectWithoutCookieWhenPasswordIsWrong", async () => {
    const res = await login({ ...good, password: "wrong wrong wrong" });
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await res.text()).toContain("incorrectos");
    expect(failures()).toBe(1); // the reserved attempt stays recorded
  });

  it("shouldRejectWhenEmailIsWrongEvenWithTheRightPassword", async () => {
    const res = await login({ ...good, email: "stranger@example.com" });
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("shouldLockAfterTooManyFailuresEvenForTheRightPassword", async () => {
    for (let i = 0; i < MAX_FAILURES; i++) await login({ ...good, password: "wrong wrong wrong" });
    const res = await login(good);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("900");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("shouldResetTheFailureCounterAfterASuccessfulLogin", async () => {
    await login({ ...good, password: "wrong wrong wrong" });
    expect(failures()).toBe(1);
    expect((await login(good)).status).toBe(303);
    expect(failures()).toBe(0);
  });

  it.each(["//evil.example", "/\\evil.example", "https://evil.example", "javascript:alert(1)", "", "/\t/evil.example", "/\n/evil.example", "/\r/evil.example", "/ /evil.example", "/\u0000x"])(
    "shouldNotRedirectOffSiteWhenNextIs %j", async (next) => {
      expect((await login({ ...good, next })).headers.get("location")).toBe("/");
    });

  it("shouldRefuseCrossSiteLoginPosts", async () => {
    const res = await login(good, { "sec-fetch-site": "cross-site" });
    expect(res.status).toBe(403);
    expect(failures()).toBe(0);
  });

  it("shouldKeepLegitimateInSitePathsInNext", async () => {
    expect((await login({ ...good, next: "/languages/it?tab=x" })).headers.get("location")).toBe("/languages/it?tab=x");
  });

  it("shouldReport503WithoutConsumingAnAttemptWhenTheStoredHashIsMalformed", async () => {
    const res = await login(good, undefined, { ...env, ADMIN_PASSWORD_HASH: "oops" } as Env);
    expect(res.status).toBe(503);
    expect(failures()).toBe(0);
  });

  it("shouldTolerateATrailingNewlineInTheStoredHash", async () => {
    expect((await login(good, undefined, { ...env, ADMIN_PASSWORD_HASH: hash + "\n" } as Env)).status).toBe(303);
  });

  it("shouldNotLetBurstsOfParallelGuessesExceedTheLimit", async () => {
    const results = await Promise.all(Array.from({ length: 40 }, () => login({ ...good, password: "wrong wrong wrong" })));
    expect(results.filter((r) => r.status === 401)).toHaveLength(MAX_FAILURES);
    expect(results.filter((r) => r.status === 429)).toHaveLength(40 - MAX_FAILURES);
  });

  it("shouldReport503WhenAuthIsNotConfigured", async () => {
    expect((await login(good, undefined, { ...env, ADMIN_PASSWORD_HASH: undefined } as Env)).status).toBe(503);
    expect((await login(good, undefined, { ...env, SESSION_SECRET: "short" } as Env)).status).toBe(503);
  });

  it("shouldEscapeTheNextValueInTheForm", async () => {
    const res = await worker.fetch(new Request(`${BASE}/login?next=${encodeURIComponent('/x"><script>alert(1)</script>')}`), env);
    expect(await res.text()).not.toContain("<script>alert(1)");
  });
});
