import { describe, it, expect } from "vitest";
import { extractObservations, EXTRACTOR_VERSION } from "../src/normalization/observations.ts";

import type { ObservationMeta } from "../src/normalization/observations.ts";
const meta: ObservationMeta = { snapshotId: "s1", userId: "u1", observedAt: "2026-10-06T10:00:00.000Z" };
const run = (source: string, payload: unknown, m = meta) => {
  const x = extractObservations(source, typeof payload === "string" ? payload : JSON.stringify(payload), m);
  if (!x.ok) throw new Error(x.reason);
  return x.observations;
};

const section = (index: number, extra: Record<string, unknown> = {}) => ({ index, id: `sec-${index}`, type: "learning", cefr: { level: "A1", sublevel: 2 }, completedUnits: 3, totalUnits: 10, units: [], ...extra });
const accountPayload = { user: { totalXp: 1000, streak: 12, currentCourseId: "DUOLINGO_RU_EN", courses: [{ id: "DUOLINGO_RU_EN", xp: 900 }] } };
const identityOnly = {
  user: { id: 1 },
  courses: [{ id: "DUOLINGO_RU_EN", subject: "language", learningLanguage: "ru", fromLanguage: "en", title: "Russian", xp: 159279 }],
  currentCourse: { id: "DUOLINGO_RU_EN", activePathSectionId: "sec-1", pathSectioned: [section(0), section(1, { type: "daily_refresh", cefr: null })] },
};

describe("extractObservations: account (K1, D-a, D-b)", () => {
  it("shouldWriteAccountObservationWhenUserBlockCarriesAccountFields", () => {
    expect(run("duolingo-lang", accountPayload).account).toEqual({ totalXp: 1000, streak: 12, declaredCourseId: "DUOLINGO_RU_EN" });
  });
  it("shouldNotWriteAccountObservationWhenSnapshotCarriesOnlyIdentity", () => {
    expect(run("duolingo-lang", identityOnly).account).toBeNull();
  });
  it("shouldKeepNullForTheAccountFieldsTheSnapshotDidNotCarry", () => {
    expect(run("duolingo-lang", { user: { streak: 5 } }).account).toEqual({ totalXp: null, streak: 5, declaredCourseId: null });
  });
  it("shouldIgnoreTopLevelAccountFieldsWhenOnlyUserBlockCounts", () => {
    expect(run("duolingo-lang", { totalXp: 99, streak: 3, currentCourseId: "X" }).account).toBeNull();
  });
  it("shouldNotWriteAccountObservationWhenSnapshotIsAuxiliaryEvenIfItCarriesAccountFields", () => {
    expect(run("duolingo-lang", accountPayload, { ...meta, isAuxiliary: true }).account).toBeNull();
  });
  it("shouldTreatNonNumericAccountValuesAsAbsentNotZero", () => {
    expect(run("duolingo-lang", { user: { totalXp: "1000", streak: null } }).account).toBeNull();
  });
});

describe("extractObservations: courses (K2)", () => {
  it("shouldStoreWhatWasObservedWithoutDecidingWhichCoursesAreLanguages", () => {
    const o = run("duolingo-lang", { courses: [{ id: "DUOLINGO_FR_ES", xp: 49575 }, { id: "CHESS_CH", xp: 1 }, { courseId: "MATH_BT", subject: "math", xp: 205 }] });
    expect(o.courses.map((c) => [c.courseId, c.subject])).toEqual([["DUOLINGO_FR_ES", null], ["CHESS_CH", null], ["MATH_BT", "math"]]);
  });
  it("shouldKeepNullXpWhenXpIsMissingOrNotANumber", () => {
    const o = run("duolingo-lang", { courses: [{ id: "A" }, { id: "B", xp: "7" }, { id: "C", xp: 0 }] });
    expect(o.courses.map((c) => c.xp)).toEqual([null, null, 0]);
  });
  it("shouldKeepTheFirstEntryWhenACourseIdRepeatsInASnapshot", () => {
    const o = run("duolingo-lang", { courses: [{ id: "A", xp: 1 }, { id: "A", xp: 2 }] });
    expect(o.courses).toHaveLength(1);
    expect(o.courses[0]?.xp).toBe(1);
  });
  it("shouldReadCoursesFromUserBlockWhenNoTopLevelList", () => {
    expect(run("duolingo-lang", accountPayload).courses.map((c) => c.courseId)).toEqual(["DUOLINGO_RU_EN"]);
  });
});

