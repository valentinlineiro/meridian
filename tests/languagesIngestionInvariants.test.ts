import { describe, it, expect, beforeEach } from "vitest";
import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";
const require = createRequire(import.meta.url);
const { DatabaseSync: SQLiteDatabase } = require("node:sqlite");
import { readFileSync } from "node:fs";
import { ingestSnapshot } from "../src/api/import.ts";

function createTestD1(db: DatabaseSync): D1Database {
  return {
    prepare(sql: string) {
      return {
        bind(...args: any[]) {
          return {
            all: async () => ({ results: db.prepare(sql).all(...args) }),
            first: async () => {
              const row = db.prepare(sql).get(...args);
              return row ?? null;
            },
            run: async () => {
              const res = db.prepare(sql).run(...args);
              return { meta: { changes: Number(res.changes) } };
            },
            _execute: () => db.prepare(sql).run(...args),
          };
        },
      };
    },
    async batch(stmts: any[]) {
      for (const s of stmts) {
        s._execute();
      }
      return stmts.map(() => ({ meta: { changes: 1 } }));
    },
  } as unknown as D1Database;
}

describe("Languages Ingestion Invariants (Contract v0.1)", () => {
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
    rawDb.exec(readFileSync(new URL("../migrations/0011_user_state_observed_at.sql", import.meta.url).pathname, "utf8"));
    rawDb.exec(readFileSync(new URL("../migrations/0012_observation_series.sql", import.meta.url).pathname, "utf8"));
    rawDb.exec(readFileSync(new URL("../migrations/0013_xp_summaries_daily_goal.sql", import.meta.url).pathname, "utf8"));
    rawDb.exec(readFileSync(new URL("../migrations/0014_course_path_state.sql", import.meta.url).pathname, "utf8"));
    d1 = createTestD1(rawDb);
  });

  it("shouldPreserveOriginalCurrentCourseIdThroughoutAMultiCourseAuxiliary", async () => {
    const userId = "1000001";
    const syncId = "sync-auxiliary-001";
    const originalCourse = "DUOLINGO_XA_EN";

    // 1. Initial snapshot with original Demo Alpha course
    const alphaData = {
      user: { id: 1000001, totalXp: 50000, streak: 100, currentCourseId: originalCourse },
      courses: [
        { id: "DUOLINGO_XA_EN", title: "Demo Alpha", learningLanguage: "xa", fromLanguage: "en", subject: "language", xp: 20000 },
        { id: "DUOLINGO_XB_EN", title: "Demo Beta", learningLanguage: "xb", fromLanguage: "en", subject: "language", xp: 15000 },
        { id: "DUOLINGO_XC_ES", title: "Demo Gamma", learningLanguage: "xc", fromLanguage: "es", subject: "language", xp: 10000 },
      ],
      currentCourse: {
        id: "DUOLINGO_XA_EN",
        pathSectioned: [
          { id: "sec-it-0", index: 0, type: "learning", completedUnits: 10, totalUnits: 10, cefr: { level: "INTRO" } },
        ],
      },
    };

    await ingestSnapshot(d1, {
      source: "duolingo-lang",
      userId,
      syncId,
      isAuxiliary: false,
      originalCourseId: originalCourse,
      observedCourseId: "DUOLINGO_XA_EN",
      data: alphaData,
    });

    let userState = rawDb.prepare("SELECT * FROM user_state WHERE user_id = ?").get(userId) as any;
    expect(userState.current_course_id).toBe("DUOLINGO_XA_EN");

    // 2. Auxiliary Step 1: Demo Beta (transient course)
    const betaData = {
      ...alphaData,
      user: { ...alphaData.user, currentCourseId: "DUOLINGO_XB_EN" },
      currentCourse: {
        id: "DUOLINGO_XB_EN",
        pathSectioned: [
          { id: "sec-ru-0", index: 0, type: "learning", completedUnits: 5, totalUnits: 20, cefr: { level: "A1" } },
        ],
      },
    };

    await ingestSnapshot(d1, {
      source: "duolingo-lang",
      userId,
      syncId,
      isAuxiliary: true,
      originalCourseId: originalCourse,
      observedCourseId: "DUOLINGO_XB_EN",
      data: betaData,
    });

    userState = rawDb.prepare("SELECT * FROM user_state WHERE user_id = ?").get(userId) as any;
    expect(userState.current_course_id).toBe("DUOLINGO_XA_EN"); // MUST NOT CHANGE

    // 3. Auxiliary Step 2: Demo Gamma (transient course)
    const gammaData = {
      ...alphaData,
      user: { ...alphaData.user, currentCourseId: "DUOLINGO_XC_ES" },
      currentCourse: {
        id: "DUOLINGO_XC_ES",
        pathSectioned: [
          { id: "sec-fr-0", index: 0, type: "learning", completedUnits: 8, totalUnits: 15, cefr: { level: "A1" } },
        ],
      },
    };

    await ingestSnapshot(d1, {
      source: "duolingo-lang",
      userId,
      syncId,
      isAuxiliary: true,
      originalCourseId: originalCourse,
      observedCourseId: "DUOLINGO_XC_ES",
      data: gammaData,
    });

    userState = rawDb.prepare("SELECT * FROM user_state WHERE user_id = ?").get(userId) as any;
    expect(userState.current_course_id).toBe("DUOLINGO_XA_EN"); // STILL XA_EN

    // 4. Restore: Demo Alpha confirmed
    await ingestSnapshot(d1, {
      source: "duolingo-lang",
      userId,
      syncId,
      isAuxiliary: false,
      originalCourseId: originalCourse,
      observedCourseId: "DUOLINGO_XA_EN",
      data: alphaData,
    });

    userState = rawDb.prepare("SELECT * FROM user_state WHERE user_id = ?").get(userId) as any;
    expect(userState.current_course_id).toBe("DUOLINGO_XA_EN");

    // Verify all 3 courses' sections were properly saved and attributed
    const sections = rawDb.prepare("SELECT course_id, section_id, completed_units FROM course_sections ORDER BY course_id").all() as any[];
    expect(sections).toHaveLength(3);
    expect(sections.map((s) => s.course_id)).toEqual(["DUOLINGO_XA_EN", "DUOLINGO_XB_EN", "DUOLINGO_XC_ES"]);
  });

  it("shouldMaintainStrictIdempotence90DaysXPAcross8AuxiliaryCoursesYieldsExactly90Rows", async () => {
    const userId = "1000001";
    const syncId = "sync-xp-001";
    const originalCourse = "DUOLINGO_XA_EN";

    // Generate 90 days of XP summaries
    const baseDate = 1790000000;
    const ninetyDaysXp = Array.from({ length: 90 }, (_, i) => ({
      date: baseDate + i * 86400,
      gainedXp: 50 + (i % 10) * 10,
      numSessions: 2 + (i % 3),
      totalSessionTime: 300 + (i % 5) * 60,
      streakExtended: true,
      frozen: false,
      repaired: false,
    }));

    const courseIds = [
      "DUOLINGO_XA_EN", "DUOLINGO_XB_EN", "DUOLINGO_XC_ES", "DUOLINGO_XD_EN",
      "DUOLINGO_XE_EN", "DUOLINGO_ES_EN", "DUOLINGO_PT_EN", "DUOLINGO_XF_EN",
    ];

    // Ingest the 90 days payload 8 times (once per auxiliary course)
    for (let idx = 0; idx < courseIds.length; idx++) {
      const cid = courseIds[idx]!;
      const isAuxiliary = idx > 0;
      await ingestSnapshot(d1, {
        source: "duolingo-lang",
        userId,
        syncId,
        isAuxiliary,
        originalCourseId: originalCourse,
        observedCourseId: cid,
        data: {
          user: { id: 1000001, totalXp: 100000, streak: 50, currentCourseId: cid },
          courses: [{ id: cid, subject: "language" }],
          currentCourse: {
            id: cid,
            pathSectioned: [{ id: `sec-${cid}-0`, index: 0, completedUnits: 1, totalUnits: 10 }],
          },
          xpSummaries: ninetyDaysXp,
        },
      });
    }

    const rowCount = (rawDb.prepare("SELECT COUNT(*) as c FROM xp_summaries WHERE user_id = ?").get(userId) as any).c;
    expect(rowCount).toBe(90); // Exactly 90, NOT 720 (8 * 90)
  });

  it("shouldBeStrictlyIdempotentOnRepeatingIdenticalSyncSession", async () => {
    const userId = "1000001";
    const payload = {
      user: { id: 1000001, totalXp: 66000, streak: 100, currentCourseId: "DUOLINGO_XA_EN" },
      courses: [
        { id: "DUOLINGO_XA_EN", title: "Demo Alpha", learningLanguage: "xa", fromLanguage: "en", subject: "language", xp: 27000 },
      ],
      currentCourse: {
        id: "DUOLINGO_XA_EN",
        pathSectioned: [{ id: "sec-it-0", index: 0, type: "learning", completedUnits: 10, totalUnits: 10 }],
      },
      xpSummaries: [{ date: 1790121600, gainedXp: 80, numSessions: 3, totalSessionTime: 400 }],
    };

    // First ingestion
    const res1 = await ingestSnapshot(d1, {
      source: "duolingo-lang",
      userId,
      data: payload,
    });
    expect(res1.deduplicated).toBe(false);

    const countsAfter1 = {
      snapshots: (rawDb.prepare("SELECT COUNT(*) as c FROM snapshots").get() as any).c,
      courses: (rawDb.prepare("SELECT COUNT(*) as c FROM courses").get() as any).c,
      sections: (rawDb.prepare("SELECT COUNT(*) as c FROM course_sections").get() as any).c,
      xp: (rawDb.prepare("SELECT COUNT(*) as c FROM xp_summaries").get() as any).c,
    };

    // Second ingestion with identical payload
    const res2 = await ingestSnapshot(d1, {
      source: "duolingo-lang",
      userId,
      data: payload,
    });
    expect(res2.deduplicated).toBe(true);

    const countsAfter2 = {
      snapshots: (rawDb.prepare("SELECT COUNT(*) as c FROM snapshots").get() as any).c,
      courses: (rawDb.prepare("SELECT COUNT(*) as c FROM courses").get() as any).c,
      sections: (rawDb.prepare("SELECT COUNT(*) as c FROM course_sections").get() as any).c,
      xp: (rawDb.prepare("SELECT COUNT(*) as c FROM xp_summaries").get() as any).c,
    };

    expect(countsAfter2).toEqual(countsAfter1);
  });

  it("shouldFilterOutNonLanguageCoursesChessMusicMathFromCoursesTable", async () => {
    const userId = "1000001";
    const payload = {
      user: { id: 1000001, totalXp: 80000, streak: 200, currentCourseId: "DUOLINGO_XA_EN" },
      courses: [
        { id: "DUOLINGO_XA_EN", title: "Demo Alpha", learningLanguage: "xa", fromLanguage: "en", subject: "language", xp: 30000 },
        { id: "CHESS_CH", xp: 25000, fromLanguage: "es", subject: "chess", topic: "ch" },
        { id: "MUSIC_MT", xp: 12000, fromLanguage: "es", subject: "music", topic: "mt" },
        { id: "MATH_BT", xp: 500, fromLanguage: "en", subject: "math", topic: "bt" },
      ],
      currentCourse: {
        id: "DUOLINGO_XA_EN",
        pathSectioned: [],
      },
    };

    await ingestSnapshot(d1, {
      source: "duolingo-lang",
      userId,
      data: payload,
    });

    const courses = rawDb.prepare("SELECT course_id, subject FROM courses WHERE user_id = ?").all(userId) as any[];
    expect(courses).toHaveLength(1);
    expect(courses[0].course_id).toBe("DUOLINGO_XA_EN");
    expect(courses[0].subject).toBe("language");
  });

  it("shouldRecordForensicAuxiliaryAuditColumnsInSnapshotsTable", async () => {
    const userId = "1000001";
    const syncId = "sync-audit-777";

    await ingestSnapshot(d1, {
      source: "duolingo-lang",
      userId,
      syncId,
      isAuxiliary: true,
      originalCourseId: "DUOLINGO_XA_EN",
      observedCourseId: "DUOLINGO_XB_EN",
      data: {
        user: { id: 1000001, currentCourseId: "DUOLINGO_XB_EN" },
        courses: [{ id: "DUOLINGO_XB_EN", subject: "language" }],
      },
    });

    const snap = rawDb.prepare("SELECT sync_id, is_auxiliary, original_course_id, observed_course_id FROM snapshots WHERE user_id = ?").get(userId) as any;
    expect(snap.sync_id).toBe("sync-audit-777");
    expect(snap.is_auxiliary).toBe(1);
    expect(snap.original_course_id).toBe("DUOLINGO_XA_EN");
    expect(snap.observed_course_id).toBe("DUOLINGO_XB_EN");
  });
});
