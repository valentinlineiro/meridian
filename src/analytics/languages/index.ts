export * from "./types.ts";
export * from "./statsUtils.ts";
export * from "./activity.ts";
export * from "./intensity.ts";
export * from "./weekly.ts";
export * from "./concentration.ts";
export * from "./curriculum.ts";
export * from "./comparability.ts";

import type {
  CourseInput,
  CurriculumObservationDelta,
  LanguagesAnalyticsContract,
  SectionInput,
  XpSummaryInput,
} from "./types.ts";
import { calculateActivity } from "./activity.ts";
import { calculateIntensity } from "./intensity.ts";
import { calculateWeeklyProfile } from "./weekly.ts";
import { calculateCourseConcentration } from "./concentration.ts";
import { calculateCurriculumState } from "./curriculum.ts";

export function buildLanguagesAnalytics(input: {
  userId?: string;
  summaries: XpSummaryInput[];
  courses: CourseInput[];
  sections: SectionInput[];
  deltas?: CurriculumObservationDelta[];
}): LanguagesAnalyticsContract {
  const { userId, summaries, courses, sections, deltas = [] } = input;

  const sortedSummaries = [...summaries].sort((a, b) => a.date - b.date);
  const minDate = sortedSummaries[0]?.date ?? 0;
  const maxDate = sortedSummaries[sortedSummaries.length - 1]?.date ?? 0;

  const startDate = minDate > 0 ? new Date(minDate * 1000).toISOString().slice(0, 10) : "";
  const endDate = maxDate > 0 ? new Date(maxDate * 1000).toISOString().slice(0, 10) : "";
  const calendarDays = minDate > 0 && maxDate >= minDate ? Math.round((maxDate - minDate) / 86400) + 1 : 0;

  return {
    ...(userId ? { userId } : {}),
    period: {
      startDate,
      endDate,
      calendarDays,
    },
    activity: calculateActivity(sortedSummaries),
    intensity: calculateIntensity(sortedSummaries),
    weekdayProfile: calculateWeeklyProfile(sortedSummaries),
    historicalConcentration: calculateCourseConcentration(courses),
    curriculum: {
      courses: calculateCurriculumState(sections),
      recentDeltas: deltas,
    },
  };
}
