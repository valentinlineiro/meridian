import { describe, it, expect } from "vitest";
import { setupTestDb } from "../helpers/testDb.ts";
import { createD1TrajectoryAdapter } from "../../src/infrastructure/d1/d1TrajectoryAdapter.ts";
import { evaluateTrajectory, type LanguagesTrajectoryInput, type NonComparableCourse } from "../../src/domain/trajectory.ts";

// Amendment A6 (docs/contracts/2026-10-06-discarded-signals-contract.md §14), tests exigidos §14.9. Synthetic data only. They began as
// the E1 characterization tests of defect F2 and now state the approved contract. Course XP in a snapshot is LIFETIME XP.
const T0 = "2026-01-01T00:00:00.000Z", TMID = "2026-04-01T00:00:00.000Z", T1 = "2026-07-01T00:00:00.000Z";

type Snap = { at: string; courses: Array<{ id: string; xp: number }>; aux?: boolean };

function world(snaps: Snap[], activeXpDays = 0) {
  const { db, d1 } = setupTestDb();
  snaps.forEach((s, i) => {
    db.prepare(`INSERT INTO snapshots (id, created_at, source, user_id, raw_json, games_count, pages_count, checksum, size_bytes, is_auxiliary)
      VALUES (?, ?, 'duolingo-lang', 'u1', ?, 0, 0, ?, 100, ?)`)
      .run(`s${i}`, s.at, JSON.stringify({ courses: s.courses.map((c) => ({ ...c, subject: "language" })) }), `c${i}`, s.aux ? 1 : 0);
  });
  for (let d = 0; d < activeXpDays; d++) {
    db.prepare(`INSERT INTO xp_summaries (user_id, date, gained_xp, num_sessions, total_session_time, updated_at)
      VALUES ('u1', ?, 50, 1, 60, '2026-12-31')`).run(Math.floor(new Date(T0).getTime() / 1000) + d * 86400);
  }
  return createD1TrajectoryAdapter(d1);
}

const NO_GAMES = { whiteGames: 0, whiteDecided: 0, whiteWins: 0, blackGames: 0, blackDecided: 0, blackWins: 0 };
const evalLang = (languages: LanguagesTrajectoryInput) =>
  evaluateTrajectory({ chess: { startedAt: null, endedAt: null, totalGames: 0, activeDays: 0, ...NO_GAMES, h1: NO_GAMES, h2: NO_GAMES }, languages });
const nc = (o: Partial<NonComparableCourse> & Pick<NonComparableCourse, "courseId" | "state" | "boundXp">): NonComparableCourse => o;

