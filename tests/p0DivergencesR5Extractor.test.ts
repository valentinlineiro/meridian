// P0 characterisation tests (RG1–RG5). They PIN WHAT THE CODE DOES; none of them says the behaviour is correct.
// R5 (getCurriculumDeltas) now reads observation rows (switched from raw_json). Cases RG2/RG3 therefore document that R5 and the
// extractor AGREE: a snapshot whose Path has a format error or no usable course id is not an observation of a course Path.
// RG1 (null counts read as 0) keeps the previous R5 behaviour on purpose; preserving NULL (D-d) is a separate change.
// Tests marked [OBSERVED] describe a measured divergence. Tests marked [PENDING-CONTRACT] pin a point the owner has not
// decided yet: when the contract decides, the expectation changes together with the fix, never before.
import { describe, it, expect } from "vitest";
import { setupTestDb } from "./helpers/testDb.ts";
import { getCurriculumDeltas } from "../src/api/languagesAnalytics.ts";
import { extractObservations } from "../src/normalization/observations.ts";
import { observationStatements } from "../src/db/storeObservations.ts";
import { createD1TrajectoryAdapter } from "../src/infrastructure/d1/d1TrajectoryAdapter.ts";

const USER = "1000001";
const at = (day: number) => `2026-09-${String(day).padStart(2, "0")}T10:00:00.000Z`;

type Seed = { id: string; day: number; payload: unknown; aux?: boolean };
const section = (over: Record<string, unknown> = {}) => ({ id: "s0", index: 0, type: "learning", units: [], completedUnits: 1, totalUnits: 10, ...over });
const payload = (courseId: unknown, sections: unknown[]) => ({
  user: { id: 1000001 },
  courses: [{ id: typeof courseId === "string" ? courseId : "OTHER", subject: "language" }],
  currentCourse: { id: courseId, pathSectioned: sections },
});

// Same path the backfill takes: row inserted as stored, then extractor -> observationStatements applied to it.
async function world(seeds: Seed[]) {
  const { db, d1 } = setupTestDb();
  for (const s of seeds) {
    const raw = JSON.stringify(s.payload);
    db.prepare("INSERT INTO snapshots (id, created_at, source, user_id, raw_json, games_count, pages_count, checksum, size_bytes, is_auxiliary) VALUES (?,?,?,?,?,0,0,?,?,?)")
      .run(s.id, at(s.day), "duolingo-lang", USER, raw, `ck-${s.id}`, raw.length, s.aux ? 1 : 0);
    const x = extractObservations("duolingo-lang", raw, { snapshotId: s.id, userId: USER, observedAt: at(s.day), isAuxiliary: !!s.aux });
    const stmts = observationStatements(d1, x);
    if (stmts.length) await d1.batch(stmts);
  }
  const rows = (sql: string) => db.prepare(sql).all().map((r: any) => ({ ...r }));
  return {
    r5: () => getCurriculumDeltas(d1, USER),
    path: () => rows("SELECT snapshot_id, course_id, active_section_id, format_error FROM path_observations ORDER BY snapshot_id"),
    sections: () => rows("SELECT snapshot_id, section_index, section_id, completed_units, total_units FROM section_observations ORDER BY snapshot_id, section_index"),
    account: () => rows("SELECT snapshot_id FROM account_observations ORDER BY snapshot_id"),
    courses: () => rows("SELECT snapshot_id, course_id, xp FROM course_observations ORDER BY snapshot_id, course_id"),
    r4: () => createD1TrajectoryAdapter(d1).getLanguagesTrajectoryData(USER),
  };
}

describe("RG1 absent is not zero (R5 `?? 0` vs null)", () => {
  it("shouldReadAbsentUnitCountsAsZeroInR5ButStoreNullInObservationsWhenCountsAreMissing [OBSERVED]", async () => {
    const w = await world([
      { id: "a", day: 10, payload: payload("DUOLINGO_XA_EN", [section({ completedUnits: undefined, totalUnits: undefined })]) },
      { id: "b", day: 12, payload: payload("DUOLINGO_XA_EN", [section({ completedUnits: undefined, totalUnits: undefined })]) },
    ]);
    expect(await w.sections()).toEqual([
      { snapshot_id: "a", section_index: 0, section_id: "s0", completed_units: null, total_units: null },
      { snapshot_id: "b", section_index: 0, section_id: "s0", completed_units: null, total_units: null },
    ]);
    // R5: nothing was observed, yet it reports a comparable interval with 0 total units and a delta of 0.
    expect(await w.r5()).toEqual([
      { courseId: "DUOLINGO_XA_EN", previousObservedAt: at(10), latestObservedAt: at(12), previousTotalUnits: 0, latestTotalUnits: 0, deltaCompletedUnits: 0, status: "comparable" },
    ]);
  });

  it("shouldKeepExplicitZeroDistinctFromAbsentInObservationsWhenCountsAreZero [OBSERVED]", async () => {
    const w = await world([{ id: "z", day: 10, payload: payload("DUOLINGO_XA_EN", [section({ completedUnits: 0, totalUnits: 0 })]) }]);
    expect((await w.sections())[0]).toMatchObject({ completed_units: 0, total_units: 0 }); // explicit 0 is stored as 0, not null
  });

  it("shouldCountOnlyThePresentFieldInR5WhenOneOfTheCountsIsMissing [OBSERVED]", async () => {
    const w = await world([
      { id: "a", day: 10, payload: payload("DUOLINGO_XA_EN", [section({ completedUnits: undefined, totalUnits: 10 })]) },
      { id: "b", day: 12, payload: payload("DUOLINGO_XA_EN", [section({ completedUnits: 4, totalUnits: 10 })]) },
    ]);
    // Absent completedUnits becomes 0, so R5 reports +4 units of progress against an interval whose start was never observed.
    expect((await w.r5())[0]).toMatchObject({ deltaCompletedUnits: 4, status: "comparable" });
    expect((await w.sections())[0].completed_units).toBeNull();
  });
});

