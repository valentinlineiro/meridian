import { describe, it, expect } from "vitest";
import { analyze } from "../scripts/analyzeThreats.ts";
import { handleGetPendingThreats, handlePostMateThreats } from "../src/api/chessDetail.ts";
import { createSqliteD1 } from "./helpers/sqliteD1.ts";

const WORKER = "https://worker.example";
const SCHOLAR_LOSS = ["e2e4", "e7e5", "f1c4", "b8c6", "d1h5", "g8f6", "h5f7"]; // black misses Qxf7#
const item = (id: string, color: string | null, moves: unknown) => ({ match_id: id, user_color: color, move_history: typeof moves === "string" ? moves : JSON.stringify(moves) });

// A queue-backed fake of the two machine routes: a posted game leaves the queue.
function fakeWorker(initial: ReturnType<typeof item>[], opts: { postStatus?: (id: string) => number; pendingStatus?: number } = {}) {
  const queue = [...initial]; const posts: { id: string; body: any }[] = []; let gets = 0;
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    if (u.pathname === "/api/chess/matches/pending-threats") {
      gets++;
      if (opts.pendingStatus) return new Response("{}", { status: opts.pendingStatus });
      const limit = Number(u.searchParams.get("limit"));
      return new Response(JSON.stringify({ ok: true, items: queue.slice(0, limit), totalPending: queue.length }), { status: 200 });
    }
    const id = decodeURIComponent(u.pathname.split("/")[4]!);
    const status = opts.postStatus?.(id) ?? 200;
    if (status === 200) { posts.push({ id, body: JSON.parse(String(init!.body)) }); queue.splice(queue.findIndex((q) => q.match_id === id), 1); }
    return new Response("{}", { status });
  }) as unknown as typeof fetch;
  return { fetch: fakeFetch, queue, posts, gets: () => gets };
}
const run = (w: ReturnType<typeof fakeWorker>, over: Partial<Parameters<typeof analyze>[0]> = {}) =>
  analyze({ fetch: w.fetch, worker: WORKER, importToken: "t", sleep: async () => {}, ...over });

