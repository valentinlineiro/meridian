import { describe, it, expect } from "vitest";
import { parseCourseProgress, summarizeCourseProgress, buildCourseProgressIndex, CourseProgressFormatError, type CourseProgress } from "../src/analytics/courseProgress.ts";
import { summarizeLang } from "../src/analytics/lang.ts";
import { handleLangStats } from "../src/api/stats.ts";
import { syntheticSnapshot } from "../demo/syntheticCourse.ts";

// Synthetic data (tests/helpers/syntheticCourse.ts). Demo Alpha, active section A1.2 = 2/6.
const snapshot = syntheticSnapshot();
const fresh = () => structuredClone(snapshot);
const parseReal = () => parseCourseProgress(snapshot.currentCourse, snapshot.courses)!;
const levelsOf = (cp: CourseProgress, sectionIdx: number) => cp.sections[sectionIdx]!.units.flatMap((u) => u.levels ?? []);

describe("parseCourseProgress (synthetic)", () => {
  it("shouldParseAllSectionsWhenCourseHasPath", () => {
    const cp = parseReal();
    expect(cp.courseId).toBe("DUOLINGO_XA_EN");
    expect(cp.sections.map((s) => s.index)).toEqual([0, 1, 2, 3, 4]);
    expect(cp.sections.map((s) => s.totalUnits)).toEqual([4, 6, 6, 8, 1]);
    expect(cp.sections.map((s) => s.units.length)).toEqual([4, 6, 6, 8, 1]);
    expect(cp.activeSectionId).toBe(cp.sections[2]!.id);
  });

  it("shouldRelateCourseDataWhenCoursesHasCurrentCourseId", () => {
    const cp = parseReal();
    expect(cp).toMatchObject({ title: "Demo Alpha", xp: 12345, fromLanguage: "en", learningLanguage: "xa" });
  });

  it("shouldLeaveCourseDataNullWhenNoCoursesEntryMatches", () => {
    const cp = parseCourseProgress(snapshot.currentCourse, [])!;
    expect(cp).toMatchObject({ courseId: "DUOLINGO_XA_EN", title: null, xp: null, fromLanguage: null, learningLanguage: null });
  });

  it("shouldKeepSectionCefrWhenSourceSendsIt", () => {
    const cp = parseReal();
    expect(cp.sections[0]!.cefr).toEqual({ level: "INTRO", sublevel: null });
    expect(cp.sections[2]!.cefr).toEqual({ level: "A1", sublevel: 2 });
  });

  it("shouldLeaveSectionCefrNullWhenSectionHasNone", () => {
    const daily = parseReal().sections[4]!;
    expect(daily.type).toBe("daily_refresh");
    expect(daily.cefr).toBeNull();
  });

  it("shouldKeepUnitCefrWhenPresent", () => {
    const cp = parseReal();
    expect(cp.sections[0]!.units[0]).toMatchObject({ index: 0, teachingObjective: "Demo objective", cefrLevel: "Intro" });
    expect(cp.sections[2]!.units[0]!.cefrLevel).toBe("A1");
  });

  it("shouldLeaveUnitCefrNullWhenAbsent", () => {
    const unit = parseReal().sections[4]!.units[0]!;
    expect(unit).toMatchObject({ index: 24, cefrLevel: null, teachingObjective: null });
  });

  it("shouldReportCompletedAndIncompleteUnitsAsSentBySection", () => {
    const cp = parseReal();
    expect(cp.sections[1]).toMatchObject({ completedUnits: 6, totalUnits: 6 });
    expect(cp.sections[2]).toMatchObject({ completedUnits: 2, totalUnits: 6 });
    expect(cp.sections[3]).toMatchObject({ completedUnits: 0, totalUnits: 8 });
  });

  it("shouldParseLegendaryLevelWhenStateIsLegendary", () => {
    expect(parseReal().sections[0]!.units[0]!.levels![0]).toEqual({
      state: "legendary", finishedSessions: 4, totalSessions: 4,
      skillId: "skill-0-0-0", crownLevelIndex: 0, treeId: "tree-0-0",
      reachedScore: 5, learningScore: 6, reachedProgress: 0, completedProgress: 0.125,
    });
  });

  it("shouldParsePassedActiveAndLockedLevelsWhenActiveSection", () => {
    const states = levelsOf(parseReal(), 2).reduce<Record<string, number>>((a, l) => ({ ...a, [l.state]: (a[l.state] ?? 0) + 1 }), {});
    expect(states).toEqual({ passed: 7, active: 1, locked: 10, unit_test: 6 });
  });

  it("shouldParseSessionsWhenLevelNotStarted", () => {
    const active = levelsOf(parseReal(), 2).find((l) => l.state === "active")!;
    expect(active).toMatchObject({ finishedSessions: 0, totalSessions: 6, skillId: "skill-2-2-1" });
  });

  it("shouldParseLevelScoreInfoWhenPresent", () => {
    const active = levelsOf(parseReal(), 2).find((l) => l.state === "active")!;
    expect(active).toMatchObject({ reachedScore: 7, learningScore: 8, reachedProgress: 0 });
    expect(active.completedProgress).toBeCloseTo(1 / 12);
  });

  it("shouldLeaveMetadataNullWhenPathLevelMetadataIsEmpty", () => {
    const unitTest = levelsOf(parseReal(), 2).find((l) => l.state === "unit_test")!;
    expect(unitTest).toMatchObject({ skillId: null, crownLevelIndex: null, treeId: null });
  });

  it("shouldKeepTreeIdWhenSkillIdAbsent", () => {
    const locked = levelsOf(parseReal(), 2).find((l) => l.state === "locked")!;
    expect(locked).toMatchObject({ skillId: null, treeId: "tree-2-2" });
  });

  it("shouldMarkLevelsNotCapturedWhenSectionIsNotActive", () => {
    expect(parseReal().sections[3]!.units[0]!.levels).toBeNull();
  });

  it("shouldTolerateMissingOptionalFieldsWhenLevelIsSparse", () => {
    const cc = fresh().currentCourse;
    cc.pathSectioned[0].units[0].levels[0] = { state: "passed" };
    delete cc.pathSectioned[0].cefr; delete cc.pathSectioned[0].completedUnits; delete cc.activePathSectionId;
    const cp = parseCourseProgress(cc, snapshot.courses)!;
    expect(cp.sections[0]!.units[0]!.levels![0]).toMatchObject({ state: "passed", finishedSessions: null, skillId: null, reachedScore: null });
    expect(cp.sections[0]).toMatchObject({ cefr: null, completedUnits: null });
    expect(cp.activeSectionId).toBeNull();
  });

  it("shouldReturnNullWhenNoCurrentCourse", () => {
    expect(parseCourseProgress(undefined, snapshot.courses)).toBeNull();
    expect(parseCourseProgress(null, snapshot.courses)).toBeNull();
  });

  it("shouldParseWhenCourseIsPartiallyLoaded", () => {
    const cc = fresh().currentCourse;
    cc.pathSectioned = cc.pathSectioned.slice(0, 1);
    const cp = parseCourseProgress(cc, snapshot.courses)!;
    expect(cp.sections).toHaveLength(1);
    expect(summarizeCourseProgress(cp)).toMatchObject({ activeSection: null, currentCefr: null, completedUnits: 4, totalUnits: 4 });
  });

  it("shouldIgnoreUnknownFieldsWhenPayloadGrows", () => {
    const cc = fresh().currentCourse;
    cc.newTopLevel = { x: 1 };
    cc.pathSectioned[0].exampleSentence = { exampleSentence: "Ciao" };
    cc.pathSectioned[0].units[0].guidebook = { url: "x" };
    cc.pathSectioned[0].units[0].levels[0].type = "skill";
    expect(parseCourseProgress(cc, snapshot.courses)).toEqual(parseReal());
  });

  it.each([
    ["currentCourse is not an object", (cc: any) => "oops", /currentCourse/],
    ["id is missing", (cc: any) => { delete cc.id; return cc; }, /id/],
    ["pathSectioned is not an array", (cc: any) => { cc.pathSectioned = {}; return cc; }, /pathSectioned/],
    ["units is missing", (cc: any) => { delete cc.pathSectioned[3].units; return cc; }, /pathSectioned\[3\]\.units/],
    ["unitIndex is missing", (cc: any) => { delete cc.pathSectioned[0].units[2].unitIndex; return cc; }, /units\[2\]\.unitIndex/],
    ["level state is missing", (cc: any) => { delete cc.pathSectioned[2].units[0].levels[1].state; return cc; }, /levels\[1\]\.state/],
  ])("shouldThrowFormatErrorWhen %s", (_, mutate, message) => {
    const run = () => parseCourseProgress(mutate(fresh().currentCourse), snapshot.courses);
    expect(run).toThrow(CourseProgressFormatError);
    expect(run).toThrow(message);
  });
});

