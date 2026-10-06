// src/api/router.ts
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { Context } from "hono";
import type { Env } from "../types.ts";
import { handleImport, json } from "./import.ts";
import { handleStats, handleLangStats, handleMatches, handleSnapshots } from "./stats.ts";
import { handleMeStats, handleMeSync, handleMeSyncStatus } from "./me.ts";
import { handleSaveMatchDetail, handleGetMatchDetail, handleGetPendingMatchDetails } from "./chessDetail.ts";
import { handleGetLanguages, handleGetLanguageCourse, handleGetLanguageXp } from "./languages.ts";
import { handleGetLanguagesAnalytics } from "./languagesAnalytics.ts";
import { mapErrorToResponse, mapError } from "./errors.ts";
import { importPayloadSchema, envSchema, whatChangedQuerySchema, trajectoryQuerySchema } from "./schemas.ts";
import { createD1WhatChangedAdapter } from "../infrastructure/d1/d1WhatChangedAdapter.ts";
import { getWhatChangedUseCase } from "../application/getWhatChangedUseCase.ts";
import { loginUseCase, authenticateSession } from "../application/authUseCase.ts";
import { createHmacSessionCodec } from "../infrastructure/auth/hmacSessionCodec.ts";
import { isWellFormedHash, pbkdf2PasswordVerifier } from "../infrastructure/auth/pbkdf2PasswordVerifier.ts";
import { createD1LoginThrottle } from "../infrastructure/d1/d1LoginThrottleAdapter.ts";
import { InvalidCredentialsError, TooManyAttemptsError } from "../application/errors.ts";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, isSameOrigin, loginPage, redirect, safeNext, sessionCookie } from "./login.ts";
import { createD1TrajectoryAdapter } from "../infrastructure/d1/d1TrajectoryAdapter.ts";
import { getTrajectoryUseCase } from "../application/getTrajectoryUseCase.ts";
import { DASHBOARD_HTML, RAW_HTML } from "../frontend.ts";

type AppEnv = { Bindings: Env; Variables: { email: string | null } };
export const app = new Hono<AppEnv>();


// No CORS on purpose: the dashboard is same-origin and every other client is a non-browser ingest client.
// Without CORS headers browsers refuse cross-origin reads, and a preflight (OPTIONS) is just an unauthenticated
// write-class request, so the policy below answers it 401.

app.use("*", async (c, next) => {
  envSchema.parse(c.env);
  await next();
});

// ── Access policy: ONE place decides who may call what; anything not listed is closed. ──
//   GET|HEAD /login, POST /login                -> public (the login itself; POST is same-origin + throttled)
//   write (not GET/HEAD)                        -> IMPORT_TOKEN (machine)        [except identity writes below]
//   machine read (pending-details)              -> IMPORT_TOKEN
//   POST /api/me/sync, POST /logout             -> owner session + same-origin (CSRF)
//   everything else, incl. HTML + unknown       -> owner session cookie (HTML -> redirect to /login, API -> 401)
// Identity is a signed session cookie issued by /login for ADMIN_EMAIL; nothing else is trusted.
const MACHINE_READ = new Set(["/api/chess/matches/pending-details"]);
const IDENTITY_WRITE = new Set(["/api/me/sync", "/logout"]);

const sha256 = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

