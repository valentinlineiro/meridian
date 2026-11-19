import { es } from '../../core/courses';

// Port of goalColor/renderGoalSummary (src/dashboard.client.js:420–435).

/** Day dot: grey without XP; with XP, green when the daily goal is met, blue under it, neutral grey without a goal. */
export function goalColor(xp: number, goal: number | null): string {
  if (!(xp > 0)) return 'var(--line)';
  if (goal == null) return 'var(--muted)';
  return xp >= goal ? 'var(--ok)' : 'var(--info)';
}

/** "Hoy: 150 / 100 XP · objetivo cumplido · 1 de 7 días con objetivo cumplido"; days oldest first. Today is the last day unless the 7 days end earlier (the complete days up to the last sync). */
export function goalSummary(days: string[], xpOf: (day: string) => number, goal: number, todayDate = days[days.length - 1]): string {
  const today = xpOf(todayDate);
  const met = days.filter((d) => xpOf(d) >= goal).length;
  return `Hoy: ${es(today)} / ${es(goal)} XP` + (today >= goal ? ' · objetivo cumplido' : '') + ` · ${met} de 7 días con objetivo cumplido`;
}
