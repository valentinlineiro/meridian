import { describe, it, expect } from "vitest";
import {
  calculateActivity,
  calculateIntensity,
  calculateWeeklyProfile,
  calculateCourseConcentration,
  calculateCurriculumState,
  compareCurriculumSnapshots,
  buildLanguagesAnalytics,
} from "../src/analytics/languages/index.ts";
import type {
  XpSummaryInput,
  CourseInput,
  SectionInput,
  CurriculumSnapshotInput,
} from "../src/analytics/languages/types.ts";

describe("Languages Analytics Contract - Activity", () => {
  it("shouldReturnZerosForEmptySummaries", () => {
    const res = calculateActivity([]);
    expect(res.activeDays).toBe(0);
    expect(res.calendarDays).toBe(0);
    expect(res.activityDensity).toBe(0);
    expect(res.totalSessions).toBe(0);
    expect(res.totalReportedSeconds).toBe(0);
  });

  it("shouldComputeActivityDensityAndOrderStatisticsAccurately", () => {
    // 3 days: Day 0 (active), Day 1 (inactive 0 XP), Day 2 (active)
    const summaries: XpSummaryInput[] = [
      { date: 1700000000, gainedXp: 100, numSessions: 2, totalSessionTime: 120 },
      { date: 1700086400, gainedXp: 0, numSessions: 0, totalSessionTime: 0 },
      { date: 1700172800, gainedXp: 200, numSessions: 4, totalSessionTime: 240 },
    ];
    const res = calculateActivity(summaries);
    expect(res.activeDays).toBe(2);
    expect(res.calendarDays).toBe(3);
    expect(res.activityDensity).toBeCloseTo(2 / 3, 4);
    expect(res.totalSessions).toBe(6);
    expect(res.totalReportedSeconds).toBe(360);
    expect(res.dailyXpMedian).toBe(100);
  });
});

describe("Languages Analytics Contract - Intensity", () => {
  it("shouldHandleEmptySummariesGracefully", () => {
    const res = calculateIntensity([]);
    expect(res.global.xpPerSession).toBe(0);
    expect(res.global.secondsPerSession).toBe(0);
    expect(res.global.xpPerMinute).toBe(0);
    expect(res.dailyDistribution.xpPerSessionMedian).toBe(0);
  });

  it("shouldStrictlySeparateGlobalAggregatedRatioFromDailyDistribution", () => {
    // Day 1: 1 session, 100 XP, 60s -> daily ratio: 100 XP/ses
    // Day 2: 9 sessions, 180 XP, 540s -> daily ratio: 20 XP/ses
    // Total XP = 280, Total sessions = 10 -> global ratio = 28 XP/ses
    // Mean of daily ratios = (100 + 20) / 2 = 60 XP/ses != 28 XP/ses
    const summaries: XpSummaryInput[] = [
      { date: 1700000000, gainedXp: 100, numSessions: 1, totalSessionTime: 60 },
      { date: 1700086400, gainedXp: 180, numSessions: 9, totalSessionTime: 540 },
    ];
    const res = calculateIntensity(summaries);

    // Global aggregated ratios
    expect(res.global.xpPerSession).toBe(28); // 280 / 10
    expect(res.global.secondsPerSession).toBe(60); // 600 / 10
    expect(res.global.xpPerMinute).toBe(28); // 280 / 10 mins

    // Daily distribution median (between 100 and 20 -> (100 + 20) / 2 = 60)
    expect(res.dailyDistribution.xpPerSessionMedian).toBe(60);
  });
});

describe("Languages Analytics Contract - Weekday Profile", () => {
  it("shouldGenerate7WeekdayEntriesStartingOnSunday", () => {
    // 2026-06-28 was Sunday (UTC date: 1782604800)
    const sundayDate = Math.floor(new Date("2026-06-28T00:00:00Z").getTime() / 1000);
    const summaries: XpSummaryInput[] = [
      { date: sundayDate, gainedXp: 500, numSessions: 8, totalSessionTime: 400 },
    ];
    const profile = calculateWeeklyProfile(summaries);
    expect(profile).toHaveLength(7);
    expect(profile[0]?.dayName).toBe("Domingo");
    expect(profile[0]?.sampleCount).toBe(1);
    expect(profile[0]?.medianXp).toBe(500);

    expect(profile[1]?.dayName).toBe("Lunes");
    expect(profile[1]?.sampleCount).toBe(0);
    expect(profile[1]?.medianXp).toBe(0);
  });
});

describe("Languages Analytics Contract - Concentration HHI", () => {
  it("shouldCalculateExactHHIAndEffectiveCourseCountOnCanonicalDataset", () => {
    const canonicalCourses: CourseInput[] = [
      { courseId: "DUOLINGO_XA_EN", title: "Demo Alpha", learningLanguage: "xa", fromLanguage: "en", xp: 50000 },
      { courseId: "DUOLINGO_XB_EN", title: "Demo Beta", learningLanguage: "xb", fromLanguage: "en", xp: 30000 },
      { courseId: "DUOLINGO_XC_EN", title: "Demo Gamma", learningLanguage: "xc", fromLanguage: "en", xp: 10000 },
      { courseId: "DUOLINGO_XD_EN", title: "Demo Delta", learningLanguage: "xd", fromLanguage: "en", xp: 6000 },
      { courseId: "DUOLINGO_XE_EN", title: "Demo Epsilon", learningLanguage: "xe", fromLanguage: "en", xp: 4000 },
    ];

    const res = calculateCourseConcentration(canonicalCourses);
    expect(res.totalLinguisticXp).toBe(100000);
    expect(res.hhi).toBe(0.3552); // 0.5² + 0.3² + 0.1² + 0.06² + 0.04²
    expect(res.effectiveCourseCount).toBe(2.82);
    expect(res.top3SharePercentage).toBe(90);
  });

  it("shouldReturnHHI1ForASingleMonopolyCourse", () => {
    const courses: CourseInput[] = [
      { courseId: "DUOLINGO_XA_EN", title: "Demo Alpha", learningLanguage: "xa", fromLanguage: "en", xp: 1000 },
    ];
    const res = calculateCourseConcentration(courses);
    expect(res.hhi).toBe(1.0);
    expect(res.effectiveCourseCount).toBe(1.0);
    expect(res.top3SharePercentage).toBe(100.0);
  });
});

