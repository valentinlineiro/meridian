import { describe, it, expect } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { CALIBRATION, parseCalibration, eloVerdict, xpVerdict, edgeCriteria, ELO_GRID, XP_GRID } from "../src/domain/calibration.ts";
import { evaluateChanges } from "../src/domain/whatChanged.ts";
import artefact from "../src/domain/calibration-elo-xp.json";
import { ADMITTED, withAdmitted } from "./fixtures/calibration.ts";

const clone = () => JSON.parse(JSON.stringify(artefact));
const allEdges = () => Object.values(CALIBRATION.elo.edges).flatMap((byK) => Object.values(byK!));

describe("calibration artefact (A7)", () => {
  it("shouldAdmitNoEdgeAndNoXpWindowWithTheShippedArtefact", () => {
    // the state of the design (PR #106): no ELO edge passes the stability criteria, XP is uncalibrated
    expect(allEdges().length).toBe(16);
    expect(allEdges().some((e) => e.admitted)).toBe(false);
    expect(Object.values(CALIBRATION.xp.edges).flatMap((m) => Object.values(m!))).toEqual([]);
    for (const k of ELO_GRID) for (const d of [-200, 0, 200]) expect(eloVerdict(d, k)).toEqual({ available: false });
    for (const w of XP_GRID) expect(xpVerdict(5, w)).toEqual({ available: false });
  });

  it("shouldKeepTheBoundAndTheUncertaintyOfEveryEdgeEvenWhenNotAdmitted", () => {
    for (const e of allEdges()) { expect(Number.isFinite(e.bound)).toBe(true); expect(e.uncertainty).toBeGreaterThan(0); }
  });

  it("shouldCarryTheLimitsAndUncertaintyOfEveryEdgeInTheCriteriaOfTheEvaluation (contract 15.2.5)", () => {
    const c = edgeCriteria("elo", 10, CALIBRATION);
    expect(c).toMatchObject({ calibratedThrough: "2026-11-05", upper95: 74, upper95Uncertainty: 0.18, upper95Admitted: 0, lower99Admitted: 0 });
    expect(Object.keys(c).filter((n) => n.endsWith("Uncertainty")).length).toBe(4);
    expect(edgeCriteria("elo", null, CALIBRATION)).toEqual({ calibratedThrough: "2026-11-05" });
    const d: any = { chess: { gamesCount: 40, decidedCount: 40, ratingDelta: 50, ratingGames: 10, baselineRating: 1, currentRating: 2, intervalWinRate: 50, intervalWhiteWinRate: 50, intervalBlackWinRate: 50, historicalWinRateDelta: null, colorDelta: null, historicalDelta: null },
      languages: { intervalDays: 7, observedDays: 1, partialDaysExcluded: 0, historicalObservedDays: 1, historicalSpanDays: null, historicalSpanStart: null, xpGained: 1, sessionsCount: 1, totalSessionMinutes: 1, baselineCourseId: null, currentCourseId: null, courseChanged: false, dailyXpRate: 1, historicalDailyXpRate: 1 },
      streak: { baselineStreak: null, currentStreak: null, streakDelta: null, status: "active", streakStarted: false, streakMilestone: null } };
    const ev = evaluateChanges(d, { userId: "u", baselineAt: "a", until: "b" }).evaluations.find((e) => e.id === "CHESS_RATING_JUMP")!;
    expect(ev.criteria).toMatchObject({ kMax: 20, calibratedThrough: "2026-11-05", upper95: 74, upper95Uncertainty: 0.18, upper95Admitted: 0, lower95: -62 });
    const admitted = evaluateChanges(d, { userId: "u", baselineAt: "a", until: "b" }, ADMITTED).evaluations.find((e) => e.id === "CHESS_RATING_JUMP")!;
    expect(admitted.criteria).toMatchObject({ upper95: 74, upper95Admitted: 1, lower95: -62, lower95Admitted: 1 });
  });

  it("shouldUseOnlyAdmittedEdgesWhenDeciding", () => {
    const c = withAdmitted({ upper95: { 10: 74 } });
    expect(eloVerdict(75, 10, c)).toMatchObject({ available: true, relevant: true, upper: 74 });
    expect(eloVerdict(-500, 10, c)).toEqual({ available: false }); // the lower edge is not admitted
    expect(eloVerdict(75, 15, c)).toEqual({ available: false }); // nor is k = 15
  });

  it("shouldRejectAnArtefactOutsideTheValidatedGrid", () => {
    let a = clone(); a.elo.admitted.upper95 = [7];
    expect(() => parseCalibration(a)).toThrow(/outside the validated grid/);
    a = clone(); a.elo.edges.upper95["25"] = { bound: 200, uncertainty: 0.1 };
    expect(() => parseCalibration(a)).toThrow(/outside the validated grid/);
    a = clone(); a.elo.grid = [5, 10, 15, 20, 25];
    expect(() => parseCalibration(a)).toThrow(/grid must be/);
    a = clone(); a.xp.edges.upper95["5"] = { bound: 1.5, uncertainty: 0.1 };
    expect(() => parseCalibration(a)).toThrow(/outside the validated grid/);
    a = clone(); a.xp.admitted.upper95 = [14];
    expect(() => parseCalibration(a)).toThrow(/has no edge/);
  });

  it("shouldRejectIncoherentOrNonNumericEdges", () => {
    let a = clone(); a.elo.edges.upper99["10"].bound = a.elo.edges.upper95["10"].bound - 1;
    expect(() => parseCalibration(a)).toThrow(/upper99 < upper95/);
    a = clone(); a.elo.edges.lower99["10"].bound = a.elo.edges.lower95["10"].bound + 1;
    expect(() => parseCalibration(a)).toThrow(/lower99 > lower95/);
    a = clone(); a.elo.edges.lower95["10"].bound = a.elo.edges.upper95["10"].bound + 1;
    expect(() => parseCalibration(a)).toThrow(/lower95 >= upper95/);
    a = clone(); a.elo.edges.upper95["10"].bound = "74";
    expect(() => parseCalibration(a)).toThrow(/numeric bound/);
    a = clone(); a.elo.edges.upper95["10"].uncertainty = -0.1;
    expect(() => parseCalibration(a)).toThrow(/non-negative uncertainty/);
    a = clone(); a.xp.edges.upper95["7"] = { bound: 2, uncertainty: 0.1 }; a.xp.edges.upper99["7"] = { bound: 1.5, uncertainty: 0.1 };
    expect(() => parseCalibration(a)).toThrow(/xp upper99 < upper95/);
    expect(() => parseCalibration({})).toThrow(/malformed/);
  });

  it("shouldNeverCalibrateBeyondKMax", () => {
    expect(eloVerdict(500, 21, ADMITTED)).toEqual({ available: false });
    expect(eloVerdict(500, 15, ADMITTED)).toMatchObject({ available: true, relevant: true, level: "exceptional" });
  });

  it("shouldMatchWhatTheGeneratorProducesFromTheVersionedExplorationOutput", () => {
    if (spawnSync("python3", ["--version"]).status !== 0) return; // no interpreter: skipped
    expect(execFileSync("python3", ["-I", "docs/audits/calibration-elo-xp/make_artifact.py", "--check"]).toString()).toContain("OK");
  });
});