describe("RG2 invalid sections (R5 and extractor agree since R5 reads observations)", () => {
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ["index missing", { index: undefined }, "currentCourse: pathSectioned[0].index is not a number"],
    ["index not a number", { index: "1" }, "currentCourse: pathSectioned[0].index is not a number"],
    ["id missing", { id: undefined }, "currentCourse: pathSectioned[0].id is not a string"],
    ["units missing", { units: undefined }, "currentCourse: pathSectioned[0].units is not an array"],
  ];
  for (const [label, bad, message] of cases) {
    it(`shouldYieldFormatErrorNoSectionsAndNoDeltaInBothReadersWhen ${label.replace(/ /g, "_")} [OBSERVED]`, async () => {
      const w = await world([
        { id: "a", day: 10, payload: payload("DUOLINGO_XA_EN", [section({ ...bad, completedUnits: 1 })]) },
        { id: "b", day: 12, payload: payload("DUOLINGO_XA_EN", [section({ ...bad, completedUnits: 3 })]) },
      ]);
      expect(await w.sections()).toEqual([]);
      expect(await w.path()).toEqual([
        { snapshot_id: "a", course_id: "DUOLINGO_XA_EN", active_section_id: null, format_error: message },
        { snapshot_id: "b", course_id: "DUOLINGO_XA_EN", active_section_id: null, format_error: message },
      ]);
      expect(await w.r5()).toEqual([]); // R5 reads the same rows: no sections and a format error => no observation of a Path
    });
  }

  it("shouldCollapseDuplicateSectionIndexesInBothReaders [OBSERVED]", async () => {
    const dup = [section({ id: "s0", index: 0, totalUnits: 10 }), section({ id: "s0b", index: 0, totalUnits: 5 })];
    const w = await world([{ id: "a", day: 10, payload: payload("DUOLINGO_XA_EN", dup) }, { id: "b", day: 11, payload: payload("DUOLINGO_XA_EN", dup) }]);
    expect((await w.sections()).filter((s: any) => s.snapshot_id === "a")).toHaveLength(1); // first wins, like the primary key
    expect((await w.r5())[0]).toMatchObject({ latestTotalUnits: 10 }); // R5 now sees the same single section (was 15 from raw_json)
  });
});

describe("RG3 course identifier (absent, empty, wrong type)", () => {
  it("shouldDropTheSnapshotInR5AndRecordNullCourseWithFormatErrorWhenIdIsAbsent [OBSERVED]", async () => {
    const p = { user: { id: 1000001 }, currentCourse: { pathSectioned: [section()] } };
    const w = await world([{ id: "a", day: 10, payload: p }]);
    expect(await w.r5()).toEqual([]);
    expect(await w.path()).toEqual([{ snapshot_id: "a", course_id: null, active_section_id: null, format_error: "currentCourse: id is not a string" }]);
  });

  it("shouldDropTheSnapshotInR5ButStoreAPathWithEmptyCourseIdWhenIdIsEmptyString [PENDING-CONTRACT]", async () => {
    const w = await world([{ id: "a", day: 10, payload: payload("", [section()]) }]);
    expect(await w.r5()).toEqual([]); // R5: `course_id <> ''`
    expect(await w.path()).toEqual([{ snapshot_id: "a", course_id: "", active_section_id: null, format_error: null }]); // extractor: str("") passes
    expect(await w.sections()).toHaveLength(1);
  });

  it("shouldIgnoreANumericIdInBothReadersAndRecordNullCourseWithFormatError [PENDING-CONTRACT]", async () => {
    const w = await world([{ id: "a", day: 10, payload: payload(123, [section()]) }, { id: "b", day: 11, payload: payload(123, [section({ completedUnits: 2 })]) }]);
    expect(await w.r5()).toEqual([]); // R5 no longer lets a numeric id leak through: it reads the observation (course_id NULL + format_error)
    expect(await w.path()).toEqual([
      { snapshot_id: "a", course_id: null, active_section_id: null, format_error: "currentCourse: id is not a string" },
      { snapshot_id: "b", course_id: null, active_section_id: null, format_error: "currentCourse: id is not a string" },
    ]);
  });

  it("shouldTreatNullIdLikeAnAbsentIdInBothReaders [OBSERVED]", async () => {
    const w = await world([{ id: "a", day: 10, payload: payload(null, [section()]) }]);
    expect(await w.r5()).toEqual([]);
    expect((await w.path())[0]).toMatchObject({ course_id: null, format_error: "currentCourse: id is not a string" });
  });
});

