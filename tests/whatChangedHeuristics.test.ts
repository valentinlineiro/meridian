import { describe, it, expect } from "vitest";
import { evaluateSignificantChanges, type WhatChangedDeltas, type FindingContext } from "../src/domain/whatChanged.ts";

describe("What Changed Domain Heuristics", () => {
  const baseContext: FindingContext = {
    userId: "1000001",
    baselineAt: "2026-09-24T00:00:00.000Z",
    until: "2026-10-01T00:00:00.000Z",
  };

  const emptyDeltas: WhatChangedDeltas = {
    chess: {
      gamesCount: 0,
      ratingDelta: 0,
      baselineRating: 800,
      currentRating: 800,
      intervalWinRate: null,
      intervalWhiteWinRate: null,
      intervalBlackWinRate: null,
      historicalWinRateDelta: null,
    },
    languages: {
      intervalDays: 7,
      xpGained: 0,
      sessionsCount: 0,
      totalSessionMinutes: 0,
      baselineCourseId: "DUOLINGO_XA_EN",
      currentCourseId: "DUOLINGO_XA_EN",
      courseChanged: false,
      dailyXpRate: 0,
      historicalDailyXpRate: 50,
    },
    streak: {
      baselineStreak: 100,
      currentStreak: 107,
      streakDelta: 7,
      status: "active",
      streakStarted: false,
      streakMilestone: null,
    },
  };

  it("shouldReturnEmptyFindingsWhenNoSignificantChangeOccurs", () => {
    const findings = evaluateSignificantChanges(emptyDeltas, baseContext);
    expect(findings).toEqual([]);
  });

  it("shouldEmitChessRatingJumpFindingWhenEloDeltaExceedsThreshold", () => {
    const deltas: WhatChangedDeltas = {
      ...emptyDeltas,
      chess: {
        ...emptyDeltas.chess,
        gamesCount: 8,
        ratingDelta: 35,
        baselineRating: 800,
        currentRating: 835,
      },
    };
    const findings = evaluateSignificantChanges(deltas, baseContext);
    const finding = findings.find((f) => f.id === "CHESS_RATING_JUMP");
    expect(finding).toBeDefined();
    expect(finding?.category).toBe("chess");
    expect(finding?.claim).toContain("+35");
    expect(finding?.baselineAt).toBe(baseContext.baselineAt);
    expect(finding?.until).toBe(baseContext.until);
  });

  it("shouldEmitColorAsymmetryFindingWhenTenGamesPlayedAndAsymmetryExceeds15Points", () => {
    const deltas: WhatChangedDeltas = {
      ...emptyDeltas,
      chess: {
        ...emptyDeltas.chess,
        gamesCount: 12,
        intervalWhiteWinRate: 75.0,
        intervalBlackWinRate: 40.0,
      },
    };
    const findings = evaluateSignificantChanges(deltas, baseContext);
    const finding = findings.find((f) => f.id === "CHESS_COLOR_ASYMMETRY");
    expect(finding).toBeDefined();
    expect(finding?.category).toBe("chess");
    expect(finding?.claim).toContain("blancas");
  });

  it("shouldEmitActiveCourseSwitchFindingWhenActiveCourseChanges", () => {
    const deltas: WhatChangedDeltas = {
      ...emptyDeltas,
      languages: {
        ...emptyDeltas.languages,
        baselineCourseId: "DUOLINGO_XA_EN",
        currentCourseId: "DUOLINGO_XB_EN",
        courseChanged: true,
      },
    };
    const findings = evaluateSignificantChanges(deltas, baseContext);
    const finding = findings.find((f) => f.id === "LANG_ACTIVE_COURSE_SWITCH");
    expect(finding).toBeDefined();
    expect(finding?.category).toBe("languages");
    expect(finding?.claim).toContain("DUOLINGO_XB_EN");
  });

  it("shouldEmitXpAccelerationFindingWhenIntervalDailyRateExceedsBaselineByThirtyPercent", () => {
    const deltas: WhatChangedDeltas = {
      ...emptyDeltas,
      languages: {
        ...emptyDeltas.languages,
        xpGained: 500,
        dailyXpRate: 100,
        historicalDailyXpRate: 50,
      },
    };
    const findings = evaluateSignificantChanges(deltas, baseContext);
    const finding = findings.find((f) => f.id === "LANG_XP_ACCELERATION");
    expect(finding).toBeDefined();
    expect(finding?.category).toBe("languages");
    expect(finding?.claim).toContain("Aceleración");
  });

  it("shouldNotEmitXpAccelerationFindingWhenIntervalDurationIsLessThanThreeDays", () => {
    const deltas: WhatChangedDeltas = {
      ...emptyDeltas,
      languages: {
        ...emptyDeltas.languages,
        intervalDays: 2.5,
        xpGained: 500,
        dailyXpRate: 200,
        historicalDailyXpRate: 50,
      },
    };
    const findings = evaluateSignificantChanges(deltas, baseContext);
    const finding = findings.find((f) => f.id === "LANG_XP_ACCELERATION");
    expect(finding).toBeUndefined();
  });

  it("shouldEmitStreakMilestoneFindingWhenMilestoneCrossed", () => {
    const deltas: WhatChangedDeltas = {
      ...emptyDeltas,
      streak: {
        ...emptyDeltas.streak,
        streakMilestone: 1100,
      },
    };
    const findings = evaluateSignificantChanges(deltas, baseContext);
    const finding = findings.find((f) => f.id === "STREAK_MILESTONE");
    expect(finding).toBeDefined();
    expect(finding?.category).toBe("streak");
    expect(finding?.claim).toContain("1100");
  });

  it("shouldEmitStreakBrokenFindingWhenStreakStatusIsBroken", () => {
    const deltas: WhatChangedDeltas = {
      ...emptyDeltas,
      streak: {
        ...emptyDeltas.streak,
        status: "broken",
        baselineStreak: 1050,
        currentStreak: 0,
      },
    };
    const findings = evaluateSignificantChanges(deltas, baseContext);
    const finding = findings.find((f) => f.id === "STREAK_BROKEN");
    expect(finding).toBeDefined();
    expect(finding?.category).toBe("streak");
    expect(finding?.claim).toContain("interrumpida");
  });
});
