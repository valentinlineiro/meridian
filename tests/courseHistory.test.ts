import { describe, it, expect } from "vitest";
import { syntheticSnapshot } from "../demo/syntheticCourse.ts";
import { buildCourseProgressHistory } from "../src/analytics/courseHistory.ts";
const snap = syntheticSnapshot();
const betaCC = { id: "DUOLINGO_XB_EN", activePathSectionId: "xb-sec-0", pathSectioned: [{ index: 0, id: "xb-sec-0", type: "learning", cefr: { level: "A1", sublevel: 1 }, completedUnits: 5, totalUnits: 20, units: [] }] };
const betaCourses = [...snap.courses, { id: "DUOLINGO_XB_EN", title: "Demo Beta", xp: 4321, fromLanguage: "en", learningLanguage: "xb" }];

describe("buildCourseProgressHistory", () => {
  it("shouldEmitPointPerActiveSnapshotWhenSnapshotsHaveCurrentCourse", () => {
    const pts = buildCourseProgressHistory([{ rawJson: JSON.stringify(snap), createdAt: "2026-09-23T13:36:48.610Z" }, { rawJson: JSON.stringify({ ...snap, currentCourse: betaCC, courses: betaCourses }), createdAt: "2026-09-24T05:50:50.272Z" }], betaCourses);
    expect(pts).toHaveLength(2);
    expect(pts[0]!.courseId).toBe("DUOLINGO_XA_EN");
    expect(pts[1]!.courseId).toBe("DUOLINGO_XB_EN");
  });

  it("shouldSeparateXpAndPathWhenSnapshotHasDifferentSignals", () => {
    const snapXpCourses = snap.courses.map((c: any) => c.id === "DUOLINGO_XA_EN" ? { ...c, xp: 1000 } : c);
    const latestXpCourses = snap.courses.map((c: any) => c.id === "DUOLINGO_XA_EN" ? { ...c, xp: 9999 } : c);
    const pts = buildCourseProgressHistory([{ rawJson: JSON.stringify({ ...snap, courses: snapXpCourses }), createdAt: "2026-09-23T13:36:48.610Z" }], latestXpCourses);
    expect(pts[0]!.xp).toBe(1000);
    expect(pts[0]!.path?.completedUnits).toBe(12);
    expect(pts[0]!.title).toBe("Demo Alpha");
  });

  it("shouldPreserveXpWhenFormatError", () => {
    const broken = { id: "DUOLINGO_XB_EN", pathSectioned: "bad" };
    const pts = buildCourseProgressHistory([{ rawJson: JSON.stringify({ ...snap, currentCourse: broken, courses: betaCourses }), createdAt: "2026-09-24T00:00:00Z" }], betaCourses);
    expect(pts[0]!.path).toBeNull(); expect(pts[0]!.formatError).toMatch(/pathSectioned/); expect(pts[0]!.xp).toBe(4321);
  });

  it("shouldEmitNoPointWhenNoCurrentCourse", () => {
    const { currentCourse, ...noCC } = snap;
    expect(buildCourseProgressHistory([{ rawJson: JSON.stringify(noCC), createdAt: "2026-09-23T12:00:00Z" }], snap.courses)).toEqual([]);
  });

  it("shouldSkipUnparsableRawJsonWithoutThrowing", () => {
    expect(buildCourseProgressHistory([{ rawJson: "{bad", createdAt: "2026-09-23T00:00:00Z" }, { rawJson: JSON.stringify(snap), createdAt: "2026-09-23T01:00:00Z" }], snap.courses)).toHaveLength(1);
  });
});