describe("summarizeCourseProgress (synthetic)", () => {
  it("shouldUseActiveSectionForCurrentCefrAndUnitsWhenActiveSectionKnown", () => {
    const sum = summarizeCourseProgress(parseReal())!;
    expect(sum.currentCefr).toBe("A1.2");
    expect(sum.activeSection).toMatchObject({ index: 2, cefr: "A1.2", completedUnits: 2, totalUnits: 6, completionRatio: 2 / 6 });
  });

  it("shouldSumOnlyLearningSectionsWhenComputingCourseCompletion", () => {
    const sum = summarizeCourseProgress(parseReal())!;
    expect(sum.completedUnits).toBe(12); // 4 + 6 + 2
    expect(sum.totalUnits).toBe(24); // daily_refresh section (0/1) is excluded
    expect(sum.completionRatio).toBeCloseTo(12 / 24);
  });

  it("shouldListSectionsWithFormattedCefrWhenSummarized", () => {
    expect(summarizeCourseProgress(parseReal())!.sections.map((s) => s.cefr)).toEqual(["INTRO", "A1.1", "A1.2", "A2.1", null]);
  });

  it("shouldNotChangeProgressWhenXpChanges", () => {
    const courses = fresh().courses; courses.find((c: any) => c.id === "DUOLINGO_XA_EN").xp = 999999;
    const a = summarizeCourseProgress(parseReal())!, b = summarizeCourseProgress(parseCourseProgress(snapshot.currentCourse, courses))!;
    expect({ ...b, xp: null }).toEqual({ ...a, xp: null });
  });

  it("shouldReturnNullRatioWhenDenominatorMissingOrZero", () => {
    const cc = fresh().currentCourse;
    for (const s of cc.pathSectioned) { delete s.totalUnits; }
    cc.pathSectioned[2].totalUnits = 0;
    const sum = summarizeCourseProgress(parseCourseProgress(cc, snapshot.courses))!;
    expect(sum.activeSection!.completionRatio).toBeNull();
    expect(sum.completionRatio).toBeNull();
  });

  it("shouldReturnNullWhenNoCourseProgress", () => {
    expect(summarizeCourseProgress(null)).toBeNull();
  });
});

