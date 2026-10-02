import type { ActivitySummary, XpSummaryInput } from "./types.ts";
import { median, iqr } from "./statsUtils.ts";

export function calculateActivity(summaries: XpSummaryInput[]): ActivitySummary {
  if (summaries.length === 0) {
    return {
      activeDays: 0,
      calendarDays: 0,
      activityDensity: 0,
      totalSessions: 0,
      totalReportedSeconds: 0,
      dailyXpMedian: 0,
      dailyXpIqr: 0,
      dailySessionsMedian: 0,
      dailySessionsIqr: 0,
      dailySecondsMedian: 0,
      dailySecondsIqr: 0,
    };
  }

  const sortedByDate = [...summaries].sort((a, b) => a.date - b.date);
  const minDate = sortedByDate[0]?.date ?? 0;
  const maxDate = sortedByDate[sortedByDate.length - 1]?.date ?? 0;
  const calendarDays = Math.max(1, Math.round((maxDate - minDate) / 86400) + 1);

  const activeDays = summaries.filter((s) => (s.gainedXp || 0) > 0).length;
  const activityDensity = calendarDays > 0 ? activeDays / calendarDays : 0;

  const totalSessions = summaries.reduce((acc, s) => acc + (s.numSessions || 0), 0);
  const totalReportedSeconds = summaries.reduce((acc, s) => acc + (s.totalSessionTime || 0), 0);

  const xpValues = summaries.map((s) => s.gainedXp || 0);
  const sessionValues = summaries.map((s) => s.numSessions || 0);
  const secondValues = summaries.map((s) => s.totalSessionTime || 0);

  return {
    activeDays,
    calendarDays,
    activityDensity,
    totalSessions,
    totalReportedSeconds,
    dailyXpMedian: median(xpValues),
    dailyXpIqr: iqr(xpValues),
    dailySessionsMedian: median(sessionValues),
    dailySessionsIqr: iqr(sessionValues),
    dailySecondsMedian: median(secondValues),
    dailySecondsIqr: iqr(secondValues),
  };
}