describe("analyze", () => {
  it("shouldChainBatchesUntilNothingIsPending", async () => {
    const w = fakeWorker(Array.from({ length: 5 }, (_, i) => item(`g${i}`, "black", SCHOLAR_LOSS)));
    const m = await run(w, { limit: 2 });
    expect(m).toMatchObject({ ok: 5, invalid: 0, failed: 0, remaining: 0, aborted: null });
    expect(m.batches).toBe(3);
    expect(w.queue).toHaveLength(0);
  });

  it("shouldPostTheResultOfTheAnalysisWithoutAVersion", async () => {
    const w = fakeWorker([item("g1", "Black", SCHOLAR_LOSS)]);
    await run(w);
    expect(w.posts[0]!.body).toMatchObject({ status: "ok", faced: 1, missed: 1, missedPlies: [6] });
    expect(w.posts[0]!.body).not.toHaveProperty("v");
  });

  it("shouldStopBetweenGamesWhenTheBudgetIsSpent", async () => {
    let t = 0;
    const w = fakeWorker(Array.from({ length: 5 }, (_, i) => item(`g${i}`, "black", SCHOLAR_LOSS)));
    const m = await run(w, { limit: 100, budgetMs: 2500, now: () => (t += 1000) });
    expect(m.ok).toBeGreaterThan(0);
    expect(m.ok).toBeLessThan(5);
    expect(m.aborted).toBeNull();
    expect(m.remaining).toBe(5 - m.ok);
    expect(w.queue).toHaveLength(5 - m.ok);
  });

  it("shouldPostAnInvalidMarkerWhenTheHistoryIsIllegalOrCorrupt", async () => {
    const w = fakeWorker([item("illegal", "white", ["e2e5"]), item("corrupt", "white", "{not json"), item("shape", "white", { a: 1 })]);
    const m = await run(w);
    expect(m).toMatchObject({ ok: 0, invalid: 3, failed: 0 });
    const byId = Object.fromEntries(w.posts.map((p) => [p.id, p.body]));
    expect(byId.illegal).toEqual({ status: "invalid", reason: "illegal_game" });
    expect(byId.corrupt).toEqual({ status: "invalid", reason: "corrupt_game" });
    expect(byId.shape).toEqual({ status: "invalid", reason: "corrupt_game" });
  });

  it("shouldContinueAfterAFailedPostAndCountIt", async () => {
    const w = fakeWorker([item("bad", "black", SCHOLAR_LOSS), item("good", "black", SCHOLAR_LOSS)], { postStatus: (id) => (id === "bad" ? 500 : 200) });
    const m = await run(w, { limit: 100 });
    expect(m).toMatchObject({ ok: 1, failed: 2 }); // the failed game is attempted again in the next batch, which then makes no progress
    expect(m.aborted).toBe("no progress: every game of a batch failed");
  });

  it("shouldStopWhenABatchMakesNoProgressInsteadOfLooping", async () => {
    const w = fakeWorker([item("a", "black", SCHOLAR_LOSS), item("b", "black", SCHOLAR_LOSS)], { postStatus: () => 500 });
    const m = await run(w);
    expect(m.aborted).toBe("no progress: every game of a batch failed");
    expect(w.gets()).toBe(1);
  });

  it("shouldAbortOn401WithoutRetrying", async () => {
    const posted = fakeWorker([item("a", "black", SCHOLAR_LOSS), item("b", "black", SCHOLAR_LOSS)], { postStatus: () => 401 });
    const m = await run(posted);
    expect(m.aborted).toBe("worker rejected IMPORT_TOKEN (401)");
    expect(m.failed).toBe(0);
    const get401 = await run(fakeWorker([], { pendingStatus: 401 }));
    expect(get401.aborted).toBe("worker rejected IMPORT_TOKEN (401)");
  });

  it("shouldAbortWithoutRetryingWhenThePendingRouteAnswersAFunctionalError", async () => {
    const w = fakeWorker([], { pendingStatus: 404 });
    expect((await run(w)).aborted).toBe("pending-threats 404");
    expect(w.gets()).toBe(1);
  });

  it("shouldCapTheBatchAtOneHundred", async () => {
    const w = fakeWorker([]);
    const seen: string[] = [];
    const spy = (async (url: string, init?: RequestInit) => { seen.push(url); return w.fetch(url, init); }) as unknown as typeof fetch;
    await analyze({ fetch: spy, worker: WORKER, importToken: "t", limit: 5000 });
    expect(seen[0]).toContain("limit=100");
  });

  it("shouldNeverLogIdsMovesOrPerGameCounts", async () => {
    const logs: string[] = [];
    const w = fakeWorker([item("secret-id-1", "black", SCHOLAR_LOSS), item("secret-id-2", "white", ["e2e5"])], { postStatus: (id) => (id === "secret-id-2" ? 500 : 200) });
    await run(w, { log: (s) => logs.push(s) });
    const text = logs.join("\n");
    expect(text).not.toContain("secret-id");
    expect(text).not.toContain("e2e4");
  });

  it("shouldSendTheBearerTokenOnEveryCall", async () => {
    const auth: (string | null)[] = [];
    const w = fakeWorker([item("g", "black", SCHOLAR_LOSS)]);
    const spy = (async (url: string, init?: RequestInit) => { auth.push(new Headers(init?.headers).get("authorization")); return w.fetch(url, init); }) as unknown as typeof fetch;
    await analyze({ fetch: spy, worker: WORKER, importToken: "tok", limit: 10 });
    expect(auth.length).toBeGreaterThan(1);
    expect(auth.every((a) => a === "Bearer tok")).toBe(true);
  });

  it("shouldFillAllPendingGamesAgainstTheRealRoutes", async () => {
    const { db, d1 } = createSqliteD1(["0001_init.sql", "0005_played_at.sql", "0006_match_details.sql", "0007_openings_and_phases.sql", "0017_opening_family_mate_type.sql", "0018_mate_threats.sql"]);
    const add = (id: string, color: string, moves: string[], at: number) => {
      db.prepare("INSERT INTO matches (match_id, user_id, snapshot_id, first_seen_at, last_seen_at, raw_json, played_at, result, user_color) VALUES (?, 'u1', 's', 'd', 'd', '{}', ?, 'loss', ?)").run(id, at, color);
      db.prepare("INSERT INTO match_details (match_id, user_id, status, move_history, move_timestamps, ply_count) VALUES (?, 'u1', 'c', ?, '[]', ?)").run(id, JSON.stringify(moves), moves.length);
    };
    add("a", "black", SCHOLAR_LOSS, 3); add("b", "black", ["e2e5"], 2); add("c", "white", ["e2e4", "e7e5"], 1);
    const real = (async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      return u.pathname.endsWith("/pending-threats")
        ? handleGetPendingThreats(d1, new Request(url))
        : handlePostMateThreats(d1, new Request(url, { method: "POST", body: init!.body as string }), decodeURIComponent(u.pathname.split("/")[4]!));
    }) as unknown as typeof fetch;
    const m = await analyze({ fetch: real, worker: WORKER, importToken: "t", limit: 2 });
    expect(m).toMatchObject({ ok: 2, invalid: 1, failed: 0, remaining: 0, aborted: null });
    const rows = db.prepare("SELECT match_id, mate_threats FROM match_details ORDER BY match_id").all().map((r: any) => [r.match_id, JSON.parse(r.mate_threats)]);
    expect(rows[0]).toEqual(["a", expect.objectContaining({ v: 1, status: "ok", missed: 1, missedPlies: [6] })]);
    expect(rows[1]).toEqual(["b", { v: 1, status: "invalid", reason: "illegal_game" }]);
    expect(rows[2]).toEqual(["c", expect.objectContaining({ v: 1, status: "ok", faced: 0 })]);
  });

  describe("transport failures", () => {
    const noWait = { sleep: async () => {} };
    // wraps a worker so chosen calls fail first: kind "throw" is a connection error, a number is an HTTP status
    const flaky = (w: ReturnType<typeof fakeWorker>, plan: (url: string, call: number) => "throw" | number | null) => {
      const calls = new Map<string, number>(); const log: string[] = [];
      const fetch = (async (url: string, init?: RequestInit) => {
        const key = (init?.method ?? "GET") + " " + (url.includes("pending-threats") ? "pending" : "post");
        const n = (calls.get(key) ?? 0) + 1; calls.set(key, n); log.push(key);
        const f = plan(url, n);
        if (f === "throw") throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
        if (typeof f === "number") return new Response("{}", { status: f });
        return w.fetch(url, init);
      }) as unknown as typeof globalThis.fetch;
      return { fetch, log };
    };

    it("shouldRetryAConnectionErrorOnTheQueueReadAndCarryOn", async () => {
      const w = fakeWorker([item("g", "black", SCHOLAR_LOSS)]);
      const f = flaky(w, (url, n) => (url.includes("pending-threats") && n === 1 ? "throw" : null));
      const m = await analyze({ fetch: f.fetch, worker: WORKER, importToken: "t", ...noWait });
      expect(m).toMatchObject({ ok: 1, aborted: null });
    });

    it("shouldRetryAServerErrorOnAPostAndStoreTheResult", async () => {
      const w = fakeWorker([item("g", "black", SCHOLAR_LOSS)]);
      const f = flaky(w, (url, n) => (!url.includes("pending-threats") && n <= 2 ? 503 : null));
      const m = await analyze({ fetch: f.fetch, worker: WORKER, importToken: "t", ...noWait });
      expect(m).toMatchObject({ ok: 1, failed: 0 });
      expect(w.posts).toHaveLength(1); // retried requests are replacements, never duplicates
    });

    it("shouldNotRetryAFunctionalError", async () => {
      const w = fakeWorker([item("g", "black", SCHOLAR_LOSS)]);
      const f = flaky(w, (url) => (!url.includes("pending-threats") ? 422 : null));
      const m = await analyze({ fetch: f.fetch, worker: WORKER, importToken: "t", ...noWait });
      expect(f.log.filter((l) => l === "POST post")).toHaveLength(1);
      expect(m.failed).toBe(1);
    });

    it("shouldBackOffProgressively", async () => {
      const waits: number[] = [];
      const w = fakeWorker([]);
      const f = flaky(w, (url, n) => (url.includes("pending-threats") && n <= 3 ? "throw" : null));
      await analyze({ fetch: f.fetch, worker: WORKER, importToken: "t", sleep: async (ms) => { waits.push(ms); } });
      expect(waits).toEqual([1000, 2000, 4000]);
    });

    it("shouldGiveUpAfterFourAttemptsWithAOneLineReason", async () => {
      const w = fakeWorker([]);
      const down = flaky(w, () => "throw");
      const m = await analyze({ fetch: down.fetch, worker: WORKER, importToken: "t", ...noWait });
      expect(down.log).toHaveLength(4);
      expect(m.aborted).toBe("pending-threats unreachable after 4 attempts");
      const err5 = flaky(fakeWorker([]), () => 502);
      expect((await analyze({ fetch: err5.fetch, worker: WORKER, importToken: "t", ...noWait })).aborted).toBe("pending-threats 502 after 4 attempts");
    });

    it("shouldCountAPostThatNeverGetsThroughAsFailedAndKeepGoing", async () => {
      const w = fakeWorker([item("bad", "black", SCHOLAR_LOSS), item("good", "black", SCHOLAR_LOSS)]);
      let postCalls = 0;
      const f = flaky(w, (url) => { if (url.includes("pending-threats")) return null; postCalls++; return postCalls <= 4 ? "throw" : null; });
      const m = await analyze({ fetch: f.fetch, worker: WORKER, importToken: "t", ...noWait, limit: 100 });
      expect(m.ok).toBeGreaterThanOrEqual(1);
      expect(m.failed).toBeGreaterThanOrEqual(1);
    });

    // undici reports every network failure as TypeError("fetch failed") with the system error in `cause`
    const netError = (code: string) => Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error(code), { code }) });
    const throwing = (err: unknown) => { let calls = 0; return { fetch: (async () => { calls++; throw err; }) as unknown as typeof globalThis.fetch, calls: () => calls }; };

    it.each(["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE", "EAI_AGAIN", "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT"])("shouldRetryTheTransientTransportFailure_%s", async (code) => {
      const t = throwing(netError(code));
      const m = await analyze({ fetch: t.fetch, worker: WORKER, importToken: "t", ...noWait });
      expect(t.calls()).toBe(4);
      expect(m.aborted).toBe("pending-threats unreachable after 4 attempts");
    });

    it.each([
      ["anAbort", Object.assign(new Error("aborted"), { name: "AbortError" })],
      ["aTimeoutSignal", Object.assign(new Error("timed out"), { name: "TimeoutError" })],
      ["anUnexpectedError", new Error("boom")],
      ["anInvalidUrl", new TypeError("Invalid URL")],
      ["aCertificateFailure", netError("UNABLE_TO_VERIFY_LEAF_SIGNATURE")],
      ["aMissingHost", netError("ENOTFOUND")],
      ["aFetchFailureWithoutAReason", new TypeError("fetch failed")],
    ])("shouldNotRetryAndShouldSurface_%s", async (_n, err) => {
      const t = throwing(err);
      await expect(analyze({ fetch: t.fetch, worker: WORKER, importToken: "t", ...noWait })).rejects.toBe(err);
      expect(t.calls()).toBe(1);
    });

    it("shouldNotRetryAnUnexpectedErrorOnAPostEither", async () => {
      const w = fakeWorker([item("g", "black", SCHOLAR_LOSS)]);
      const boom = new Error("boom"); let posts = 0;
      const f = flaky(w, (url) => { if (url.includes("pending-threats")) return null; posts++; throw boom; });
      await expect(analyze({ fetch: f.fetch, worker: WORKER, importToken: "t", ...noWait })).rejects.toBe(boom);
      expect(posts).toBe(1);
    });

    it("shouldStillAbortOn401WithoutRetrying", async () => {
      const w = fakeWorker([], { pendingStatus: 401 });
      const f = flaky(w, () => null);
      const m = await analyze({ fetch: f.fetch, worker: WORKER, importToken: "t", ...noWait });
      expect(m.aborted).toBe("worker rejected IMPORT_TOKEN (401)");
      expect(f.log).toHaveLength(1);
    });

    it("shouldNotLogIdsWhileRetrying", async () => {
      const logs: string[] = [];
      const w = fakeWorker([item("secret-id", "black", SCHOLAR_LOSS)]);
      const f = flaky(w, (url, n) => (!url.includes("pending-threats") && n <= 1 ? "throw" : null));
      await analyze({ fetch: f.fetch, worker: WORKER, importToken: "t", ...noWait, log: (s) => logs.push(s) });
      expect(logs.join("\n")).not.toContain("secret-id");
    });
  });
});
