import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";
const require = createRequire(import.meta.url);
const { DatabaseSync: SQLiteDatabase } = require("node:sqlite");
import { readFileSync } from "node:fs";
import { ingestSnapshot } from "../src/api/import.ts";
import { handleGetLanguagesAnalytics } from "../src/api/languagesAnalytics.ts";
import worker from "./helpers/adminWorker.ts";

function createTestD1(db: DatabaseSync): D1Database {
  const makeStatement = (sql: string, boundArgs: any[] = []) => ({
    bind(...newArgs: any[]) {
      return makeStatement(sql, newArgs);
    },
    all: async () => ({ results: db.prepare(sql).all(...boundArgs) }),
    first: async () => {
      const row = db.prepare(sql).get(...boundArgs);
      return row ?? null;
    },
    run: async () => {
      const res = db.prepare(sql).run(...boundArgs);
      return { meta: { changes: Number(res.changes) } };
    },
    _execute: () => db.prepare(sql).run(...boundArgs),
  });

  return {
    prepare(sql: string) {
      return makeStatement(sql);
    },
    async batch(stmts: any[]) {
      for (const s of stmts) {
        s._execute();
      }
      return stmts.map(() => ({ meta: { changes: 1 } }));
    },
  } as unknown as D1Database;
}

describe("Languages Analytics API (Contract v0.1)", () => {
  let rawDb: DatabaseSync;
  let d1: D1Database;

  beforeEach(() => {
    rawDb = new SQLiteDatabase(":memory:");
    const mig0001 = readFileSync(new URL("../migrations/0001_init.sql", import.meta.url).pathname, "utf8");
    const mig0004 = readFileSync(new URL("../migrations/0004_users.sql", import.meta.url).pathname, "utf8");
    const mig0008 = readFileSync(new URL("../migrations/0008_languages.sql", import.meta.url).pathname, "utf8");
    const mig0009 = readFileSync(new URL("../migrations/0009_course_sections_pk.sql", import.meta.url).pathname, "utf8");
    rawDb.exec(mig0001);
    rawDb.exec(mig0004);
    rawDb.exec(mig0008);
    rawDb.exec(mig0009);
    rawDb.exec(readFileSync(new URL("../migrations/0011_user_state_observed_at.sql", import.meta.url).pathname, "utf8"));
    rawDb.exec(readFileSync(new URL("../migrations/0012_observation_series.sql", import.meta.url).pathname, "utf8"));
    rawDb.exec(readFileSync(new URL("../migrations/0013_xp_summaries_daily_goal.sql", import.meta.url).pathname, "utf8"));
    rawDb.exec(readFileSync(new URL("../migrations/0014_course_path_state.sql", import.meta.url).pathname, "utf8"));
    d1 = createTestD1(rawDb);
  });

  it("shouldReturn404WhenNoUserExists", async () => {
    const url = new URL("http://localhost/api/languages/analytics");
    const res = await handleGetLanguagesAnalytics(d1, url);
    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.error).toBe("no user state found");
  });

  it("shouldReturn200WithFullCanonicalAnalyticsPayloadMatchingContract", async () => {
    const userId = "1000001";
    await ingestSnapshot(d1, {
      source: "duolingo-lang",
      userId,
      isAuxiliary: false,
      originalCourseId: "DUOLINGO_XA_EN",
      observedCourseId: "DUOLINGO_XA_EN",
      data: {
        user: { id: 1000001, totalXp: 420000, streak: 1210, currentCourseId: "DUOLINGO_XA_EN" },
        courses: [
          { id: "DUOLINGO_XA_EN", title: "Demo Alpha", learningLanguage: "xa", fromLanguage: "en", subject: "language", topic: "xa", xp: 18000 },
          { id: "DUOLINGO_XB_EN", title: "Demo Beta", learningLanguage: "xb", fromLanguage: "en", subject: "language", topic: "xb", xp: 94000 },
        ],
        currentCourse: {
          id: "DUOLINGO_XA_EN",
          pathSectioned: [
            { id: "sec-0", index: 0, completedUnits: 10, totalUnits: 10, cefr: { level: "INTRO" } },
            { id: "sec-1", index: 1, completedUnits: 20, totalUnits: 30, cefr: { level: "A1" } },
          ],
        },
        xpSummaries: [
          { date: 1790121600, gainedXp: 100, numSessions: 2, totalSessionTime: 120 }, // 2026-09-24 (Thu)
          { date: 1790208000, gainedXp: 200, numSessions: 4, totalSessionTime: 240 }, // 2026-09-25 (Fri)
        ],
      },
    });

    const url = new URL("http://localhost/api/languages/analytics");
    const res = await handleGetLanguagesAnalytics(d1, url);
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.userId).toBe(userId);

    // Period validation
    expect(body.period).toMatchObject({
      startDate: "2026-09-23",
      endDate: "2026-09-24",
      calendarDays: 2,
    });

    // Activity summary
    expect(body.activity.activeDays).toBe(2);
    expect(body.activity.calendarDays).toBe(2);
    expect(body.activity.activityDensity).toBe(1.0);
    expect(body.activity.totalSessions).toBe(6);
    expect(body.activity.totalReportedSeconds).toBe(360);
    expect(body.activity.dailyXpMedian).toBe(150);

    // Intensity metrics
    expect(body.intensity.global.xpPerSession).toBe(50); // 300 / 6
    expect(body.intensity.global.secondsPerSession).toBe(60); // 360 / 6
    expect(body.intensity.global.xpPerMinute).toBe(50); // 300 / (360/60) = 300 / 6

    // Weekday profile
    expect(body.weekdayProfile).toHaveLength(7);
    const wed = body.weekdayProfile.find((w: any) => w.dayOfWeek === 3);
    expect(wed).toBeDefined();
    expect(wed.sampleCount).toBe(1);
    expect(wed.medianXp).toBe(100);

    // Historical concentration
    expect(body.historicalConcentration.totalLinguisticXp).toBe(112000);
    expect(body.historicalConcentration.courses).toHaveLength(2);
    expect(body.historicalConcentration.hhi).toBeGreaterThan(0);
    expect(body.historicalConcentration.effectiveCourseCount).toBeGreaterThan(1);

    // Curriculum state
    expect(body.curriculum.courses).toHaveLength(1);
    expect(body.curriculum.courses[0]).toMatchObject({
      courseId: "DUOLINGO_XA_EN",
      completedUnits: 30,
      totalUnits: 40,
      ratio: 0.75,
      sectionsCount: 2,
    });
  });

  it("shouldRespectDaysParameterToRestrictTimeWindow", async () => {
    const userId = "1000001";
    await ingestSnapshot(d1, {
      source: "duolingo-lang",
      userId,
      data: {
        user: { id: 1000001 },
        courses: [],
        xpSummaries: [
          { date: 1000, gainedXp: 10, numSessions: 1, totalSessionTime: 60 },
          { date: 2000, gainedXp: 20, numSessions: 1, totalSessionTime: 60 },
          { date: 3000, gainedXp: 30, numSessions: 1, totalSessionTime: 60 },
        ],
      },
    });

    const url = new URL("http://localhost/api/languages/analytics?days=2");
    const res = await handleGetLanguagesAnalytics(d1, url);
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.activity.activeDays).toBe(2);
    expect(body.activity.totalSessions).toBe(2);
    expect(body.activity.totalReportedSeconds).toBe(120);
  });

  it("shouldTrackCurriculumLongitudinalDeltasAcrossSnapshots", async () => {
    const userId = "1000001";
    // First snapshot
    await ingestSnapshot(d1, {
      source: "duolingo-lang",
      userId,
      isAuxiliary: false,
      createdAt: "2026-09-24T10:00:00.000Z",
      data: {
        user: { id: 1000001, currentCourseId: "DUOLINGO_XA_EN" },
        currentCourse: {
          id: "DUOLINGO_XA_EN",
          pathSectioned: [
            { id: "sec-0", index: 0, completedUnits: 10, totalUnits: 40 },
          ],
        },
      },
    });

    // Second snapshot with progress on stable denominator
    await ingestSnapshot(d1, {
      source: "duolingo-lang",
      userId,
      isAuxiliary: false,
      createdAt: "2026-09-29T10:00:00.000Z",
      data: {
        user: { id: 1000001, currentCourseId: "DUOLINGO_XA_EN" },
        currentCourse: {
          id: "DUOLINGO_XA_EN",
          pathSectioned: [
            { id: "sec-0", index: 0, completedUnits: 15, totalUnits: 40 },
          ],
        },
      },
    });

    const url = new URL("http://localhost/api/languages/analytics");
    const res = await handleGetLanguagesAnalytics(d1, url);
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.curriculum.recentDeltas).toHaveLength(1);
    expect(body.curriculum.recentDeltas[0]).toMatchObject({
      courseId: "DUOLINGO_XA_EN",
      status: "comparable",
      previousTotalUnits: 40,
      latestTotalUnits: 40,
      deltaCompletedUnits: 5,
    });
  });

  it("shouldEnforceMultitenancyIsolationInAnalytics", async () => {
    await ingestSnapshot(d1, {
      source: "duolingo-lang",
      userId: "user_A",
      data: {
        user: { id: "user_A" },
        courses: [{ id: "DUOLINGO_XA_EN", xp: 1000, subject: "language" }],
        xpSummaries: [{ date: 1000, gainedXp: 100, numSessions: 2, totalSessionTime: 120 }],
      },
    });

    await ingestSnapshot(d1, {
      source: "duolingo-lang",
      userId: "user_B",
      data: {
        user: { id: "user_B" },
        courses: [{ id: "DUOLINGO_XE_EN", xp: 5000, subject: "language" }],
        xpSummaries: [{ date: 1000, gainedXp: 500, numSessions: 5, totalSessionTime: 300 }],
      },
    });

    const resA = await handleGetLanguagesAnalytics(d1, new URL("http://localhost/api/languages/analytics?userId=user_A"));
    const bodyA = (await resA.json()) as any;
    expect(bodyA.userId).toBe("user_A");
    expect(bodyA.activity.totalSessions).toBe(2);
    expect(bodyA.historicalConcentration.totalLinguisticXp).toBe(1000);
    expect(bodyA.historicalConcentration.courses[0].courseId).toBe("DUOLINGO_XA_EN");

    const resB = await handleGetLanguagesAnalytics(d1, new URL("http://localhost/api/languages/analytics?userId=user_B"));
    const bodyB = (await resB.json()) as any;
    expect(bodyB.userId).toBe("user_B");
    expect(bodyB.activity.totalSessions).toBe(5);
    expect(bodyB.historicalConcentration.totalLinguisticXp).toBe(5000);
    expect(bodyB.historicalConcentration.courses[0].courseId).toBe("DUOLINGO_XE_EN");
  });

  it("shouldServeGETApiLanguagesAnalyticsThroughWorkerFetchRouter", async () => {
    await ingestSnapshot(d1, {
      source: "duolingo-lang",
      userId: "1000001",
      data: {
        user: { id: 1000001 },
        courses: [{ id: "DUOLINGO_XA_EN", xp: 500, subject: "language" }],
        xpSummaries: [{ date: 1000, gainedXp: 50, numSessions: 1, totalSessionTime: 60 }],
      },
    });

    const req = new Request("http://localhost/api/languages/analytics", { method: "GET" });
    const env = { DB: d1 } as any;
    const res = await worker.fetch(req, env);

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.userId).toBe("1000001");
    expect(body.period).toBeDefined();
    expect(body.activity).toBeDefined();
    expect(body.intensity).toBeDefined();
    expect(body.weekdayProfile).toBeDefined();
    expect(body.historicalConcentration).toBeDefined();
    expect(body.curriculum).toBeDefined();
  });
});
