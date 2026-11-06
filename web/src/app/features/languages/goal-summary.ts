import { es } from '../../core/courses';

// Port of goalColor/renderGoalSummary (src/dashboard.client.js:420–435).

/** Day dot: grey without XP; with XP, green when the daily goal is met, blue under it, neutral grey without a goal. */
export function goalColor(xp: number, goal: number | null): string {
  if (!(xp > 0)) return '#1e2e44';
  if (goal == null) return '#8ea0b8';
  return xp >= goal ? '#2ea043' : '#58a6ff';
}

/** "Hoy: 150 / 100 XP · objetivo cumplido · 1 de 7 días con objetivo cumplido"; days oldest first, the last is today. */
export function goalSummary(days: string[], xpOf: (day: string) => number, goal: number): string {
  const today = xpOf(days[days.length - 1]);
  const met = days.filter((d) => xpOf(d) >= goal).length;
  return `Hoy: ${es(today)} / ${es(goal)} XP` + (today >= goal ? ' · objetivo cumplido' : '') + ` · ${met} de 7 días con objetivo cumplido`;
}
