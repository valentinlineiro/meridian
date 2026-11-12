import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./helpers/adminWorker.ts";
import { onFailure } from "../src/api/router.ts";
import type { Env } from "../src/types.ts";

// Repeated reloads of Ajedrez exhausted D1 ("too many resources consumed within a 10 second window"): the read-only stats
// may be kept by the browser for a short while, and an overloaded D1 must answer 503 + Retry-After, not an opaque 500.
const stmt = () => ({ bind: () => stmt(), all: async () => ({ results: [] }), first: async () => null });
const okEnv = { DB: { prepare: () => stmt() } } as unknown as Env;
const get = (path: string, env: Env = okEnv) => worker.fetch(new Request(`http://localhost${path}`), env);
const OVERLOAD = "D1_ERROR: D1 DB is overloaded. Too many resources consumed within a 10 second window.";

describe("short private cache for the read-only stats", () => {
  it("shouldKeepASuccessfulStatsReadPrivatelyFor30SecondsPerCookie", async () => {
    const res = await get("/api/stats/timeline");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, max-age=30");
    expect(res.headers.get("vary")).toContain("Cookie");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("shouldKeepTheMatchListToo", async () => {
    expect((await get("/api/matches?limit=10&offset=0")).headers.get("cache-control")).toBe("private, max-age=30");
  });

  it("shouldNeverCacheAFailedStatsRead", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = { DB: { prepare: () => { throw new Error("boom"); } } } as unknown as Env;
    const res = await get("/api/stats/timeline", boom);
    expect(res.status).toBe(500);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it.each(["/api/me/linkedin-games", "/api/languages", "/api/does-not-exist"])("shouldStillNeverCache %s", async (path) => {
    expect((await get(path)).headers.get("cache-control")).toBe("no-store");
  });
});

describe("D1 overload", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shouldAnswer503WithRetryAfterAndALogWhenD1IsOverloaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = onFailure(new Error(OVERLOAD));
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("10");
    expect(await res.json()).toEqual({ ok: false, error: "temporarily overloaded", code: "D1_OVERLOADED" });
    expect(JSON.parse(String((console.error as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0]))).toMatchObject({ event: "internal_error", message: OVERLOAD });
  });

  it("shouldKeepAnyOtherUnmappedErrorAsAnOpaque500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = onFailure(new Error("something else"));
    expect(res.status).toBe(500);
    expect(res.headers.get("retry-after")).toBeNull();
  });

  it("shouldTurnAnOverloadInsideARouteInto503EndToEnd", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const overloaded = { DB: { prepare: () => { throw new Error(OVERLOAD); } } } as unknown as Env;
    const res = await get("/api/stats/timeline", overloaded);
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("10");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
