import { describe, it, expect, beforeEach, vi } from "vitest";
import worker from "./helpers/adminWorker.ts";
import { setupTestDb } from "./helpers/testDb.ts";
import type { Env } from "../src/types.ts";
import { requestSyncUseCase, getSyncStatusUseCase } from "../src/application/syncUseCases.ts";
import { NotFoundError, SyncAlreadyRunningError, SyncUnavailableError } from "../src/application/errors.ts";
import { createGithubActionsTrigger } from "../src/infrastructure/github/githubActionsTrigger.ts";
import type { CollectorTriggerPort } from "../src/ports/collectorTriggerPort.ts";


// GitHub as seen by the worker: nothing queued or running, and a dispatch creates run 42.
const idleCollector = () => async (url: string, init?: RequestInit) =>
  init?.method === "POST" ? new Response(null, { status: 204 })
    : String(url).includes("status=") ? new Response(JSON.stringify({ workflow_runs: [] }))
    : new Response(JSON.stringify({ workflow_runs: [{ id: 42, created_at: new Date(Date.now() + 1000).toISOString() }] }));

const OWNER = "valen@example.com"; // identity used by the admin test worker
const fakeTrigger = (over: Partial<CollectorTriggerPort> = {}): CollectorTriggerPort => ({
  activeRun: async () => null,
  start: async () => ({ runId: 777 }),
  status: async (runId) => ({ runId, status: "completed", conclusion: "success", htmlUrl: "https://example.test/runs/777" }),
  ...over,
});
const accounts = (id: string | null) => ({ resolveProviderUserId: async () => id });

describe("sync use cases", () => {
  it("shouldStartTheCollectorAndReturnTheRunWhenOwnerHasAnAccount", async () => {
    expect(await requestSyncUseCase({ accounts: accounts("acct-1"), trigger: fakeTrigger() }, { email: OWNER }))
      .toEqual({ providerUserId: "acct-1", runId: 777 });
  });

  it("shouldRejectWhenOwnerHasNoProviderAccount", async () => {
    const start = vi.fn();
    await expect(requestSyncUseCase({ accounts: accounts(null), trigger: fakeTrigger({ start }) }, { email: OWNER })).rejects.toThrow(NotFoundError);
    expect(start).not.toHaveBeenCalled();
  });

  it("shouldRefuseToStartWhileAnotherRunIsActive", async () => {
    const start = vi.fn();
    const trigger = fakeTrigger({ activeRun: async () => ({ runId: 555 }), start });
    const err = await requestSyncUseCase({ accounts: accounts("acct-1"), trigger }, { email: OWNER }).catch((e) => e);
    expect(err).toBeInstanceOf(SyncAlreadyRunningError);
    expect(err.runId).toBe(555);
    expect(start).not.toHaveBeenCalled();
  });

  it("shouldReportRunStatusTogetherWithTheAccount", async () => {
    expect(await getSyncStatusUseCase({ accounts: accounts("acct-1"), trigger: fakeTrigger() }, { email: OWNER, runId: 777 }))
      .toMatchObject({ providerUserId: "acct-1", runId: 777, status: "completed", conclusion: "success" });
  });
});