describe("A6: a course gain needs two observations of the same course", () => {
  it("shouldComputeTheGainFromTheOwnObservationsOfACoursePresentInStartMidAndEnd", async () => {
    const d = await world([
      { at: T0, courses: [{ id: "A", xp: 1000 }, { id: "B", xp: 0 }] },
      { at: TMID, courses: [{ id: "A", xp: 6000 }, { id: "B", xp: 200 }] },
      { at: T1, courses: [{ id: "A", xp: 6500 }, { id: "B", xp: 8200 }] },
    ]).getLanguagesTrajectoryData("u1");
    expect(d.h1.courses).toEqual([{ courseId: "A", xp: 5000 }, { courseId: "B", xp: 200 }]);
    expect(d.h2.courses).toEqual([{ courseId: "A", xp: 500 }, { courseId: "B", xp: 8000 }]);
    expect(d.h1.nonComparable).toEqual([]);
  });

  it("shouldReportANewCourseWithItsFirstObservationAndNeverItsLifetimeXpAsGainWhenAbsentFromStart", async () => {
    const d = await world([
      { at: T0, courses: [{ id: "A", xp: 10000 }] },
      { at: TMID, courses: [{ id: "A", xp: 10100 }, { id: "B", xp: 4000 }] },
      { at: T1, courses: [{ id: "A", xp: 10100 }, { id: "B", xp: 4000 }] },
    ]).getLanguagesTrajectoryData("u1");
    expect(d.h1.courses).toEqual([{ courseId: "A", xp: 100 }]);
    expect(d.h1.nonComparable).toEqual([{ courseId: "B", state: "new_course", boundXp: 4000, firstObservedAt: TMID }]);
  });

  it("shouldGiveTheSameTreatmentToAPreexistingAndANewCourseOnlyWhenEachHasItsOwnObservations", async () => {
    const d = await world([
      { at: T0, courses: [{ id: "OLD", xp: 4000 }] },
      { at: TMID, courses: [{ id: "OLD", xp: 4000 }, { id: "NEW", xp: 4000 }] },
      { at: T1, courses: [{ id: "OLD", xp: 4000 }, { id: "NEW", xp: 4000 }] },
    ]).getLanguagesTrajectoryData("u1");
    expect(d.h1.courses).toEqual([]); // OLD observed gain is 0; NEW has no gain
    expect(d.h1.nonComparable!.map((c) => c.courseId)).toEqual(["NEW"]);
    expect(d.h2.courses).toEqual([]);
    expect(d.h2.nonComparable).toEqual([]); // both observed in both ends of H2: an observed 0, comparable
  });

  it("shouldKeepACourseAbsentFromMidUnknownInTheHalfInsteadOfPushingItsGainIntoTheNextOne", async () => {
    const d = await world([
      { at: T0, courses: [{ id: "A", xp: 1000 }, { id: "B", xp: 0 }] },
      { at: TMID, courses: [{ id: "B", xp: 10 }] },
      { at: T1, courses: [{ id: "A", xp: 3000 }, { id: "B", xp: 10 }] },
    ]).getLanguagesTrajectoryData("u1");
    expect(d.h1.nonComparable).toContainEqual({ courseId: "A", state: "unknown", reason: "not_observed_in_period", boundXp: 2000 });
    expect(d.h1.courses.find((c) => c.courseId === "A")).toBeUndefined();
  });

  it("shouldReportAnExplicitDiscontinuityInsteadOfAnEmptyResultWhenCumulativeXpFalls", async () => {
    const d = await world([
      { at: T0, courses: [{ id: "A", xp: 5000 }] },
      { at: TMID, courses: [{ id: "A", xp: 4000 }] },
      { at: T1, courses: [{ id: "A", xp: 6000 }] },
    ]).getLanguagesTrajectoryData("u1");
    expect(d.h1.courses).toEqual([]);
    expect(d.h1.nonComparable).toEqual([{
      courseId: "A", state: "discontinuity", reason: "non_monotonic", boundXp: null,
      discontinuity: { fromAt: T0, toAt: TMID, xpBefore: 5000, xpAfter: 4000 },
    }]);
    // measured from an observation AFTER the drop, the later gain is comparable
    expect(d.h2.courses).toEqual([{ courseId: "A", xp: 2000 }]);
  });

  it("shouldNotLetAnAuxiliarySnapshotWithAPartialCatalogHideTheGainOfACourseItDoesNotCarry", async () => {
    const d = await world([
      { at: T0, courses: [{ id: "A", xp: 0 }, { id: "B", xp: 0 }] },
      { at: TMID, courses: [{ id: "A", xp: 500 }, { id: "B", xp: 0 }] },
      { at: T1, courses: [{ id: "A", xp: 5000 }, { id: "B", xp: 100 }] },
      { at: "2026-07-01T00:30:00.000Z", courses: [{ id: "B", xp: 100 }], aux: true },
    ]).getLanguagesTrajectoryData("u1");
    expect(d.h2.courses).toContainEqual({ courseId: "A", xp: 4500 }); // A's last observation is the account snapshot
    expect(d.endedAt).toBe("2026-07-01T00:30:00.000Z"); // an auxiliary snapshot is still an observation: no is_auxiliary filter
  });

  it("shouldReturnEveryCourseAsUnknownWhenOnlyOneSnapshotExistsInsteadOfEmptyHalvesWithNoExplanation", async () => {
    const d = await world([{ at: T0, courses: [{ id: "A", xp: 100 }] }]).getLanguagesTrajectoryData("u1");
    expect(d.h1.courses).toEqual([]);
    expect(d.h1.nonComparable).toEqual([{ courseId: "A", state: "unknown", reason: "not_observed_in_period", boundXp: null }]);
  });

  it("shouldNotEmitAFocusShiftBetweenCoursesThatGainedNothingWhenTheyAreFirstSeenAtMidAndEnd", async () => {
    // Before A6 this emitted "focus moved from B to C" although only A moved (+100).
    const d = await world(
      [
        { at: T0, courses: [{ id: "A", xp: 10000 }] },
        { at: TMID, courses: [{ id: "A", xp: 10100 }, { id: "B", xp: 4000 }] },
        { at: T1, courses: [{ id: "A", xp: 10100 }, { id: "B", xp: 4000 }, { id: "C", xp: 3000 }] },
      ],
      70
    ).getLanguagesTrajectoryData("u1");
    const out = evalLang(d);
    expect(out.findings.some((f) => f.type === "LANG_FOCUS_SHIFT_LONGITUDINAL")).toBe(false);
    expect(out.evaluations.some((e) => e.id === "LANG_FOCUS_SHIFT_LONGITUDINAL")).toBe(false);
  });
});

