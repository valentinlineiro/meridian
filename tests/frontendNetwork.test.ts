import { describe, it, expect } from "vitest";
import vm from "node:vm";
import { createDashboardRuntime, emptyAccountPayload, fetchOnly } from "./helpers/dom.ts";

// A request that never answers or answers late must neither hang the page nor overwrite what the owner chose later.
const settle = async () => { for (let i = 0; i < 300; i++) await Promise.resolve(); };
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const abortError = () => Object.assign(new Error("aborted"), { name: "AbortError" });
const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };

describe("request timeout", () => {
  it("shouldRejectWhenTheServerNeverAnswers", async () => {
    const rt = createDashboardRuntime("/overview", undefined, (url, init) =>
      init?.signal ? new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(abortError()))) : new Promise(() => {}));
    rt.sandbox.setTimeout = (fn: () => void) => { Promise.resolve().then(fn); return 0; };
    const outcome = await Promise.race([
      vm.runInContext("j('/api/x')", rt.sandbox).then(() => "ok", () => "rejected"),
      settle().then(() => "hung"),
    ]);
    expect(outcome).toBe("rejected");
  });

  it("shouldNotAskEachRouteAgainWhenTheBundleTimedOut", async () => {
    const urls: string[] = [];
    const rt = createDashboardRuntime("/chess", undefined, async (url: string) => {
      urls.push(url);
      if (url.startsWith("/api/stats/bundle")) throw abortError();
      return ok(emptyAccountPayload(url));
    });
    await settle();
    rt.errors.length = 0; // the essential summary is gone, so the Chess tab logs its own failure: expected here
    expect(urls.filter((u) => /^\/api\/stats\/(summary|results|color|opponents|opponent-elo|timeline|recent)/.test(u))).toHaveLength(0);
  });
});

describe("late responses never overwrite a later choice", () => {
  it("shouldShowTheLaterMatchesPageWhenAnEarlierOneAnswersLast", async () => {
    const slow = deferred<unknown>();
    let afterBoot = 0; // the page's own boot asks first; the test's two calls are the next ones
    const rt = createDashboardRuntime("/chess", undefined, fetchOnly(["/api/matches"], async () => {
      const k = afterBoot++;
      return k === 0 ? slow.promise : k === 1 ? ok({ rows: [{}], total: 3 }) : ok({ rows: [], total: 0 });
    }));
    await settle();
    afterBoot = 0;
    const first = vm.runInContext("loadM(0)", rt.sandbox);
    await settle();
    await vm.runInContext("loadM(50)", rt.sandbox);
    slow.resolve(ok({ rows: [{}], total: 7 }));
    await first;
    expect(rt.getEl("#mc").textContent).toContain("de 3");
  });

  it("shouldShowTheLaterRecentWindowWhenAnEarlierOneAnswersLast", async () => {
    const slow = deferred<unknown>();
    const win = (limit: number, wins: number) => ok({ limit, games: 10, wins, losses: 10 - wins, draws: 0, winRate: wins / 10, before: null });
    const rt = createDashboardRuntime("/chess", undefined, fetchOnly(["/api/stats/recent"], async (url: string) =>
      url.includes("limit=20") ? slow.promise : win(100, 9)));
    await settle();
    const first = rt.sandbox.setRecent(20);
    await rt.sandbox.setRecent(100);
    slow.resolve(win(20, 2));
    await first;
    expect(rt.getEl("#chessHeroDistMeta").textContent).toBe("9W · 1L · 0D");
  });
});
