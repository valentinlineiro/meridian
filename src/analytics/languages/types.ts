export type ComparabilityStatus = "comparable" | "structural_change" | "insufficient_observation";

export interface ActivitySummary {
  activeDays: number;
  calendarDays: number;
  activityDensity: number; // activeDays / calendarDays
  totalSessions: number;
  totalReportedSeconds: number; // sum(total_session_time)
  dailyXpMedian: number;
  dailyXpIqr: number;
  dailySessionsMedian: number;
  dailySessionsIqr: number;
  dailySecondsMedian: number;
  dailySecondsIqr: number;
}

export interface IntensityMetrics {
  global: {
    xpPerSession: number;
    secondsPerSession: number;
    xpPerMinute: number;
  };
  dailyDistribution: {
    xpPerSessionMedian: number;
    xpPerSessionIqr: number;
    secondsPerSessionMedian: number;
    secondsPerSessionIqr: number;
    xpPerMinuteMedian: number;
    xpPerMinuteIqr: number;
  };
}

export interface WeekdayProfileEntry {
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday
  dayName: string;
  sampleCount: number;
  medianXp: number;
  iqrXp: number;
  medianSessions: number;
  iqrSessions: number;
  medianSeconds: number;
  iqrSeconds: number;
}

export interface CourseShareEntry {
  courseId: string;
  title: string | null;
  learningLanguage: string | null;
  fromLanguage: string | null;
  lifetimeXp: number;
  sharePercentage: number;
}

export interface ConcentrationMetrics {
  totalLinguisticXp: number;
  hhi: number;
  effectiveCourseCount: number; // 1 / HHI
  top3SharePercentage: number;
  courses: CourseShareEntry[];
}

export interface CefrProgressEntry {
  cefrLevel: string | null;
  sectionsCount: number;
  completedUnits: number;
  totalUnits: number;
  ratio: number;
}

export interface CourseCurriculumState {
  courseId: string;
  completedUnits: number;
  totalUnits: number;
  ratio: number;
  sectionsCount: number;
  cefrBreakdown: CefrProgressEntry[];
}

export interface CurriculumObservationDelta {
  courseId: string;
  previousObservedAt: string;
  latestObservedAt: string;
  previousTotalUnits: number;
  latestTotalUnits: number;
  deltaCompletedUnits: number | null;
  status: ComparabilityStatus;
}

export interface LanguagesAnalyticsContract {
  userId?: string;
  period: {
    startDate: string; // ISO
    endDate: string; // ISO
    calendarDays: number;
  };
  activity: ActivitySummary;
  intensity: IntensityMetrics;
  weekdayProfile: WeekdayProfileEntry[];
  historicalConcentration: ConcentrationMetrics;
  curriculum: {
    courses: CourseCurriculumState[];
    recentDeltas: CurriculumObservationDelta[];
  };
}

// Input data shapes for pure functions
export interface XpSummaryInput {
  date: number; // Unix timestamp UTC (00:00)
  gainedXp: number;
  numSessions: number;
  totalSessionTime: number; // seconds
  streakExtended?: number | null;
  frozen?: number | null;
  repaired?: number | null;
}

export interface CourseInput {
  courseId: string;
  title: string | null;
  learningLanguage: string | null;
  fromLanguage: string | null;
  xp: number | null;
  lastSeenAt?: string;
}

export interface SectionInput {
  courseId: string;
  sectionIndex: number;
  sectionId?: string;
  type?: string | null;
  cefrLevel?: string | null;
  cefrSublevel?: number | null;
  completedUnits?: number | null;
  totalUnits?: number | null;
  lastSeenAt?: string;
}

export interface CurriculumSnapshotInput {
  courseId: string;
  observedAt: string;
  sections: Array<{
    sectionIndex: number;
    completedUnits: number;
    totalUnits: number;
  }>;
}
