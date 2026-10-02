import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import worker from "./helpers/adminWorker.ts";
import { setupTestDb } from "./helpers/testDb.ts";
import type { Env } from "../src/types.ts";
import { demoChessSnapshot, demoLanguageSnapshots } from "../demo/demoData.ts";

// Journey: snapshot -> historical state -> change detection -> trajectory -> chess analytics, all on the invented demo dataset.
describe("demo dataset journey", () => {
  let env: Env;
  const post = async (body: unknown) => {
    const res = await worker.fetch(new Request("http://localhost/api/snapshot", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer demo-token" }, body: JSON.stringify(body) }), env);
    expect(res.status).toBe(200);
    return (await res.json()) as any;
  };
  const get = async (path: string) => (await worker.fetch(new Request(`http://localhost${path}`), env)).json() as Promise<any>;

  beforeAll(async () => {
    vi.useFakeTimers();
    env = { DB: setupTestDb().d1, IMPORT_TOKEN: "demo-token" } as unknown as Env;
    const [early, late] = demoLanguageSnapshots() as [ReturnType<typeof demoLanguageSnapshots>[number], ReturnType<typeof demoLanguageSnapshots>[number]];
    vi.setSystemTime(new Date(early.at)); await post(early.payload);
    vi.setSystemTime(new Date("2026-09-15T12:00:00Z")); await post(demoChessSnapshot(0, 40));
    vi.setSystemTime(new Date(late.at)); await post(late.payload);
    vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
  });
  afterAll(() => vi.useRealTimers());

  it("shouldDeduplicateMatchesWhenLaterSnapshotResendsHistory", async () => {
    const r = await post(demoChessSnapshot());
    expect(r).toMatchObject({ matchesReceived: 60, newMatches: 20, existingMatches: 40 });
  });

  it("shouldSummariseAllSixtyMatchesWithResultsSplit", async () => {
    const s = await get("/api/stats/summary");
    expect(s.games).toBe(60);
    expect(s.wins + s.losses + s.draws).toBe(60);
  });

  it("shouldDetectLanguageProgressBetweenTwoObservations", async () => {
    const w = await get("/api/what-changed?since=2026-09-10T12:00:00.000Z&until=2026-09-28T12:00:01.000Z");
    expect(w.streak).toMatchObject({ baselineStreak: 90, currentStreak: 108, streakDelta: 18 });
    expect(w.languages.xpGained).toBeGreaterThan(0);
    expect(w.findings.map((f: any) => f.id)).toContain("STREAK_MILESTONE");
  });

  it("shouldSpanTheObservedPeriodInTrajectory", async () => {
    const t = await get("/api/trajectory");
    expect(t.temporalSpan).toMatchObject({ startedAt: "2026-09-01T00:00:00.000Z", totalDays: 29 });
    expect(Array.isArray(t.findings)).toBe(true); // empty is a valid answer when the evidence is too thin
  });

  it("shouldKeepPerCourseHistoryFromBothSnapshots", async () => {
    const l = await get("/api/stats/lang");
    expect(l.courseProgressHistory.map((p: any) => p.path.completedUnits)).toEqual([12, 14]); // 4 + 6 + 2, then 4 + 6 + 4 completed units
  });
});
