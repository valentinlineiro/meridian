import { describe, it, expect } from "vitest";
import { setupTestDb } from "./helpers/testDb.ts";
import { ingestSnapshot } from "../src/api/import.ts";
import { createD1WhatChangedAdapter } from "../src/infrastructure/d1/d1WhatChangedAdapter.ts";

// Contract v0.2: an account observation speaks for the account; a course observation only for its course.
const USER = "1000001";
const SYNC = "sync-1";
const COURSES = [
  { id: "DUOLINGO_XA_EN", title: "Demo Alpha", learningLanguage: "xa", fromLanguage: "en", subject: "language", xp: 100 },
  { id: "DUOLINGO_XB_EN", title: "Demo Beta", learningLanguage: "xb", fromLanguage: "en", subject: "language", xp: 50 },
  { id: "DUOLINGO_XC_ES", title: "Demo Gamma", learningLanguage: "xc", fromLanguage: "es", subject: "language", xp: 20 },
];
const XP = [{ date: 1790121600, gainedXp: 80, numSessions: 4, totalSessionTime: 600 }];

// Shape the collector's per-course sweep produces today: no totalXp / streak / currentCourseId in `user`.
const courseData = (courseId: string) => ({
  user: { id: 1000001, username: "demo" },
  courses: COURSES,
  currentCourse: { id: courseId, activePathSectionId: "s0", pathSectioned: [{ index: 0, id: "s0", type: "learning", completedUnits: 1, totalUnits: 5, cefr: "A1", units: [] }] },
  xp_summaries: XP,
});
// Shape the contract defines for the account observation: from the initial account read, no currentCourse.
const accountData = (over: object = {}) => ({
  user: { id: 1000001, username: "demo", totalXp: 50000, streak: 100, currentCourseId: "DUOLINGO_XA_EN", ...over },
  courses: COURSES,
  xp_summaries: XP,
});

const account = (d1: D1Database, at: string, data = accountData()) =>
  ingestSnapshot(d1, { source: "duolingo-lang", userId: USER, syncId: SYNC, isAuxiliary: false, originalCourseId: "DUOLINGO_XA_EN", data, createdAt: at });
const course = (d1: D1Database, courseId: string, at: string, data: unknown = courseData(courseId)) =>
  ingestSnapshot(d1, { source: "duolingo-lang", userId: USER, syncId: SYNC, isAuxiliary: true, originalCourseId: "DUOLINGO_XA_EN", observedCourseId: courseId, data, createdAt: at });
const state = (db: any) => db.prepare("SELECT * FROM user_state WHERE user_id = ?").get(USER) as any;

describe("account observation vs course observation", () => {
  it("shouldSetAccountStateWhenTheSnapshotIsAnAccountObservation", async () => {
    const { db, d1 } = setupTestDb();
    await account(d1, "2026-10-06T06:00:00.000Z");
    expect(state(db)).toMatchObject({
      total_xp: 50000, streak: 100, current_course_id: "DUOLINGO_XA_EN",
      total_xp_observed_at: "2026-10-06T06:00:00.000Z", streak_observed_at: "2026-10-06T06:00:00.000Z", current_course_observed_at: "2026-10-06T06:00:00.000Z",
    });
  });

  it("shouldNotChangeCurrentCourseWhenAnAuxiliarySnapshotObservesAnotherCourse", async () => {
    const { db, d1 } = setupTestDb();
    await account(d1, "2026-10-06T06:00:00.000Z");
    await course(d1, "DUOLINGO_XB_EN", "2026-10-06T06:00:05.000Z", { ...courseData("DUOLINGO_XB_EN"), user: { id: 1000001, currentCourseId: "DUOLINGO_XB_EN" } });
    expect(state(db)).toMatchObject({ current_course_id: "DUOLINGO_XA_EN", current_course_observed_at: "2026-10-06T06:00:00.000Z" });
  });

  it("shouldIgnoreAccountFieldsWhenTheSnapshotIsAuxiliary", async () => {
    const { db, d1 } = setupTestDb();
    await account(d1, "2026-10-06T06:00:00.000Z");
    await course(d1, "DUOLINGO_XB_EN", "2026-10-06T06:00:05.000Z", { ...courseData("DUOLINGO_XB_EN"), user: { id: 1000001, totalXp: 1, streak: 1, currentCourseId: "DUOLINGO_XB_EN" } });
    expect(state(db)).toMatchObject({
      total_xp: 50000, streak: 100, current_course_id: "DUOLINGO_XA_EN",
      total_xp_observed_at: "2026-10-06T06:00:00.000Z", streak_observed_at: "2026-10-06T06:00:00.000Z",
    });
  });

  it("shouldIngestCoursesWithoutSectionsWhenTheAccountSnapshotHasNoCurrentCourse", async () => {
    const { db, d1 } = setupTestDb();
    await account(d1, "2026-10-06T06:00:00.000Z");
    expect((db.prepare("SELECT COUNT(*) n FROM courses WHERE user_id = ?").get(USER) as any).n).toBe(3);
    expect((db.prepare("SELECT COUNT(*) n FROM course_sections WHERE user_id = ?").get(USER) as any).n).toBe(0);
  });

  it.each([
    ["accountFirst", ["account", "course", "course", "course"]],
    ["accountLast", ["course", "course", "course", "account"]],
  ])("shouldKeepAccountStateWhenAFullSweepIsIngested (%s)", async (_n, order) => {
    const { db, d1 } = setupTestDb();
    const ids = ["DUOLINGO_XA_EN", "DUOLINGO_XB_EN", "DUOLINGO_XC_ES"];
    let i = 0, c = 0;
    for (const kind of order) {
      const at = `2026-10-06T06:00:0${i++}.000Z`;
      if (kind === "account") await account(d1, at); else await course(d1, ids[c++]!, at);
    }
    expect(state(db)).toMatchObject({ total_xp: 50000, streak: 100, current_course_id: "DUOLINGO_XA_EN" });
    expect((db.prepare("SELECT COUNT(*) n FROM xp_summaries WHERE user_id = ?").get(USER) as any).n).toBe(1);
  });

  it("shouldGroupASweepBySyncIdWhenAllSnapshotsShareIt", async () => {
    const { db, d1 } = setupTestDb();
    await account(d1, "2026-10-06T06:00:00.000Z");
    await course(d1, "DUOLINGO_XB_EN", "2026-10-06T06:00:05.000Z");
    const rows = db.prepare("SELECT is_auxiliary a, sync_id, original_course_id o, observed_course_id ob FROM snapshots ORDER BY created_at").all() as any[];
    expect(rows).toEqual([
      { a: 0, sync_id: SYNC, o: "DUOLINGO_XA_EN", ob: null },
      { a: 1, sync_id: SYNC, o: "DUOLINGO_XA_EN", ob: "DUOLINGO_XB_EN" },
    ]);
  });
});