describe("A6 P3: the rule does not emit when the comparable evidence cannot determine the shift without bias", () => {
  // B dominates H1 (5000 of 6000), C dominates H2 (5000 of 5500): a shift, over 120 days and 70 active days.
  const base = (o: { h1?: NonComparableCourse[]; h2?: NonComparableCourse[] } = {}): LanguagesTrajectoryInput => ({
    startedAt: T0, endedAt: T1, activeDays: 70,
    h1: { courses: [{ courseId: "B", xp: 5000 }, { courseId: "A", xp: 1000 }], nonComparable: o.h1 ?? [] },
    h2: { courses: [{ courseId: "C", xp: 5000 }, { courseId: "A", xp: 500 }], nonComparable: o.h2 ?? [] },
  });
  const shift = (l: LanguagesTrajectoryInput) => evalLang(l).findings.find((f) => f.type === "LANG_FOCUS_SHIFT_LONGITUDINAL");

  it("shouldEmitAndDeclareTheExcludedCourseWhenANewCourseCannotChangeTheConclusion", () => {
    const f = shift(base({ h1: [nc({ courseId: "NEW", state: "new_course", boundXp: 100 })] }))!;
    expect(f).toBeDefined();
    expect(f.metrics).toMatchObject({ previousCourseId: "B", newCourseId: "C", excludedCourses: [{ courseId: "NEW", state: "new_course", boundXp: 100 }] });
    expect((f.metrics as any).h1PreviousCourseXp).toBe(5000); // the new course's lifetime XP is not in the shares
  });

  it("shouldNotEmitWhenANewCourseCouldHaveGainedEnoughToChangeTheConclusion", () => {
    expect(shift(base({ h1: [nc({ courseId: "NEW", state: "new_course", boundXp: 10_000 })] }))).toBeUndefined();
  });

  it("shouldNotEmitWhenAnUnknownCourseHasNoBoundAndCouldChangeTheConclusion", () => {
    expect(shift(base({ h2: [nc({ courseId: "X", state: "unknown", reason: "not_observed_in_period", boundXp: null })] }))).toBeUndefined();
  });

  it("shouldNotEmitWhenADiscontinuityCouldChangeTheConclusion", () => {
    expect(shift(base({ h2: [nc({ courseId: "A", state: "discontinuity", reason: "non_monotonic", boundXp: null })] }))).toBeUndefined();
  });

  it("shouldNotRenormalizeTheSharesNorProduceAnEvaluationWhenTheRuleStaysUnevaluated", () => {
    const out = evalLang(base({ h1: [nc({ courseId: "NEW", state: "new_course", boundXp: 100 })] }));
    const m = out.findings[0]!.metrics as any;
    expect(m.h1PreviousCourseShare).toBeCloseTo((5000 / 6000) * 100, 5); // over the comparable courses only, declared as excluded
    expect(out.evaluations.some((e) => e.id === "LANG_FOCUS_SHIFT_LONGITUDINAL")).toBe(false); // still SIN EVALUAR
  });
});