describe("github actions trigger", () => {
  const T0 = Date.parse("2026-10-02T12:00:00Z");
  const cfg = (fetcher: typeof fetch) => ({ repo: "owner/collector-repo", workflow: "collector.yml", ref: "main", token: "t", fetcher, sleep: async () => {}, now: () => T0 });
  const res = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it("shouldDispatchThenPickTheRunCreatedAfterTheDispatch", async () => {
    const calls: string[] = [];
    const fetcher = (async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (init?.method === "POST") return new Response(null, { status: 204 });
      return res({ workflow_runs: [{ id: 1, created_at: "2026-10-02T11:00:00Z" }, { id: 2, created_at: "2026-10-02T12:00:01Z" }] });
    }) as unknown as typeof fetch;
    expect(await createGithubActionsTrigger(cfg(fetcher)).start()).toEqual({ runId: 2 });
    expect(calls[0]).toBe("POST https://api.github.com/repos/owner/collector-repo/actions/workflows/collector.yml/dispatches");
  });

  it("shouldRetryUntilTheRunAppears", async () => {
    let polls = 0;
    const fetcher = (async (_u: string, init?: RequestInit) => {
      if (init?.method === "POST") return new Response(null, { status: 204 });
      polls++;
      return res({ workflow_runs: polls < 3 ? [] : [{ id: 9, created_at: "2026-10-02T12:00:02Z" }] });
    }) as unknown as typeof fetch;
    expect(await createGithubActionsTrigger(cfg(fetcher)).start()).toEqual({ runId: 9 });
    expect(polls).toBe(3);
  });

  it("shouldFailWhenDispatchIsRejected", async () => {
    const fetcher = (async () => new Response("no", { status: 403 })) as unknown as typeof fetch;
    await expect(createGithubActionsTrigger(cfg(fetcher)).start()).rejects.toThrow(SyncUnavailableError);
  });

  it("shouldFailWhenTheRunNeverAppears", async () => {
    const fetcher = (async (_u: string, init?: RequestInit) =>
      init?.method === "POST" ? new Response(null, { status: 204 }) : res({ workflow_runs: [] })) as unknown as typeof fetch;
    await expect(createGithubActionsTrigger(cfg(fetcher)).start()).rejects.toThrow("workflow run not found");
  });

  it("shouldReportTheRunThatIsInProgressOrQueued", async () => {
    const seen: string[] = [];
    const fetcher = (async (url: string) => {
      seen.push(url.split("?")[1] ?? "");
      return res({ workflow_runs: url.includes("status=queued") ? [{ id: 31 }] : [] });
    }) as unknown as typeof fetch;
    expect(await createGithubActionsTrigger(cfg(fetcher)).activeRun()).toEqual({ runId: 31 });
    expect(seen).toEqual(["status=in_progress&per_page=1", "status=queued&per_page=1"]);
  });

  it("shouldReportNoActiveRunWhenNothingIsQueuedOrRunning", async () => {
    const fetcher = (async () => res({ workflow_runs: [] })) as unknown as typeof fetch;
    expect(await createGithubActionsTrigger(cfg(fetcher)).activeRun()).toBeNull();
  });

  it("shouldMapRunStatus", async () => {
    const fetcher = (async () => res({ id: 5, status: "in_progress", conclusion: null, html_url: "https://example.test/r/5" })) as unknown as typeof fetch;
    expect(await createGithubActionsTrigger(cfg(fetcher)).status(5))
      .toEqual({ runId: 5, status: "in_progress", conclusion: null, htmlUrl: "https://example.test/r/5" });
  });
});

describe("sync endpoints", () => {
  let env: Env;
  const call = (method: string, path: string) => worker.fetch(new Request(`http://localhost${path}`, { method }), env);
  const seedOwner = (db: any) => {
    db.prepare("INSERT INTO users (id, created_at) VALUES ('u1', '2026-01-01T00:00:00Z')").run();
    db.prepare("INSERT INTO user_identities (user_id, provider, subject, created_at) VALUES ('u1', 'cloudflare_access', ?, '2026-01-01T00:00:00Z')").run(OWNER);
    db.prepare("INSERT INTO user_provider_accounts (user_id, provider, provider_user_id, created_at) VALUES ('u1', 'duolingo', 'acct-1', '2026-01-01T00:00:00Z')").run();
  };

  beforeEach(() => {
    const t = setupTestDb();
    seedOwner(t.db);
    env = { DB: t.d1, GITHUB_ACTIONS_TOKEN: "token", SYNC_REPO: "acme/collector", SYNC_WORKFLOW: "collector.yml", SYNC_REF: "ops" } as unknown as Env;
    vi.unstubAllGlobals();
  });

  it("shouldReportSyncNotConfiguredWhenTheTargetIsMissing", async () => {
    env = { ...env, SYNC_REPO: undefined } as Env;
    const r = await call("POST", "/api/me/sync");
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ ok: false, code: "SYNC_NOT_CONFIGURED" });
  });

  it("shouldReportMissingTokenWhenNotConfigured", async () => {
    env = { ...env, GITHUB_ACTIONS_TOKEN: undefined } as Env;
    const r = await call("POST", "/api/me/sync");
    expect(r.status).toBe(500);
    expect(await r.json()).toMatchObject({ ok: false, error: "GITHUB_ACTIONS_TOKEN not set" });
  });

  it("shouldRequireARunIdWhenAskingForStatus", async () => {
    expect((await call("GET", "/api/me/sync/status")).status).toBe(400);
  });

  it("shouldDispatchTheCollectorAndReturnTheRunId", async () => {
    vi.stubGlobal("fetch", idleCollector());
    const r = await call("POST", "/api/me/sync");
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, providerUserId: "acct-1", runId: 42 });
  });

  it("shouldCheckAndDispatchTheCollectorWorkflowOfMeridianPrivateOnItsOperationalBranch", async () => {
    const seen: { url: string; method: string; body?: string }[] = [];
    const inner = idleCollector();
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      seen.push({ url: String(url), method: init?.method ?? "GET", body: init?.body as string | undefined });
      return inner(url, init);
    });
    expect((await call("POST", "/api/me/sync")).status).toBe(200);
    const base = "https://api.github.com/repos/acme/collector/actions/workflows/collector.yml/";
    expect(seen.length).toBeGreaterThan(0);
    for (const c of seen) expect(c.url.startsWith(base)).toBe(true); // never the retired duolingo-stats repo
    const dispatch = seen.find((c) => c.method === "POST")!;
    expect(dispatch.url).toBe(base + "dispatches");
    expect(JSON.parse(dispatch.body!)).toEqual({ ref: "ops" });
  });

  it("shouldAnswer409WithTheActiveRunAndNotDispatchWhenACollectorIsRunning", async () => {
    const posts: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") posts.push(url);
      return new Response(JSON.stringify({ workflow_runs: String(url).includes("status=in_progress") ? [{ id: 99 }] : [] }));
    });
    const r = await call("POST", "/api/me/sync");
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ ok: false, code: "SYNC_IN_PROGRESS", runId: 99 });
    expect(posts).toEqual([]);
  });

  it("shouldMapAnUnavailableCollectorTo502", async () => {
    vi.stubGlobal("fetch", async () => new Response("denied", { status: 403 }));
    const r = await call("POST", "/api/me/sync");
    expect(r.status).toBe(502);
    expect(await r.json()).toMatchObject({ ok: false, code: "SYNC_UNAVAILABLE" });
  });

  it("shouldReturnRunStatusForTheOwner", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ id: 42, status: "completed", conclusion: "success", html_url: "https://example.test/r/42" })));
    const r = await call("GET", "/api/me/sync/status?runId=42");
    expect(await r.json()).toMatchObject({ ok: true, status: "completed", conclusion: "success", runId: 42, providerUserId: "acct-1" });
  });
});