describe("Languages Analytics Contract - Curriculum State", () => {
  it("shouldComputeCompletedAndTotalUnitsPerCourseAndCEFRLevel", () => {
    const sections: SectionInput[] = [
      { courseId: "DUOLINGO_XA_EN", sectionIndex: 0, sectionId: "s0", cefrLevel: "A1", completedUnits: 10, totalUnits: 10 },
      { courseId: "DUOLINGO_XA_EN", sectionIndex: 1, sectionId: "s1", cefrLevel: "A1", completedUnits: 20, totalUnits: 30 },
      { courseId: "DUOLINGO_XA_EN", sectionIndex: 2, sectionId: "s2", cefrLevel: "A2", completedUnits: 0, totalUnits: 40 },
    ];

    const res = calculateCurriculumState(sections);
    expect(res).toHaveLength(1);
    expect(res[0]?.courseId).toBe("DUOLINGO_XA_EN");
    expect(res[0]?.completedUnits).toBe(30);
    expect(res[0]?.totalUnits).toBe(80);
    expect(res[0]?.ratio).toBeCloseTo(30 / 80, 4);

    const cefr = res[0]?.cefrBreakdown ?? [];
    expect(cefr).toHaveLength(2);
    const a1 = cefr.find((c) => c.cefrLevel === "A1");
    expect(a1?.completedUnits).toBe(30);
    expect(a1?.totalUnits).toBe(40);
  });
});

describe("Languages Analytics Contract - Comparability & Structural Change", () => {
  it("shouldMarkComparableWhenTotalUnitsIsStableAcrossSnapshots", () => {
    const prev: CurriculumSnapshotInput = {
      courseId: "DUOLINGO_XB_EN",
      observedAt: "2026-09-24T00:00:00Z",
      sections: [{ sectionIndex: 0, completedUnits: 20, totalUnits: 96 }],
    };
    const curr: CurriculumSnapshotInput = {
      courseId: "DUOLINGO_XB_EN",
      observedAt: "2026-09-29T00:00:00Z",
      sections: [{ sectionIndex: 0, completedUnits: 25, totalUnits: 96 }],
    };

    const delta = compareCurriculumSnapshots(prev, curr);
    expect(delta.status).toBe("comparable");
    expect(delta.deltaCompletedUnits).toBe(5);
    expect(delta.previousTotalUnits).toBe(96);
    expect(delta.latestTotalUnits).toBe(96);
  });

  it("shouldEnforceStructuralChangeAndNullDeltaWhenDenominatorChanges", () => {
    // Canonical case: a course restructured from 400 to 150 units
    const prev: CurriculumSnapshotInput = {
      courseId: "DUOLINGO_XC_ES",
      observedAt: "2026-09-23T12:00:00Z",
      sections: [{ sectionIndex: 0, completedUnits: 32, totalUnits: 400 }],
    };
    const curr: CurriculumSnapshotInput = {
      courseId: "DUOLINGO_XC_ES",
      observedAt: "2026-09-29T12:00:00Z",
      sections: [{ sectionIndex: 0, completedUnits: 33, totalUnits: 150 }],
    };

    const delta = compareCurriculumSnapshots(prev, curr);
    expect(delta.status).toBe("structural_change");
    // INVARIANTE CONTRACTUAL: NO atribuir progreso interpretable cuando el árbol cambia
    expect(delta.deltaCompletedUnits).toBeNull();
    expect(delta.previousTotalUnits).toBe(400);
    expect(delta.latestTotalUnits).toBe(150);
  });

  it("shouldReturnInsufficientObservationWhenMissingSnapshot", () => {
    const delta = compareCurriculumSnapshots(null, null);
    expect(delta.status).toBe("insufficient_observation");
    expect(delta.deltaCompletedUnits).toBeNull();
  });
});

describe("Languages Analytics Contract - Aggregator", () => {
  it("shouldAssembleACompleteCompliantContractDTO", () => {
    const contract = buildLanguagesAnalytics({
      summaries: [
        { date: 1700000000, gainedXp: 100, numSessions: 2, totalSessionTime: 120 },
      ],
      courses: [
        { courseId: "DUOLINGO_XA_EN", title: "Demo Alpha", learningLanguage: "xa", fromLanguage: "en", xp: 1000 },
      ],
      sections: [
        { courseId: "DUOLINGO_XA_EN", sectionIndex: 0, sectionId: "s0", completedUnits: 10, totalUnits: 50 },
      ],
    });

    expect(contract.period.calendarDays).toBe(1);
    expect(contract.activity.activeDays).toBe(1);
    expect(contract.intensity.global.xpPerSession).toBe(50);
    expect(contract.weekdayProfile).toHaveLength(7);
    expect(contract.historicalConcentration.hhi).toBe(1.0);
    expect(contract.curriculum.courses).toHaveLength(1);
  });
});
