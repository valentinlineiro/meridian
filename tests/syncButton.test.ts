import { describe, it, expect, vi } from "vitest";
import { handleMeSync, handleMeSyncStatus } from "../src/api/me.ts";
const REPO = "owner/collector-repo";
const stubDb = (pid: string | null) => ({
  prepare: (sql: string) => {
    const first = async () => (pid ? { provider_user_id: pid } : null);
    const all = async () => ({ results: pid ? [{ provider_user_id: pid }] : [] });
    return { bind: () => ({ first, all }), first, all } as any;
  },
}) as any;
const stubDbNoSingle = {
  prepare: () => {
    const first = async () => null;
    const all = async () => ({ results: [] });
    return { bind: () => ({ first, all }), first, all } as any;
  },
} as any;

describe("POST /api/me/sync", () => {
  it("shouldDispatchWhenAuthenticated", async () => {
    const db = stubDb("18352137");
    let dispatched = false;
    const fakeFetch = async (url: string, init: any) => {
      if (url.includes("dispatches")) {
        expect(url).toBe("https://api.github.com/repos/owner/collector-repo/actions/workflows/collector.yml/dispatches");
        expect(init.body).toContain("18352137");
        expect(init.headers.Authorization).toBe("Bearer ghp_xxx");
        dispatched = true;
        return { ok: true, status: 204, text: async () => "" } as any;
      }
      // run correlation: return queued run
      return { ok: true, json: async () => ({ workflow_runs: [{ id: 123, status: "queued", conclusion: null, name: "collector", created_at: new Date().toISOString() }] }) } as any;
    };
    const res = await handleMeSync(db, "valen@example.com", fakeFetch as any, "ghp_xxx", REPO);
    const body: any = await res.json();
    expect(dispatched).toBe(true);
    expect(body.ok).toBe(true);
    expect(body.providerUserId).toBe("18352137");
    expect(body.runId).toBe(123);
  });
  it("shouldReturn401WhenNoEmail", async () => {
    const res = await handleMeSync(stubDbNoSingle as any, null, (async () => ({ ok: true } as any)) as any, "ghp_xxx", REPO);
    expect(res.status).toBe(401);
  });
  it("shouldNeverDispatchWhenNoEmailEvenIfSingleProviderExists", async () => {
    const fakeFetch = vi.fn(async () => ({ ok: true } as any));
    const res = await handleMeSync(stubDb("18352137"), null, fakeFetch as any, "ghp_xxx", REPO);
    expect(res.status).toBe(401);
    expect(fakeFetch).not.toHaveBeenCalled();
  });
  it("shouldReturn404WhenNoProviderAccount", async () => {
    const res = await handleMeSync(stubDb(null), "valen@example.com", (async () => ({ ok: true } as any)) as any, "ghp_xxx", REPO);
    expect(res.status).toBe(404);
  });
  it("shouldReturn500WhenTokenMissing", async () => {
    const res = await handleMeSync(stubDb("18352137"), "valen@example.com", (async () => ({ ok: true } as any)) as any, null, REPO);
    expect(res.status).toBe(500);
  });
  it("shouldReturn502WhenDispatchFails", async () => {
    const fakeFetch = async () => ({ ok: false, status: 401, text: async () => "bad" } as any);
    const res = await handleMeSync(stubDb("18352137"), "valen@example.com", fakeFetch as any, "ghp_xxx", REPO);
    expect(res.status).toBe(502);
  });
  it("shouldReturn502WhenRunNotFoundAfterDispatch", async () => {
    const fakeFetch = async (url: string) => {
      if (url.includes("dispatches")) return { ok: true, status: 204, text: async () => "" } as any;
      // runs exist but all before dispatchedAt → not after
      return { ok: true, json: async () => ({ workflow_runs: [{ id: 999, status: "completed", conclusion: "success", name: "collector", created_at: "2020-01-01T00:00:00Z" }] }) } as any;
    };
    const res = await handleMeSync(stubDb("18352137"), "valen@example.com", fakeFetch as any, "ghp_xxx", REPO);
    expect(res.status).toBe(502);
    expect((await res.json() as any).code).toBe("RUN_NOT_FOUND");
  });
});