// hash both sides to equal length, then compare without early exit
const tokenMatches = async (given: string, expected: string): Promise<boolean> => {
  const [a, b] = await Promise.all([sha256(given), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
};

const hasImportToken = async (c: Context<AppEnv>): Promise<boolean> => {
  const given = /^Bearer (.+)$/i.exec(c.req.header("Authorization") ?? "")?.[1];
  // fail closed: a missing IMPORT_TOKEN secret must never leave anything open
  return !!c.env.IMPORT_TOKEN && !!given && (await tokenMatches(given, c.env.IMPORT_TOKEN));
};

const sessionIdentity = async (c: Context<AppEnv>): Promise<string | null> => {
  // Seam for composition only (src/dev.ts, tests): an outer app may establish the identity in code.
  // It cannot be reached from a request or from configuration, so production (src/index.ts) never has it.
  const preset = c.get("email");
  if (preset) return preset;
  const { SESSION_SECRET, ADMIN_EMAIL } = c.env;
  const codec = SESSION_SECRET ? createHmacSessionCodec(SESSION_SECRET) : null;
  if (!codec || !ADMIN_EMAIL) return null; // fail closed on missing/weak configuration
  return authenticateSession(codec, getCookie(c, SESSION_COOKIE), ADMIN_EMAIL, Date.now());
};

const isHtmlPath = (path: string) => !path.startsWith("/api/");

app.use("*", async (c, next) => {
  const url = new URL(c.req.url);
  const path = url.pathname;
  const isRead = c.req.method === "GET" || c.req.method === "HEAD";

  if (path === "/login" && (isRead || c.req.method === "POST")) {
    c.set("email", null);
    return next();
  }

  const machine = isRead ? MACHINE_READ.has(path) : !IDENTITY_WRITE.has(path);
  if (machine) {
    if (!(await hasImportToken(c))) return json({ ok: false, error: "unauthorized" }, 401);
    c.set("email", null);
    return next();
  }

  const email = await sessionIdentity(c);
  if (!email) {
    if (isRead && isHtmlPath(path)) return redirect(`/login?next=${encodeURIComponent(path + url.search)}`);
    return json({ ok: false, error: "unauthorized", code: "UNAUTHORIZED" }, 401);
  }
  if (!isRead && !c.get("email") && !isSameOrigin(c.req.raw)) return json({ ok: false, error: "cross-origin request refused" }, 403);
  c.set("email", email);
  return next();
});

const emailOf = (c: Context<AppEnv>): string | null => c.get("email");

app.get("/login", (c) => loginPage(safeNext(c.req.query("next"))));

app.post("/login", async (c) => {
  const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
  const next = safeNext(typeof form.next === "string" ? form.next : null);
  const { ADMIN_EMAIL, SESSION_SECRET } = c.env;
  const ADMIN_PASSWORD_HASH = c.env.ADMIN_PASSWORD_HASH?.trim();
  const sessions = SESSION_SECRET ? createHmacSessionCodec(SESSION_SECRET) : null;
  if (!isSameOrigin(c.req.raw)) return loginPage(next, "Petición no permitida.", 403);
  // a malformed hash is a configuration error: report it without consuming a login attempt
  if (!sessions || !ADMIN_EMAIL || !ADMIN_PASSWORD_HASH || !isWellFormedHash(ADMIN_PASSWORD_HASH)) return loginPage(next, "Acceso no configurado.", 503);
  try {
    const token = await loginUseCase(
      { passwords: pbkdf2PasswordVerifier, sessions, throttle: createD1LoginThrottle(c.env.DB) },
      {
        email: typeof form.email === "string" ? form.email : "",
        password: typeof form.password === "string" ? form.password : "",
        adminEmail: ADMIN_EMAIL,
        passwordHash: ADMIN_PASSWORD_HASH,
        nowMs: Date.now(),
        ttlSeconds: SESSION_TTL_SECONDS,
      },
    );
    return redirect(next, sessionCookie(token));
  } catch (e) {
    if (e instanceof TooManyAttemptsError) {
      const r = loginPage(next, "Demasiados intentos. Prueba de nuevo en unos minutos.", 429);
      r.headers.set("retry-after", "900");
      return r;
    }
    if (e instanceof InvalidCredentialsError) return loginPage(next, "Email o contraseña incorrectos.", 401);
    throw e;
  }
});

app.post("/logout", () => redirect("/login", sessionCookie("", 0)));

const importRoute = async (c: Context<AppEnv>) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return json({ ok: false, error: "invalid json body" }, 400);
  }
  const parsed = importPayloadSchema.safeParse(body);
  if (!parsed.success) return json({ ok: false, error: "invalid import payload" }, 400);
  return handleImport(c.env.DB, parsed.data);
};

app.post("/api/import", importRoute);
app.post("/api/snapshot", importRoute);

app.get("/api/languages", (c) => handleGetLanguages(c.env.DB, new URL(c.req.url)));
app.get("/api/languages/courses", (c) => handleGetLanguages(c.env.DB, new URL(c.req.url)));
app.get("/api/languages/xp", (c) => handleGetLanguageXp(c.env.DB, new URL(c.req.url)));
app.get("/api/languages/analytics", (c) => handleGetLanguagesAnalytics(c.env.DB, new URL(c.req.url)));
app.get("/api/languages/courses/:courseId", (c) =>
  handleGetLanguageCourse(c.env.DB, c.req.param("courseId"), new URL(c.req.url)));