// The access boundary itself: the real worker (no preset identity), same shape as accessPolicy.test.ts.
describe("sync endpoints behind the real access policy", () => {
  const SECRET = "x".repeat(48);
  const ADMIN = "owner@example.com";
  const BASE = "https://stats.example.com"; // not localhost: no dev shortcuts apply
  let real: typeof import("../src/index.ts").default;
  let env: Env;
  let cookie: string;
  const hit = (method: string, path: string, headers: Record<string, string> = {}) =>
    real.fetch(new Request(BASE + path, { method, headers, redirect: "manual" }), env);

  beforeEach(async () => {
    real = (await import("../src/index.ts")).default;
    const { createHmacSessionCodec } = await import("../src/infrastructure/auth/hmacSessionCodec.ts");
    const t = setupTestDb();
    t.db.prepare("INSERT INTO users (id, created_at) VALUES ('u1', '2026-01-01T00:00:00Z')").run();
    t.db.prepare("INSERT INTO user_identities (user_id, provider, subject, created_at) VALUES ('u1', 'cloudflare_access', ?, '2026-01-01T00:00:00Z')").run(ADMIN);
    t.db.prepare("INSERT INTO user_provider_accounts (user_id, provider, provider_user_id, created_at) VALUES ('u1', 'duolingo', 'acct-1', '2026-01-01T00:00:00Z')").run();
    env = { DB: t.d1, IMPORT_TOKEN: "machine", SESSION_SECRET: SECRET, ADMIN_EMAIL: ADMIN, ADMIN_PASSWORD_HASH: "x", GITHUB_ACTIONS_TOKEN: "token", SYNC_REPO: "acme/collector", SYNC_WORKFLOW: "collector.yml", SYNC_REF: "ops" } as unknown as Env;
    cookie = `__Host-session=${await createHmacSessionCodec(SECRET)!.sign({ sub: ADMIN, exp: Math.floor(Date.now() / 1000) + 600 })}`;
    vi.stubGlobal("fetch", idleCollector());
  });

  it("shouldDenyStartingASyncWithoutASession", async () => {
    expect((await hit("POST", "/api/me/sync", { "sec-fetch-site": "same-origin" })).status).toBe(401);
  });

  it("shouldDenyStartingASyncWithOnlyTheMachineImportToken", async () => {
    expect((await hit("POST", "/api/me/sync", { authorization: "Bearer machine", "sec-fetch-site": "same-origin" })).status).toBe(401);
  });

  it("shouldRefuseStartingASyncFromAnotherOrigin", async () => {
    const r = await hit("POST", "/api/me/sync", { cookie, "sec-fetch-site": "cross-site" });
    expect(r.status).toBe(403);
  });

  it("shouldStartASyncForTheSignedInOwnerFromTheSameOrigin", async () => {
    const r = await hit("POST", "/api/me/sync", { cookie, "sec-fetch-site": "same-origin" });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, runId: 42 });
  });

  it("shouldDenyReadingSyncStatusWithoutASession", async () => {
    expect((await hit("GET", "/api/me/sync/status?runId=42")).status).toBe(401);
  });

  it("shouldNeverEchoTheGithubTokenInResponses", async () => {
    vi.stubGlobal("fetch", async () => new Response("denied", { status: 401 }));
    const r = await hit("POST", "/api/me/sync", { cookie, "sec-fetch-site": "same-origin" });
    expect(await r.text()).not.toContain("token");
  });
});
