import type { IntensityMetrics, XpSummaryInput } from "./types.ts";
import { median, iqr } from "./statsUtils.ts";

export function calculateIntensity(summaries: XpSummaryInput[]): IntensityMetrics {
  const empty: IntensityMetrics = {
    global: {
      xpPerSession: 0,
      secondsPerSession: 0,
      xpPerMinute: 0,
    },
    dailyDistribution: {
      xpPerSessionMedian: 0,
      xpPerSessionIqr: 0,
      secondsPerSessionMedian: 0,
      secondsPerSessionIqr: 0,
      xpPerMinuteMedian: 0,
      xpPerMinuteIqr: 0,
    },
  };

  if (summaries.length === 0) return empty;

  const totalXp = summaries.reduce((acc, s) => acc + (s.gainedXp || 0), 0);
  const totalSessions = summaries.reduce((acc, s) => acc + (s.numSessions || 0), 0);
  const totalSeconds = summaries.reduce((acc, s) => acc + (s.totalSessionTime || 0), 0);

  const globalXpPerSession = totalSessions > 0 ? totalXp / totalSessions : 0;
  const globalSecondsPerSession = totalSessions > 0 ? totalSeconds / totalSessions : 0;
  const globalXpPerMinute = totalSeconds > 0 ? totalXp / (totalSeconds / 60) : 0;

  // Daily ratios (for days with valid denominator)
  const dailyXpPerSes: number[] = [];
  const dailySecPerSes: number[] = [];
  const dailyXpPerMin: number[] = [];

  for (const s of summaries) {
    const ses = s.numSessions || 0;
    const sec = s.totalSessionTime || 0;
    const xp = s.gainedXp || 0;

    if (ses > 0) {
      dailyXpPerSes.push(xp / ses);
      dailySecPerSes.push(sec / ses);
    }
    if (sec > 0) {
      dailyXpPerMin.push(xp / (sec / 60));
    }
  }

  return {
    global: {
      xpPerSession: Number(globalXpPerSession.toFixed(2)),
      secondsPerSession: Number(globalSecondsPerSession.toFixed(1)),
      xpPerMinute: Number(globalXpPerMinute.toFixed(2)),
    },
    dailyDistribution: {
      xpPerSessionMedian: Number(median(dailyXpPerSes).toFixed(1)),
      xpPerSessionIqr: Number(iqr(dailyXpPerSes).toFixed(1)),
      secondsPerSessionMedian: Number(median(dailySecPerSes).toFixed(1)),
      secondsPerSessionIqr: Number(iqr(dailySecPerSes).toFixed(1)),
      xpPerMinuteMedian: Number(median(dailyXpPerMin).toFixed(1)),
      xpPerMinuteIqr: Number(iqr(dailyXpPerMin).toFixed(1)),
    },
  };
}
