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

// What Changed, trajectory and sync use the same timeout as every other read, and a request that expires after a newer one started changes nothing.
const hang = (init: any) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(abortError())));
const changesBody = { interval: { since: "2026-10-01T00:00:00.000Z", until: "2026-10-08T00:00:00.000Z" },
  chess: { gamesCount: 3, intervalWinRate: 50, historicalDelta: null },
  languages: { xpGained: 5, sessionsCount: 1, totalSessionMinutes: null, baselineCourseId: null, currentCourseId: "X", courseChanged: false },
  streak: { baselineStreak: null, currentStreak: null, streakDelta: null, status: "active" }, findings: [], evaluations: [] };
// timers[i] fires the abort of the i-th request after boot
const manualTimers = (rt: any) => { const timers: Array<() => void> = []; rt.sandbox.setTimeout = (fn: () => void) => timers.push(fn); return timers; };

describe("timeouts on What Changed, trajectory and sync", () => {
  it("shouldShowTheConnectionErrorWhenWhatChangedNeverAnswers", async () => {
    const rt = createDashboardRuntime("/overview", undefined, fetchOnly(["/api/what-changed"], (_u, init) => hang(init)));
    await settle();
    const timers = manualTimers(rt);
    const run = vm.runInContext("fetchWhatChanged(new Date(Date.now()-86400000).toISOString())", rt.sandbox);
    await settle();
    timers.forEach((f) => f());
    await run;
    expect(rt.getEl("#changesEmpty").textContent).toBe("Error de conexión al cargar cambios.");
  });

  it("shouldKeepTheLaterWindowWhenAnEarlierRequestTimesOutAfterIt", async () => {
    let n = 0;
    const rt = createDashboardRuntime("/overview", undefined, fetchOnly(["/api/what-changed"], (_u, init) => (n++ === 0 ? hang(init) : Promise.resolve(ok(changesBody)))));
    await settle();
    n = 0;
    const timers = manualTimers(rt);
    const since = "new Date(Date.now()-86400000).toISOString()";
    const first = vm.runInContext(`fetchWhatChanged(${since})`, rt.sandbox);
    await settle();
    await vm.runInContext(`fetchWhatChanged(${since})`, rt.sandbox);
    const shown = rt.getEl("#changesActivity").innerHTML;
    expect(shown).not.toBe("");
    timers.forEach((f) => f());
    await first;
    expect(rt.getEl("#changesActivity").innerHTML).toBe(shown);
    expect(rt.getEl("#changesEmpty").textContent).not.toContain("Error");
  });

  it("shouldKeepTheLaterTrajectoryWhenAnEarlierOneAnswersLast", async () => {
    const slow = deferred<unknown>();
    let n = 0;
    const finding = { type: "CHESS_COLOR_ASYMMETRY_LONGITUDINAL", sample: { gamesCount: 10 }, metrics: { dominantColor: "white", globalWhiteWinRate: 60, globalBlackWinRate: 40 } };
    const rt = createDashboardRuntime("/overview", undefined, fetchOnly(["/api/trajectory"], async () =>
      n++ === 0 ? slow.promise : ok({ evaluations: [], temporalSpan: null, findings: [] })));
    await settle();
    n = 0;
    const first = vm.runInContext("fetchTrajectory()", rt.sandbox);
    await settle();
    await vm.runInContext("fetchTrajectory()", rt.sandbox);
    slow.resolve(ok({ evaluations: [], temporalSpan: null, findings: [finding] }));
    await first;
    expect(rt.getEl("#trajectoryFindings").innerHTML).toBe("");
  });

  it("shouldGiveUpPollingSyncAfterThreeStatusRequestsThatNeverAnswer", async () => {
    const rt = createDashboardRuntime("/overview", undefined, fetchOnly(["/api/me/sync/status"], (_u, init) => hang(init)));
    await settle();
    const timers = manualTimers(rt);
    const run = vm.runInContext("trackSync('r1')", rt.sandbox);
    for (let i = 0; i < 6; i++) { await settle(); timers.splice(0).forEach((f) => f()); } // each expiry, then the wait before the next poll
    const outcome = await Promise.race([run.then(() => "done"), settle().then(() => "hung")]);
    expect(outcome).toBe("done");
  });
});