app.get("/api/me/stats/lang", (c) => handleMeStats(c.env.DB, new URL(c.req.url), emailOf(c)));
app.post("/api/me/sync", (c) =>
  handleMeSync(c.env.DB, emailOf(c), fetch, c.env.GITHUB_ACTIONS_TOKEN ?? null, c.env.COLLECTOR_REPO ?? null));
app.get("/api/me/sync/status", (c) =>
  handleMeSyncStatus(c.env.DB, emailOf(c), new URL(c.req.url), fetch, c.env.GITHUB_ACTIONS_TOKEN ?? null, c.env.COLLECTOR_REPO ?? null));

app.get("/api/stats/lang", (c) => handleLangStats(c.env.DB, new URL(c.req.url)));
app.get("/api/stats/*", (c) => {
  const url = new URL(c.req.url);
  return handleStats(c.env.DB, url.pathname.split("/").pop()!, url);
});

app.get("/api/chess/matches/pending-details", (c) => handleGetPendingMatchDetails(c.env.DB, c.req.raw));
app.post("/api/chess/matches/:id/detail", (c) =>
  handleSaveMatchDetail(c.env.DB, c.req.raw, c.req.param("id")));
app.get("/api/chess/matches/:id/detail", (c) => handleGetMatchDetail(c.env.DB, c.req.param("id")));

app.get("/api/matches", (c) => handleMatches(c.env.DB, new URL(c.req.url)));
app.get("/api/snapshots", (c) => handleSnapshots(c.env.DB, new URL(c.req.url), null));
app.get("/api/snapshots/:id", (c) => handleSnapshots(c.env.DB, new URL(c.req.url), c.req.param("id")));

app.get("/api/what-changed", async (c) => {
  const parsed = whatChangedQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    const err = parsed.error.issues[0]?.message ?? "invalid query parameters";
    return c.json({ ok: false, error: err }, 400);
  }
  const { since, until, userId } = parsed.data;
  const nowIso = new Date().toISOString();
  const effectiveUntil = until ? new Date(until).toISOString() : nowIso;
  const effectiveSince = since
    ? new Date(since).toISOString()
    : new Date(new Date(effectiveUntil).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  if (new Date(effectiveSince) >= new Date(effectiveUntil)) {
    return c.json({ ok: false, error: "since must be strictly before until" }, 400);
  }

  const adapter = createD1WhatChangedAdapter(c.env.DB);
  try {
    const result = await getWhatChangedUseCase(adapter, {
      since: effectiveSince,
      until: effectiveUntil,
      userId: userId ?? null,
    });
    return c.json(result, 200);
  } catch (err: unknown) {
    return mapError(c, err);
  }
});

app.get("/api/trajectory", async (c) => {
  const parsed = trajectoryQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    const err = parsed.error.issues[0]?.message ?? "invalid query parameters";
    return c.json({ ok: false, error: err }, 400);
  }

  const adapter = createD1TrajectoryAdapter(c.env.DB);
  try {
    const result = await getTrajectoryUseCase(adapter, {
      userId: parsed.data.userId,
    });
    return c.json(result, 200);
  } catch (err: unknown) {
    return mapError(c, err);
  }
});

const dashboard = () =>
  new Response(DASHBOARD_HTML, { headers: { "content-type": "text/html" } });
app.get("/", dashboard);
app.get("/index.html", dashboard);
app.get("/overview", dashboard);
app.get("/overview/", dashboard);
app.get("/chess", dashboard);
app.get("/chess/", dashboard);
app.get("/languages", dashboard);
app.get("/languages/", dashboard);
app.get("/languages/*", dashboard);
app.get("/changes", dashboard);
app.get("/trajectory", dashboard);
app.get("/raw", () => new Response(RAW_HTML, { headers: { "content-type": "text/html" } }));

// exported so composition wrappers (src/dev.ts, tests) keep identical error/404 behaviour
export const onFailure = (e: Error) => {
  const mapped = mapErrorToResponse(e);
  if (mapped) return mapped;
  return json({ ok: false, error: "internal error" }, 500);
};
export const onNotFound = () => json({ ok: false, error: "not found" }, 404);

app.onError(onFailure);
app.notFound(onNotFound);