describe("account state at an instant (what-changed)", () => {
  it("shouldResolveBaselineFromTheLatestAccountSnapshotWhenLaterCourseSnapshotsExist", async () => {
    const { d1 } = setupTestDb();
    await account(d1, "2026-10-06T06:00:00.000Z");
    await course(d1, "DUOLINGO_XB_EN", "2026-10-06T06:00:05.000Z");
    const r = await createD1WhatChangedAdapter(d1).getLanguagesBaseline(USER, "2026-10-06T07:00:00.000Z");
    expect(r.data).toMatchObject({ totalXp: 50000, streak: 100, activeCourseId: "DUOLINGO_XA_EN", observedAt: "2026-10-06T06:00:00.000Z" });
  });

  it("shouldResolveTargetFromTheLatestAccountSnapshotWhenLaterCourseSnapshotsExist", async () => {
    const { d1 } = setupTestDb();
    await account(d1, "2026-10-06T06:00:00.000Z");
    await course(d1, "DUOLINGO_XB_EN", "2026-10-06T06:00:05.000Z");
    const r = await createD1WhatChangedAdapter(d1).getLanguagesTarget(USER, "2026-10-06T07:00:00.000Z");
    expect(r.data).toMatchObject({ totalXp: 50000, activeCourseId: "DUOLINGO_XA_EN", observedAt: "2026-10-06T06:00:00.000Z" });
  });

  it("shouldReportNoAccountStateWhenOnlyCourseSnapshotsExist", async () => {
    const { d1 } = setupTestDb();
    await course(d1, "DUOLINGO_XB_EN", "2026-10-06T06:00:05.000Z");
    const adapter = createD1WhatChangedAdapter(d1);
    const target = await adapter.getLanguagesTarget(USER, "2026-10-06T07:00:00.000Z");
    expect(target.data?.totalXp ?? null).toBeNull();
    expect(target.data?.activeCourseId ?? null).toBeNull();
  });

  it("shouldNotTreatTheObservedCourseAsTheActiveCourseWhenTheSnapshotHasNoAccountBlock", async () => {
    const { d1 } = setupTestDb();
    // legacy snapshot: flagged non-auxiliary, carries currentCourse but no account fields
    await ingestSnapshot(d1, { source: "duolingo-lang", userId: USER, data: courseData("DUOLINGO_XB_EN"), createdAt: "2026-09-26T06:00:00.000Z" });
    const r = await createD1WhatChangedAdapter(d1).getLanguagesBaseline(USER, "2026-10-01T00:00:00.000Z");
    expect(r.data?.activeCourseId ?? null).toBeNull();
  });
});