describe("extractObservations: path and sections (K4)", () => {
  it("shouldWritePathAndSectionsForTheCourseInCurrentCourse", () => {
    const o = run("duolingo-lang", identityOnly);
    expect(o.path).toEqual({ courseId: "DUOLINGO_RU_EN", activeSectionId: "sec-1", formatError: null });
    expect(o.sections.map((s) => [s.sectionIndex, s.sectionId, s.type, s.cefrLevel, s.cefrSublevel, s.completedUnits, s.totalUnits])).toEqual([
      [0, "sec-0", "learning", "A1", 2, 3, 10], [1, "sec-1", "daily_refresh", null, null, 3, 10],
    ]);
  });
  it("shouldKeepNullCountersInsteadOfZero", () => {
    const o = run("duolingo-lang", { currentCourse: { id: "X", pathSectioned: [section(0, { completedUnits: undefined, totalUnits: null })] } });
    expect(o.sections[0]).toMatchObject({ completedUnits: null, totalUnits: null });
  });
  it("shouldWriteNoPathWhenSnapshotHasNoCurrentCourse", () => {
    const o = run("duolingo-lang", { user: { totalXp: 1 } });
    expect(o.path).toBeNull();
    expect(o.sections).toEqual([]);
  });
  it("shouldRecordFormatErrorAndNoSectionsWhenPathStructureIsNotTheExpectedOne", () => {
    const o = run("duolingo-lang", { currentCourse: { id: "X", pathSectioned: [section(0), { index: 1 }] } });
    expect(o.path?.courseId).toBe("X");
    expect(o.path?.formatError).toMatch(/pathSectioned\[1\]\.id is not a string/);
    expect(o.sections).toEqual([]);
  });
  it("shouldRecordFormatErrorWithNullCourseIdWhenCurrentCourseHasNoUsableId", () => {
    const o = run("duolingo-lang", { currentCourse: { pathSectioned: [] } });
    expect(o.path).toEqual({ courseId: null, activeSectionId: null, formatError: expect.stringContaining("id is not a string") });
  });
  it("shouldKeepTheFirstSectionWhenAnIndexRepeats", () => {
    const o = run("duolingo-lang", { currentCourse: { id: "X", pathSectioned: [section(0, { id: "a" }), section(0, { id: "b" })] } });
    expect(o.sections.map((s) => s.sectionId)).toEqual(["a"]);
  });
});

describe("extractObservations: chess ELO (K3) and unusable input", () => {
  it("shouldWriteSnapshotEloForChessAndNothingForLanguages", () => {
    expect(run("duolingo-chess", { eloRating: 981 }).elo).toBe(981);
    expect(run("duolingo-lang", { eloRating: 981 }).elo).toBeNull();
  });
  it("shouldNotWriteEloWhenItIsNotANumber", () => {
    expect(run("duolingo-chess", { eloRating: "981" }).elo).toBeNull();
  });
  it("shouldObserveNothingForUnknownSources", () => {
    expect(run("test", { eloRating: 1, user: { totalXp: 2 }, courses: [{ id: "A" }] })).toEqual({ account: null, courses: [], path: null, sections: [], elo: null });
  });
  it("shouldReportUnparseableJsonInsteadOfThrowing", () => {
    expect(extractObservations("duolingo-lang", "{nope", meta)).toEqual({ ok: false, reason: "unparseable_json" });
    expect(extractObservations("duolingo-lang", "[1]", meta)).toEqual({ ok: false, reason: "payload_not_an_object" });
  });
  it("shouldBeDeterministicForTheSamePayload", () => {
    const raw = JSON.stringify(identityOnly);
    expect(extractObservations("duolingo-lang", raw, meta)).toEqual(extractObservations("duolingo-lang", raw, meta));
    expect(EXTRACTOR_VERSION).toBe(1);
  });
});