describe("GET /api/me/sync/status", () => {
  const fakeRun = (status: string, conclusion: string | null, id = 123) => ({
    ok: true,
    json: async () => ({ id, status, conclusion, html_url: "https://x" }),
  } as any);
  it("shouldReturnQueuedWhenRunQueued", async () => {
    const res = await handleMeSyncStatus(stubDb("18352137"), "valen@example.com", new URL("http://x/api/me/sync/status?runId=123"), async () => fakeRun("queued", null), "ghp_xxx", REPO);
    expect(await res.json()).toMatchObject({ status: "queued", conclusion: null, runId: 123 });
  });
  it("shouldReturnInProgressWhenRunning", async () => {
    const res = await handleMeSyncStatus(stubDb("18352137"), "valen@example.com", new URL("http://x/api/me/sync/status?runId=123"), async () => fakeRun("in_progress", null), "ghp_xxx", REPO);
    expect((await res.json() as any).status).toBe("in_progress");
  });
  it.each(["success", "failure", "cancelled", "skipped"] as const)("shouldReturnCompletedWhenConclusionIs%s", async (conclusion) => {
    const res = await handleMeSyncStatus(stubDb("18352137"), "valen@example.com", new URL("http://x/api/me/sync/status?runId=123"), async () => fakeRun("completed", conclusion), "ghp_xxx", REPO);
    expect(await res.json()).toMatchObject({ status: "completed", conclusion });
  });
  it("shouldReturnUnknownWhenNoRuns", async () => {
    const fakeFetch = async () => ({ ok: true, json: async () => ({ workflow_runs: [] }) } as any);
    const res = await handleMeSyncStatus(stubDb("18352137"), "valen@example.com", new URL("http://x/api/me/sync/status"), fakeFetch as any, "ghp_xxx", REPO);
    expect((await res.json() as any).status).toBe("unknown");
  });
  it("shouldReturn401WhenNoEmail", async () => {
    expect((await handleMeSyncStatus(stubDbNoSingle as any, null, new URL("http://x/api/me/sync/status"), async () => ({ ok: true } as any), "ghp_xxx", REPO)).status).toBe(401);
  });
  it("shouldReturn404WhenNoProviderAccount", async () => {
    expect((await handleMeSyncStatus(stubDb(null), "valen@example.com", new URL("http://x/api/me/sync/status"), async () => ({ ok: true } as any), "ghp_xxx", REPO)).status).toBe(404);
  });
  it("shouldReturn500WhenTokenMissing", async () => {
    expect((await handleMeSyncStatus(stubDb("18352137"), "valen@example.com", new URL("http://x/api/me/sync/status"), async () => ({ ok: true } as any), null, REPO)).status).toBe(500);
  });
  it("shouldReturn502WhenGitHubFails", async () => {
    const fakeFetch = async () => ({ ok: false, status: 500, text: async () => "err" } as any);
    expect((await handleMeSyncStatus(stubDb("18352137"), "valen@example.com", new URL("http://x/api/me/sync/status?runId=123"), fakeFetch as any, "ghp_xxx", REPO)).status).toBe(502);
  });
  it("shouldReturn400WhenRunIdInvalid", async () => {
    expect((await handleMeSyncStatus(stubDb("18352137"), "valen@example.com", new URL("http://x/api/me/sync/status?runId=bad"), async () => ({ ok: true } as any), "ghp_xxx", REPO)).status).toBe(400);
  });
});

describe("collector repo configuration", () => {
  const never = (async () => { throw new Error("must not call GitHub"); }) as any;
  it.each([null, "", "no-slash", "a/b/c", "../x", "owner/repo?x=1"])("shouldRefuseToDispatchWhenCollectorRepoIs %s", async (repo) => {
    const res = await handleMeSync(stubDb("18352137"), "valen@example.com", never, "ghp_xxx", repo as any);
    expect(res.status).toBe(500);
    expect(((await res.json()) as any).error).toBe("COLLECTOR_REPO not set");
  });
  it("shouldRefuseToReadStatusWhenCollectorRepoIsNotSet", async () => {
    const res = await handleMeSyncStatus(stubDb("18352137"), "valen@example.com", new URL("http://x/api/me/sync/status"), never, "ghp_xxx", null);
    expect(res.status).toBe(500);
  });
});