// Minimal structurally-valid second course, standing in for "some other course was loaded on a different day".
// Only the shape matters here (buildCourseProgressIndex doesn't interpret section content).
const betaCurrentCourse = { id: "DUOLINGO_XB_EN", activePathSectionId: "xb-sec-0", pathSectioned: [{ index: 0, id: "xb-sec-0", type: "learning", cefr: { level: "A1", sublevel: 1 }, completedUnits: 5, totalUnits: 20, units: [] }] };
const betaCourses = [...snapshot.courses, { id: "DUOLINGO_XB_EN", title: "Demo Beta", xp: 4321, fromLanguage: "en", learningLanguage: "xb" }];

describe("buildCourseProgressIndex", () => {
  it("shouldIndexOneCourseWhenOneSnapshot", () => {
    const idx = buildCourseProgressIndex([{ currentCourse: snapshot.currentCourse, createdAt: "2026-09-23T10:00:00Z" }], snapshot.courses);
    expect(idx).toHaveLength(1);
    expect(idx[0]).toMatchObject({ courseId: "DUOLINGO_XA_EN", capturedAt: "2026-09-23T10:00:00Z", formatError: null });
    expect(idx[0]!.summary!.currentCefr).toBe("A1.2");
  });

  it("shouldIndexBothCoursesWhenSeenInDifferentSnapshots", () => {
    const idx = buildCourseProgressIndex([
      { currentCourse: snapshot.currentCourse, createdAt: "2026-09-22T10:00:00Z" },
      { currentCourse: betaCurrentCourse, createdAt: "2026-09-23T10:00:00Z" },
    ], betaCourses);
    expect(idx.map((e) => e.courseId).sort()).toEqual(["DUOLINGO_XA_EN", "DUOLINGO_XB_EN"]);
    const ru = idx.find((e) => e.courseId === "DUOLINGO_XB_EN")!;
    expect(ru.summary).toMatchObject({ xp: 4321, title: "Demo Beta", currentCefr: "A1.1" });
  });

  it("shouldKeepOnlyLatestSnapshotWhenSameCourseSeenTwice", () => {
    const older = { ...snapshot.currentCourse, pathSectioned: [{ ...snapshot.currentCourse.pathSectioned[2], completedUnits: 3 }] };
    const idx = buildCourseProgressIndex([
      { currentCourse: older, createdAt: "2026-09-20T10:00:00Z" },
      { currentCourse: snapshot.currentCourse, createdAt: "2026-09-23T10:00:00Z" },
    ], snapshot.courses);
    expect(idx).toHaveLength(1);
    expect(idx[0]!.capturedAt).toBe("2026-09-23T10:00:00Z");
    expect(idx[0]!.summary!.completedUnits).toBe(12); // the newer snapshot's full path, not the older partial one
  });

  it("shouldOrderBySnapshotDateRegardlessOfArrayOrder", () => {
    const older = { ...snapshot.currentCourse, pathSectioned: [{ ...snapshot.currentCourse.pathSectioned[2], completedUnits: 3 }] };
    const idx = buildCourseProgressIndex([
      { currentCourse: snapshot.currentCourse, createdAt: "2026-09-23T10:00:00Z" }, // newest listed first
      { currentCourse: older, createdAt: "2026-09-20T10:00:00Z" },
    ], snapshot.courses);
    expect(idx[0]!.capturedAt).toBe("2026-09-23T10:00:00Z");
  });

  it("shouldOmitCourseWhenNoSnapshotEverSawIt", () => {
    const idx = buildCourseProgressIndex([{ currentCourse: snapshot.currentCourse, createdAt: "2026-09-23T10:00:00Z" }], snapshot.courses);
    expect(idx.some((e) => e.courseId === "DUOLINGO_XC_ES")).toBe(false); // Demo Gamma: XP-only, no currentCourse ever captured
  });

  it("shouldUseLatestCoursesForXpEvenWhenPathIsOlder", () => {
    const stale = [{ id: "DUOLINGO_XA_EN", title: "Demo Alpha", xp: 1, fromLanguage: "en", learningLanguage: "xa" }]; // XP as it was when the Path snapshot was taken
    const fresh2 = [{ id: "DUOLINGO_XA_EN", title: "Demo Alpha", xp: 99999, fromLanguage: "en", learningLanguage: "xa" }]; // XP as it is now
    const idxStale = buildCourseProgressIndex([{ currentCourse: snapshot.currentCourse, createdAt: "2026-09-20T10:00:00Z" }], stale);
    const idxFresh = buildCourseProgressIndex([{ currentCourse: snapshot.currentCourse, createdAt: "2026-09-20T10:00:00Z" }], fresh2);
    expect(idxStale[0]!.summary!.xp).toBe(1);
    expect(idxFresh[0]!.summary!.xp).toBe(99999); // Path (completedUnits) is untouched by which courses[] we pass
    expect(idxFresh[0]!.summary!.completedUnits).toBe(idxStale[0]!.summary!.completedUnits);
  });

  it("shouldMarkEntryFormatErrorWithoutDroppingOtherCoursesWhenOneSnapshotIsMalformed", () => {
    const broken = { id: "DUOLINGO_XB_EN", pathSectioned: "not-an-array" };
    const idx = buildCourseProgressIndex([
      { currentCourse: snapshot.currentCourse, createdAt: "2026-09-23T10:00:00Z" },
      { currentCourse: broken, createdAt: "2026-09-23T11:00:00Z" },
    ], betaCourses);
    const ru = idx.find((e) => e.courseId === "DUOLINGO_XB_EN")!;
    expect(ru.summary).toBeNull();
    expect(ru.formatError).toMatch(/pathSectioned/);
    const it_ = idx.find((e) => e.courseId === "DUOLINGO_XA_EN")!;
    expect(it_.summary).not.toBeNull();
  });

  it("shouldReturnEmptyIndexWhenNoSnapshotHasCurrentCourse", () => {
    expect(buildCourseProgressIndex([{ currentCourse: null, createdAt: "2026-09-23T10:00:00Z" }], snapshot.courses)).toEqual([]);
  });
});