describe("RG4 auxiliary snapshot carrying a valid Path", () => {
  const withAccount = (p: any) => ({ ...p, user: { id: 1000001, totalXp: 10, streak: 2, currentCourseId: "DUOLINGO_XA_EN" } });

  it("shouldStorePathButNoAccountObservationWhenSnapshotIsAuxiliary [OBSERVED]", async () => {
    const w = await world([
      { id: "n", day: 10, payload: withAccount(payload("DUOLINGO_XA_EN", [section()])) },
      { id: "x", day: 11, payload: withAccount(payload("DUOLINGO_XA_EN", [section()])), aux: true },
    ]);
    expect((await w.account()).map((r: any) => r.snapshot_id)).toEqual(["n"]); // aux never speaks for the account
    expect((await w.path()).map((r: any) => r.snapshot_id)).toEqual(["n", "x"]); // but its Path is stored
  });

  it("shouldLetAnAuxiliarySnapshotBeTheLatestObservationInR5 [PENDING-CONTRACT]", async () => {
    const w = await world([
      { id: "n", day: 10, payload: payload("DUOLINGO_XA_EN", [section({ completedUnits: 1 })]) },
      { id: "x", day: 12, payload: payload("DUOLINGO_XA_EN", [section({ completedUnits: 5 })]), aux: true },
    ]);
    // R5 has no is_auxiliary filter: the auxiliary snapshot defines "latest". Whether a Path may be attributed to a
    // course from an auxiliary snapshot is the open contract decision (Path observation vs course attribution).
    expect((await w.r5())[0]).toMatchObject({ latestObservedAt: at(12), deltaCompletedUnits: 4 });
  });

  it("shouldAttributeThePathToTheCourseOfCurrentCourseIdEvenWhenAuxiliaryDeclaresAnother [PENDING-CONTRACT]", async () => {
    const p = { ...payload("DUOLINGO_XB_EN", [section()]), user: { id: 1000001, currentCourseId: "DUOLINGO_XA_EN" } };
    const w = await world([{ id: "x", day: 10, payload: p, aux: true }]);
    expect((await w.path())[0].course_id).toBe("DUOLINGO_XB_EN"); // no relation check between declared and path course
  });
});

describe("RG5 R4 course entry whose `id` is not a string (found by reading d1TrajectoryAdapter.parseCourses)", () => {
  const withCourses = (xp: number) => ({ user: { id: 1000001 }, courses: [{ id: 123, courseId: "DUOLINGO_XA_EN", subject: "language", xp }, { id: "DUOLINGO_XB_EN", subject: "language", xp: 50 }] });

  it("shouldSkipTheEntryInR4ButStoreItUnderCourseIdWhenIdIsNumeric [OBSERVED]", async () => {
    const w = await world([{ id: "a", day: 10, payload: withCourses(100) }, { id: "b", day: 20, payload: withCourses(160) }]);
    // extractor: str(123) is null, so it falls back to `courseId`
    expect(await w.courses()).toEqual([
      { snapshot_id: "a", course_id: "DUOLINGO_XA_EN", xp: 100 }, { snapshot_id: "a", course_id: "DUOLINGO_XB_EN", xp: 50 },
      { snapshot_id: "b", course_id: "DUOLINGO_XA_EN", xp: 160 }, { snapshot_id: "b", course_id: "DUOLINGO_XB_EN", xp: 50 },
    ]);
    // R4: `typeof id === "string"` fails on 123 and `courseId` is never consulted, so XA is invisible to the trajectory
    const t = await w.r4();
    const seen = [...t.h1.courses, ...t.h2.courses].map((c: any) => c.courseId).concat([...(t.h1.nonComparable ?? []), ...(t.h2.nonComparable ?? [])].map((c: any) => c.courseId));
    expect(seen).toContain("DUOLINGO_XB_EN"); // control: the string-id course IS read, so the absence of XA is not an empty result
    expect(seen).not.toContain("DUOLINGO_XA_EN");
  });
});
