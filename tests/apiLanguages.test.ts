import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";
const require = createRequire(import.meta.url);
const { DatabaseSync: SQLiteDatabase } = require("node:sqlite");
import { readFileSync } from "node:fs";
import { ingestSnapshot } from "../src/api/import.ts";
import { handleGetLanguages, handleGetLanguageCourse, handleGetLanguageXp } from "../src/api/languages.ts";

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

describe("Languages Read API (Contract v0.1)", () => {
  let rawDb: DatabaseSync;
  let d1: D1Database;

  beforeEach(() => {
    rawDb = new SQLiteDatabase(":memory:");
    const mig0001 = readFileSync(new URL("../migrations/0001_init.sql", import.meta.url).pathname, "utf8");
    const mig0004 = readFileSync(new URL("../migrations/0004_users.sql", import.meta.url).pathname, "utf8");
    const mig0008 = readFileSync(new URL("../migrations/0008_languages.sql", import.meta.url).pathname, "utf8");
    rawDb.exec(mig0001);
    rawDb.exec(mig0004);
    rawDb.exec(mig0008);
    d1 = createTestD1(rawDb);
  });

  it("shouldReturn404WhenNoUserStateExists", async () => {
    const url = new URL("http://localhost/api/languages");
    const res = await handleGetLanguages(d1, url);
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error).toBe("no user state found");
  });

  describe("GET /api/languages", () => {
    it("shouldReturnUserStateAndLanguageCoursesOrderedByXP", async () => {
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
            { id: "CHESS_CH", xp: 60000, fromLanguage: "es", subject: "chess", topic: "ch" },
          ],
        },
      });

      const url = new URL("http://localhost/api/languages");
      const res = await handleGetLanguages(d1, url);
      expect(res.status).toBe(200);

      const body = await res.json() as any;
      expect(body.userId).toBe(userId);
      expect(body.currentCourseId).toBe("DUOLINGO_XA_EN");
      expect(body.totalXp).toBe(420000);
      expect(body.streak).toBe(1210);
      expect(body.courses).toHaveLength(2); // Demo Beta and Demo Alpha, chess excluded
      // Sorted by xp DESC: Demo Beta (94000) > Demo Alpha (18000)
      expect(body.courses[0].courseId).toBe("DUOLINGO_XB_EN");
      expect(body.courses[0].xp).toBe(94000);
      expect(body.courses[1].courseId).toBe("DUOLINGO_XA_EN");
      expect(body.courses[1].xp).toBe(18000);
    });
  });

  describe("GET /api/languages/courses/:courseId", () => {
    it("shouldReturn404IfCourseDoesNotExist", async () => {
      const userId = "1000001";
      await ingestSnapshot(d1, {
        source: "duolingo-lang",
        userId,
        data: { user: { id: 1000001, currentCourseId: "DUOLINGO_XA_EN" }, courses: [] },
      });

      const url = new URL("http://localhost/api/languages/courses/DUOLINGO_NONEXISTENT");
      const res = await handleGetLanguageCourse(d1, "DUOLINGO_NONEXISTENT", url);
      expect(res.status).toBe(404);
      const body = await res.json() as any;
      expect(body.error).toBe("course not found");
    });

    it("shouldReturnCourseMetadataAndSectionsInSequentialOrder", async () => {
      const userId = "1000001";
      await ingestSnapshot(d1, {
        source: "duolingo-lang",
        userId,
        isAuxiliary: false,
        originalCourseId: "DUOLINGO_XA_EN",
        observedCourseId: "DUOLINGO_XA_EN",
        data: {
          user: { id: 1000001, currentCourseId: "DUOLINGO_XA_EN" },
          courses: [
            { id: "DUOLINGO_XA_EN", title: "Demo Alpha", learningLanguage: "xa", fromLanguage: "en", subject: "language", topic: "xa", xp: 18000 },
          ],
          currentCourse: {
            id: "DUOLINGO_XA_EN",
            pathSectioned: [
              { id: "sec-it-2", index: 2, type: "learning", completedUnits: 9, totalUnits: 30, cefr: { level: "A1", sublevel: 2 } },
              { id: "sec-it-0", index: 0, type: "learning", completedUnits: 10, totalUnits: 10, cefr: { level: "INTRO" } },
              { id: "sec-it-1", index: 1, type: "learning", completedUnits: 30, totalUnits: 30, cefr: { level: "A1", sublevel: 1 } },
            ],
          },
        },
      });

      const url = new URL("http://localhost/api/languages/courses/DUOLINGO_XA_EN");
      const res = await handleGetLanguageCourse(d1, "DUOLINGO_XA_EN", url);
      expect(res.status).toBe(200);

      const body = await res.json() as any;
      expect(body.userId).toBe(userId);
      expect(body.course).toMatchObject({
        courseId: "DUOLINGO_XA_EN",
        title: "Demo Alpha",
        learningLanguage: "xa",
        fromLanguage: "en",
        xp: 18000,
      });

      // Verify sections are returned ordered by sectionIndex ASC: 0, 1, 2
      expect(body.sections).toHaveLength(3);
      expect(body.sections[0]).toMatchObject({ sectionIndex: 0, sectionId: "sec-it-0", cefrLevel: "INTRO", completedUnits: 10, totalUnits: 10 });
      expect(body.sections[1]).toMatchObject({ sectionIndex: 1, sectionId: "sec-it-1", cefrLevel: "A1", cefrSublevel: 1, completedUnits: 30, totalUnits: 30 });
      expect(body.sections[2]).toMatchObject({ sectionIndex: 2, sectionId: "sec-it-2", cefrLevel: "A1", cefrSublevel: 2, completedUnits: 9, totalUnits: 30 });
    });
  });

  describe("GET /api/languages/xp", () => {
    it("shouldReturnDailyXPSummariesOrderedChronologically", async () => {
      const userId = "1000001";
      const sampleSummaries = [
        { date: 1790121600, gainedXp: 82, numSessions: 4, totalSessionTime: 600, streakExtended: true, frozen: false, repaired: false },
        { date: 1790208000, gainedXp: 140, numSessions: 6, totalSessionTime: 950, streakExtended: true, frozen: false, repaired: false },
        { date: 1790294400, gainedXp: 35, numSessions: 1, totalSessionTime: 200, streakExtended: true, frozen: false, repaired: false },
      ];

      await ingestSnapshot(d1, {
        source: "duolingo-lang",
        userId,
        data: {
          user: { id: 1000001 },
          courses: [],
          xpSummaries: sampleSummaries,
        },
      });

      const url = new URL("http://localhost/api/languages/xp?days=30&order=asc");
      const res = await handleGetLanguageXp(d1, url);
      expect(res.status).toBe(200);

      const body = await res.json() as any;
      expect(body.userId).toBe(userId);
      expect(body.days).toBe(30);
      expect(body.summaries).toHaveLength(3);
      expect(body.summaries[0].date).toBe(1790121600);
      expect(body.summaries[0].gainedXp).toBe(82);
      expect(body.summaries[0].numSessions).toBe(4);
      expect(body.summaries[1].date).toBe(1790208000);
      expect(body.summaries[1].gainedXp).toBe(140);
      expect(body.summaries[2].date).toBe(1790294400);
      expect(body.summaries[2].gainedXp).toBe(35);
    });

    it("shouldSupportOrderDesc", async () => {
      const userId = "1000001";
      await ingestSnapshot(d1, {
        source: "duolingo-lang",
        userId,
        data: {
          user: { id: 1000001 },
          courses: [],
          xpSummaries: [
            { date: 1000, gainedXp: 10, numSessions: 1, totalSessionTime: 50 },
            { date: 2000, gainedXp: 20, numSessions: 2, totalSessionTime: 100 },
          ],
        },
      });

      const url = new URL("http://localhost/api/languages/xp?order=desc");
      const res = await handleGetLanguageXp(d1, url);
      const body = await res.json() as any;
      expect(body.summaries[0].date).toBe(2000);
      expect(body.summaries[1].date).toBe(1000);
    });
  });

  describe("Multitenancy isolation", () => {
    it("shouldStrictlyIsolateCoursesBetweenDifferentUsers", async () => {
      await ingestSnapshot(d1, {
        source: "duolingo-lang",
        userId: "user_A",
        data: {
          user: { id: "user_A", currentCourseId: "DUOLINGO_XA_EN" },
          courses: [{ id: "DUOLINGO_XA_EN", title: "Demo Alpha", subject: "language", xp: 1000 }],
        },
      });

      await ingestSnapshot(d1, {
        source: "duolingo-lang",
        userId: "user_B",
        data: {
          user: { id: "user_B", currentCourseId: "DUOLINGO_XE_EN" },
          courses: [{ id: "DUOLINGO_XE_EN", title: "Demo Epsilon", subject: "language", xp: 2000 }],
        },
      });

      const resA = await handleGetLanguages(d1, new URL("http://localhost/api/languages?userId=user_A"));
      const bodyA = await resA.json() as any;
      expect(bodyA.userId).toBe("user_A");
      expect(bodyA.courses).toHaveLength(1);
      expect(bodyA.courses[0].courseId).toBe("DUOLINGO_XA_EN");

      const resB = await handleGetLanguages(d1, new URL("http://localhost/api/languages?userId=user_B"));
      const bodyB = await resB.json() as any;
      expect(bodyB.userId).toBe("user_B");
      expect(bodyB.courses).toHaveLength(1);
      expect(bodyB.courses[0].courseId).toBe("DUOLINGO_XE_EN");
    });

    it("shouldReturn404WhenUserIdIsAmbiguousWithoutExplicitParam", async () => {
      await ingestSnapshot(d1, {
        source: "duolingo-lang",
        userId: "user_A",
        data: {
          user: { id: "user_A", currentCourseId: "DUOLINGO_XA_EN" },
          courses: [{ id: "DUOLINGO_XA_EN", title: "Demo Alpha", subject: "language", xp: 1000 }],
        },
      });
      await ingestSnapshot(d1, {
        source: "duolingo-lang",
        userId: "user_B",
        data: {
          user: { id: "user_B", currentCourseId: "DUOLINGO_XE_EN" },
          courses: [{ id: "DUOLINGO_XE_EN", title: "Demo Epsilon", subject: "language", xp: 2000 }],
        },
      });

      const res = await handleGetLanguages(d1, new URL("http://localhost/api/languages"));
      expect(res.status).toBe(404);
    });

    it("shouldResolveDuolingoUserIdWhenUsersTableHoldsADifferentInternalId", async () => {
      await ingestSnapshot(d1, {
        source: "duolingo-lang",
        userId: "1000001",
        data: {
          user: { id: "1000001", currentCourseId: "DUOLINGO_XA_EN" },
          courses: [{ id: "DUOLINGO_XA_EN", title: "Demo Alpha", subject: "language", xp: 1000 }],
        },
      });
      rawDb.prepare("INSERT INTO users (id, created_at) VALUES (?, ?)")
        .run("internal-uuid", "2026-09-30T00:00:00Z");

      const res = await handleGetLanguages(d1, new URL("http://localhost/api/languages"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.userId).toBe("1000001");
      expect(body.courses).toHaveLength(1);
    });

    it("shouldResolveUserIdWhenTheSameUserExistsInAllThreeTables", async () => {
      await ingestSnapshot(d1, {
        source: "duolingo-lang",
        userId: "user_A",
        data: {
          user: { id: "user_A", currentCourseId: "DUOLINGO_XA_EN" },
          courses: [{ id: "DUOLINGO_XA_EN", title: "Demo Alpha", subject: "language", xp: 1000 }],
        },
      });
      rawDb.prepare("INSERT INTO users (id, created_at) VALUES (?, ?)")
        .run("user_A", "2026-09-30T00:00:00Z");

      const res = await handleGetLanguages(d1, new URL("http://localhost/api/languages"));
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.userId).toBe("user_A");
    });
  });
});
