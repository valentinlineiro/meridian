import { describe, it, expect } from "vitest";
import {
  evaluateTrajectoryPatterns,
  type TrajectoryInput,
} from "../src/domain/trajectory.ts";

function createEmptyInput(): TrajectoryInput {
  return {
    chess: {
      startedAt: null,
      endedAt: null,
      totalGames: 0,
      activeDays: 0,
      whiteGames: 0, whiteDecided: 0,
      whiteWins: 0,
      blackGames: 0, blackDecided: 0,
      blackWins: 0,
      h1: { whiteGames: 0, whiteDecided: 0, whiteWins: 0, blackGames: 0, blackDecided: 0, blackWins: 0 },
      h2: { whiteGames: 0, whiteDecided: 0, blackGames: 0, blackDecided: 0, whiteWins: 0, blackWins: 0 },
    },
    languages: {
      startedAt: null,
      endedAt: null,
      activeDays: 0,
      h1: { courses: [] },
      h2: { courses: [] },
    },
  };
}

describe("trajectoryHeuristics", () => {
  describe("CHESS_COLOR_ASYMMETRY_LONGITUDINAL", () => {
    it("shouldEmitFindingWhenAsymmetryIsPersistentAcrossBothEras", () => {
      // CH-P1: 80 white (75% WR), 80 black (50% WR), span >= 60d
      const input = createEmptyInput();
      input.chess = {
        startedAt: "2026-05-01T00:00:00.000Z",
        endedAt: "2026-09-01T00:00:00.000Z", // 123 days span
        totalGames: 160,
        activeDays: 75,
        whiteGames: 80, whiteDecided: 80,
        whiteWins: 60, // 75%
        blackGames: 80, blackDecided: 80,
        blackWins: 40, // 50%
        h1: {
          whiteGames: 40, whiteDecided: 40,
          whiteWins: 30, // 75%
          blackGames: 40, blackDecided: 40,
          blackWins: 20, // 50% (+25 pp)
        },
        h2: {
          whiteGames: 40, whiteDecided: 40,
          whiteWins: 30, // 75%
          blackGames: 40, blackDecided: 40,
          blackWins: 20, // 50% (+25 pp)
        },
      };

      const findings = evaluateTrajectoryPatterns(input);
      expect(findings).toHaveLength(1);
      const f = findings[0]!;
      expect(f.type).toBe("CHESS_COLOR_ASYMMETRY_LONGITUDINAL");
      expect(f.category).toBe("chess");
      expect(f.temporalSpan.totalDays).toBeGreaterThanOrEqual(60);
      expect(f.sample).toEqual({ gamesCount: 160, decidedCount: 160 });
      if ("diffPp" in f.metrics) {
        expect(f.metrics.diffPp).toBe(25);
        expect(f.metrics.dominantColor).toBe("white");
        expect(f.metrics.h1DiffPp).toBe(25);
        expect(f.metrics.h2DiffPp).toBe(25);
      }
    });

    it("shouldEmitFindingWhenBlackColorAsymmetryIsPersistentAcrossBothEras", () => {
      const input = createEmptyInput();
      input.chess = {
        startedAt: "2026-05-01T00:00:00.000Z",
        endedAt: "2026-09-01T00:00:00.000Z",
        totalGames: 160,
        activeDays: 75,
        whiteGames: 80, whiteDecided: 80,
        whiteWins: 40, // 50%
        blackGames: 80, blackDecided: 80,
        blackWins: 60, // 75% -> black +25 pp
        h1: {
          whiteGames: 40, whiteDecided: 40,
          whiteWins: 20, // 50%
          blackGames: 40, blackDecided: 40,
          blackWins: 30, // 75% -> -25 pp
        },
        h2: {
          whiteGames: 40, whiteDecided: 40,
          whiteWins: 20, // 50%
          blackGames: 40, blackDecided: 40,
          blackWins: 30, // 75% -> -25 pp
        },
      };

      const findings = evaluateTrajectoryPatterns(input);
      expect(findings).toHaveLength(1);
      const f = findings[0]!;
      expect(f.type).toBe("CHESS_COLOR_ASYMMETRY_LONGITUDINAL");
      expect(f.category).toBe("chess");
      if ("diffPp" in f.metrics) {
        expect(f.metrics.diffPp).toBe(25);
        expect(f.metrics.dominantColor).toBe("black");
        expect(f.metrics.h1DiffPp).toBe(25);
        expect(f.metrics.h2DiffPp).toBe(25);
      }
    });

    it("shouldStaySilentWhenAsymmetryIsConcentratedOnlyInRecentEra", () => {
      // CH-N1: H1 difference is only +2.5 pp, recent H2 is +37.5 pp
      const input = createEmptyInput();
      input.chess = {
        startedAt: "2026-05-01T00:00:00.000Z",
        endedAt: "2026-09-01T00:00:00.000Z",
        totalGames: 160,
        activeDays: 75,
        whiteGames: 80, whiteDecided: 80,
        whiteWins: 56, // 70%
        blackGames: 80, blackDecided: 80,
        blackWins: 40, // 50% -> global +20 pp
        h1: {
          whiteGames: 40, whiteDecided: 40,
          whiteWins: 21, // 52.5%
          blackGames: 40, blackDecided: 40,
          blackWins: 20, // 50.0% -> +2.5 pp (< 10 pp)
        },
        h2: {
          whiteGames: 40, whiteDecided: 40,
          whiteWins: 35, // 87.5%
          blackGames: 40, blackDecided: 40,
          blackWins: 20, // 50.0% -> +37.5 pp
        },
      };

      const findings = evaluateTrajectoryPatterns(input);
      expect(findings.filter((f) => f.type === "CHESS_COLOR_ASYMMETRY_LONGITUDINAL")).toHaveLength(0);
    });

    it("shouldStaySilentWhenDirectionOfAsymmetryInvertsBetweenEras", () => {
      // CH-N2: global +17.5 pp, but H1 was -15 pp (black favored)
      const input = createEmptyInput();
      input.chess = {
        startedAt: "2026-05-01T00:00:00.000Z",
        endedAt: "2026-09-01T00:00:00.000Z",
        totalGames: 160,
        activeDays: 70,
        whiteGames: 80, whiteDecided: 80,
        whiteWins: 52, // 65%
        blackGames: 80, blackDecided: 80,
        blackWins: 38, // 47.5% -> global +17.5 pp
        h1: {
          whiteGames: 40, whiteDecided: 40,
          whiteWins: 18, // 45%
          blackGames: 40, blackDecided: 40,
          blackWins: 24, // 60% -> -15 pp (inverted)
        },
        h2: {
          whiteGames: 40, whiteDecided: 40,
          whiteWins: 34, // 85%
          blackGames: 40, blackDecided: 40,
          blackWins: 14, // 35% -> +50 pp
        },
      };

      const findings = evaluateTrajectoryPatterns(input);
      expect(findings.filter((f) => f.type === "CHESS_COLOR_ASYMMETRY_LONGITUDINAL")).toHaveLength(0);
    });

    it("shouldStaySilentWhenTotalGamesPerColorIsInsufficient", () => {
      // CH-N3: < 40 games per color
      const input = createEmptyInput();
      input.chess = {
        startedAt: "2026-05-01T00:00:00.000Z",
        endedAt: "2026-08-01T00:00:00.000Z",
        totalGames: 50,
        activeDays: 65,
        whiteGames: 25, whiteDecided: 25,
        whiteWins: 20,
        blackGames: 25, blackDecided: 25,
        blackWins: 10,
        h1: { whiteGames: 12, whiteDecided: 12, whiteWins: 10, blackGames: 12, blackDecided: 12, blackWins: 5 },
        h2: { whiteGames: 13, whiteDecided: 13, whiteWins: 10, blackGames: 13, blackDecided: 13, blackWins: 5 },
      };

      const findings = evaluateTrajectoryPatterns(input);
      expect(findings.filter((f) => f.type === "CHESS_COLOR_ASYMMETRY_LONGITUDINAL")).toHaveLength(0);
    });

    it("shouldStaySilentWhenActiveDaysAreLessThanSixtyDays", () => {
      // CH-N4: 100 games played over only 15 active days
      const input = createEmptyInput();
      input.chess = {
        startedAt: "2026-05-01T00:00:00.000Z",
        endedAt: "2026-05-15T00:00:00.000Z",
        totalGames: 100,
        activeDays: 15,
        whiteGames: 50, whiteDecided: 50,
        whiteWins: 40,
        blackGames: 50, blackDecided: 50,
        blackWins: 20,
        h1: { whiteGames: 25, whiteDecided: 25, whiteWins: 20, blackGames: 25, blackDecided: 25, blackWins: 10 },
        h2: { whiteGames: 25, whiteDecided: 25, whiteWins: 20, blackGames: 25, blackDecided: 25, blackWins: 10 },
      };

      const findings = evaluateTrajectoryPatterns(input);
      expect(findings.filter((f) => f.type === "CHESS_COLOR_ASYMMETRY_LONGITUDINAL")).toHaveLength(0);
    });
  });

  describe("LANG_FOCUS_SHIFT_LONGITUDINAL", () => {
    it("shouldEmitFindingWhenDominantFocusCourseShiftsSubstantiallyBetweenEras", () => {
      // LG-P1: 180d span, 110 active days, FR 85% in H1 -> RU 80% in H2
      const input = createEmptyInput();
      input.languages = {
        startedAt: "2026-03-01T00:00:00.000Z",
        endedAt: "2026-09-01T00:00:00.000Z",
        activeDays: 110,
        h1: {
          courses: [
            { courseId: "DUOLINGO_XC_EN", xp: 8500 }, // ~89.5%
            { courseId: "DUOLINGO_XB_EN", xp: 1000 },
          ],
        },
        h2: {
          courses: [
            { courseId: "DUOLINGO_XC_EN", xp: 1000 }, // ~9.1%
            { courseId: "DUOLINGO_XB_EN", xp: 10000 }, // ~90.9%
          ],
        },
      };

      const findings = evaluateTrajectoryPatterns(input);
      expect(findings).toHaveLength(1);
      const f = findings[0]!;
      expect(f.type).toBe("LANG_FOCUS_SHIFT_LONGITUDINAL");
      expect(f.category).toBe("languages");
      expect(f.sample).toEqual({ xpTotal: 20500 });
      if ("previousCourseId" in f.metrics) {
        expect(f.metrics.previousCourseId).toBe("DUOLINGO_XC_EN");
        expect(f.metrics.newCourseId).toBe("DUOLINGO_XB_EN");
        expect(f.metrics.h1PreviousCourseShare).toBeGreaterThanOrEqual(60);
        expect(f.metrics.h2NewCourseShare).toBeGreaterThanOrEqual(60);
        expect(f.metrics.h2PreviousCourseShare).toBeLessThanOrEqual(25);
      }
    });

    it("shouldStaySilentWhenActivityIsEquallyDistributedBetweenCoursesWithoutClearDominance", () => {
      // LG-N1: FR ~50%, RU ~50% in both eras
      const input = createEmptyInput();
      input.languages = {
        startedAt: "2026-03-01T00:00:00.000Z",
        endedAt: "2026-09-01T00:00:00.000Z",
        activeDays: 100,
        h1: {
          courses: [
            { courseId: "DUOLINGO_XC_EN", xp: 5200 },
            { courseId: "DUOLINGO_XB_EN", xp: 4800 },
          ],
        },
        h2: {
          courses: [
            { courseId: "DUOLINGO_XC_EN", xp: 4600 },
            { courseId: "DUOLINGO_XB_EN", xp: 5400 },
          ],
        },
      };

      const findings = evaluateTrajectoryPatterns(input);
      expect(findings.filter((f) => f.type === "LANG_FOCUS_SHIFT_LONGITUDINAL")).toHaveLength(0);
    });

    it("shouldStaySilentWhenPreviousCourseIsNotSubstantiallyReplaced", () => {
      // LG-N2: FR 90% in H1, then in H2 both FR and RU are 45% (diversified, not replaced)
      const input = createEmptyInput();
      input.languages = {
        startedAt: "2026-03-01T00:00:00.000Z",
        endedAt: "2026-09-01T00:00:00.000Z",
        activeDays: 100,
        h1: {
          courses: [
            { courseId: "DUOLINGO_XC_EN", xp: 9000 },
            { courseId: "DUOLINGO_XB_EN", xp: 1000 },
          ],
        },
        h2: {
          courses: [
            { courseId: "DUOLINGO_XC_EN", xp: 4500 },
            { courseId: "DUOLINGO_XB_EN", xp: 4500 },
          ],
        },
      };

      const findings = evaluateTrajectoryPatterns(input);
      expect(findings.filter((f) => f.type === "LANG_FOCUS_SHIFT_LONGITUDINAL")).toHaveLength(0);
    });

    it("shouldStaySilentWhenNewCourseDoesNotConsolidateDominanceInSecondEra", () => {
      // LG-N3: Streak in last week of RU, but throughout H2 (90 days) FR maintains 65% of XP
      const input = createEmptyInput();
      input.languages = {
        startedAt: "2026-03-01T00:00:00.000Z",
        endedAt: "2026-09-01T00:00:00.000Z",
        activeDays: 100,
        h1: {
          courses: [
            { courseId: "DUOLINGO_XC_EN", xp: 9000 },
            { courseId: "DUOLINGO_XB_EN", xp: 1000 },
          ],
        },
        h2: {
          courses: [
            { courseId: "DUOLINGO_XC_EN", xp: 6500 }, // 65%
            { courseId: "DUOLINGO_XB_EN", xp: 3500 }, // 35% (< 60%)
          ],
        },
      };

      const findings = evaluateTrajectoryPatterns(input);
      expect(findings.filter((f) => f.type === "LANG_FOCUS_SHIFT_LONGITUDINAL")).toHaveLength(0);
    });

    it("shouldStaySilentWhenCourseMassIsLessThanTwoThousandXp", () => {
      // LG-N4: 120 days, high shares, but only 1200 XP and 1400 XP
      const input = createEmptyInput();
      input.languages = {
        startedAt: "2026-03-01T00:00:00.000Z",
        endedAt: "2026-09-01T00:00:00.000Z",
        activeDays: 80,
        h1: {
          courses: [
            { courseId: "DUOLINGO_XC_EN", xp: 1200 }, // < 2000 XP
          ],
        },
        h2: {
          courses: [
            { courseId: "DUOLINGO_XB_EN", xp: 1400 }, // < 2000 XP
          ],
        },
      };

      const findings = evaluateTrajectoryPatterns(input);
      expect(findings.filter((f) => f.type === "LANG_FOCUS_SHIFT_LONGITUDINAL")).toHaveLength(0);
    });

    it("shouldStaySilentWhenTemporalSpanIsLessThanNinetyDays", () => {
      const input = createEmptyInput();
      input.languages = {
        startedAt: "2026-08-01T00:00:00.000Z",
        endedAt: "2026-09-15T00:00:00.000Z", // 45 days span (< 90)
        activeDays: 40,
        h1: {
          courses: [{ courseId: "DUOLINGO_XC_EN", xp: 5000 }],
        },
        h2: {
          courses: [{ courseId: "DUOLINGO_XB_EN", xp: 5000 }],
        },
      };

      const findings = evaluateTrajectoryPatterns(input);
      expect(findings.filter((f) => f.type === "LANG_FOCUS_SHIFT_LONGITUDINAL")).toHaveLength(0);
    });
  });
});