describe("summarizeLang with currentCourse", () => {
  it("shouldKeepLangActivityWhenCurrentCourseMissing", () => {
    const { currentCourse, ...noCourse } = fresh();
    const s = summarizeLang({ ...noCourse, xp_summaries: [{ date: 1790121600, gainedXp: 30, numSessions: 1, totalSessionTime: 60 }] });
    expect(s).toMatchObject({ courseProgress: null, courseProgressSummary: null, courseProgressError: null, totalXp: snapshot.user.totalXp });
    expect(s.totals.gainedXp).toBe(30);
  });

  it("shouldKeepLangActivityAndReportErrorWhenCurrentCourseStructureChanged", () => {
    const data = fresh(); data.currentCourse.pathSectioned = "changed";
    const s = summarizeLang(data);
    expect(s.courseProgress).toBeNull();
    expect(s.courseProgressError).toMatch(/pathSectioned/);
    expect(s.courses).toHaveLength(snapshot.courses.length);
  });
});

// IT: D1 rows (raw snapshots, newest first) -> /api/stats/lang -> parser -> summary + index. D1 is stubbed at the infra boundary.
describe("GET /api/stats/lang", () => {
  // rows: newest first, matching the real "ORDER BY created_at DESC" query.
  const stubDb = (rows: Array<{ raw: unknown; createdAt: string }>) => ({
    prepare: () => ({ bind() { return this; }, all: async () => ({ results: rows.map((r) => ({ raw_json: JSON.stringify(r.raw), created_at: r.createdAt })) }) }),
  }) as unknown as D1Database;

  it("shouldServeCourseProgressWhenSnapshotHasCurrentCourse", async () => {
    const body: any = await (await handleLangStats(stubDb([{ raw: snapshot, createdAt: "2026-09-23T12:00:00Z" }]), new URL("http://x/api/stats/lang"))).json();
    expect(body.courseProgressSummary).toMatchObject({ courseId: "DUOLINGO_XA_EN", xp: 12345, currentCefr: "A1.2", activeSection: { completedUnits: 2, totalUnits: 6 } });
    expect(body.courseProgressError).toBeNull();
    expect(body.courseProgressIndex).toEqual([{ courseId: "DUOLINGO_XA_EN", capturedAt: "2026-09-23T12:00:00Z", formatError: null, summary: body.courseProgressSummary }]);
  });

  it("shouldServeLangStatsWhenSnapshotPredatesCurrentCourse", async () => {
    const { currentCourse, ...old } = snapshot;
    const res = await handleLangStats(stubDb([{ raw: old, createdAt: "2026-09-23T12:00:00Z" }]), new URL("http://x/api/stats/lang"));
    const body: any = await res.json();
    expect(res.status).toBe(200);
    expect(body.courseProgressSummary).toBeNull();
    expect(body.courses.length).toBe(snapshot.courses.length);
  });

  it("shouldAccumulateBothCoursesWhenSyncedOnDifferentDays", async () => {
    const db = stubDb([
      { raw: { ...snapshot, courses: betaCourses, currentCourse: betaCurrentCourse }, createdAt: "2026-09-23T09:00:00Z" }, // most recent sync: Demo Beta loaded
      { raw: { ...snapshot, courses: betaCourses }, createdAt: "2026-09-22T09:00:00Z" }, // yesterday: Demo Alpha loaded
    ]);
    const body: any = await (await handleLangStats(db, new URL("http://x/api/stats/lang"))).json();
    // "current" fields reflect only the most recent sync (Demo Beta) — unchanged, existing behavior
    expect(body.courseProgressSummary.courseId).toBe("DUOLINGO_XB_EN");
    // the index accumulates both, each with its own capture date
    const byId = Object.fromEntries(body.courseProgressIndex.map((e: any) => [e.courseId, e]));
    expect(byId.DUOLINGO_XB_EN).toMatchObject({ capturedAt: "2026-09-23T09:00:00Z" });
    expect(byId.DUOLINGO_XA_EN).toMatchObject({ capturedAt: "2026-09-22T09:00:00Z" });
    expect(byId.DUOLINGO_XA_EN.summary.currentCefr).toBe("A1.2");
  });

  it("shouldIncludeCourseProgressHistoryWhenSnapshotsHavePaths", async () => {
    const snap2 = { ...snapshot, currentCourse: betaCurrentCourse, courses: betaCourses };
    const db = stubDb([{ raw: snap2, createdAt: "2026-09-23T09:00:00Z" }, { raw: snapshot, createdAt: "2026-09-22T09:00:00Z" }]);
    const body: any = await (await handleLangStats(db, new URL("http://x/api/stats/lang"))).json();
    expect(body.courseProgressHistory).toHaveLength(2);
    expect(body.courseProgressHistory[0].path.currentCefr).toBe("A1.2");
    expect(body.courseProgressHistory[0].xp).toBe(12345);
  });
});
