import type { WeekdayProfileEntry, XpSummaryInput } from "./types.ts";
import { median, iqr } from "./statsUtils.ts";

const DAY_NAMES = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

export function calculateWeeklyProfile(summaries: XpSummaryInput[]): WeekdayProfileEntry[] {
  const groups: Array<{
    xp: number[];
    sessions: number[];
    seconds: number[];
  }> = Array.from({ length: 7 }, () => ({
    xp: [],
    sessions: [],
    seconds: [],
  }));

  for (const s of summaries) {
    const d = new Date(s.date * 1000).getUTCDay();
    const group = groups[d];
    if (group) {
      group.xp.push(s.gainedXp || 0);
      group.sessions.push(s.numSessions || 0);
      group.seconds.push(s.totalSessionTime || 0);
    }
  }

  return groups.map((g, dayOfWeek) => ({
    dayOfWeek,
    dayName: DAY_NAMES[dayOfWeek] ?? `Día ${dayOfWeek}`,
    sampleCount: g.xp.length,
    medianXp: Math.round(median(g.xp)),
    iqrXp: Math.round(iqr(g.xp)),
    medianSessions: Number(median(g.sessions).toFixed(1)),
    iqrSessions: Number(iqr(g.sessions).toFixed(1)),
    medianSeconds: Math.round(median(g.seconds)),
    iqrSeconds: Math.round(iqr(g.seconds)),
  }));
}
