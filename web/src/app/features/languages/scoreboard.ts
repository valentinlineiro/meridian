import { Course, flag, Section, toDay, xpText, XpDay } from '../../core/courses';
import { pc1 } from '../../core/format';
import { levelView } from './level';
import type { CurDelta } from './languages.view';

/** The per-course part of /api/languages/analytics that the scoreboard reads. */
export interface CurriculumCourse {
  courseId: string; completedUnits?: number | null; totalUnits?: number | null;
  cefrBreakdown?: { cefrLevel: string | null; completedUnits?: number | null; totalUnits?: number | null }[];
}
export type CourseState = 'progress' | 'done' | 'new' | 'unread';
export interface CourseRow {
  id: string; title: string; flag: string; fromTo: string; xp: string; state: CourseState;
  /** The CEFR level the course tree has reached, or null when it cannot be told (a group with units has no level, or no data). */
  level: string | null; units: string; pct: number | null; pctText: string; change: string;
}

const pair = (c: Course) => c.fromLanguage && c.learningLanguage ? `${c.fromLanguage.toUpperCase()} → ${c.learningLanguage.toUpperCase()}` : '';

/** One row per catalogue course, in catalogue order. The level follows the course's own sections (same rule as the detail), ignoring groups with no units. */
export function courseRows(courses: readonly Course[], curriculum: readonly CurriculumCourse[], deltas: readonly CurDelta[]): CourseRow[] {
  return courses.map((c) => {
    const cur = curriculum.find((x) => x.courseId === c.courseId);
    const done = cur?.completedUnits ?? 0, total = cur?.totalUnits ?? 0;
    const base = { id: c.courseId, title: c.title || c.courseId, flag: flag(c.learningLanguage), fromTo: pair(c), xp: xpText(c.xp) + ' XP' };
    if (!cur || total <= 0) return { ...base, state: 'unread' as const, level: null, units: 'Unidades sin leer', pct: null, pctText: '—', change: '' };
    const sections: Section[] = (cur.cefrBreakdown ?? []).filter((g) => (g.totalUnits ?? 0) > 0)
      .map((g) => ({ cefrLevel: g.cefrLevel, completedUnits: g.completedUnits, totalUnits: g.totalUnits }));
    const lv = levelView({ sections }, deltas.find((d) => d.courseId === c.courseId));
    const pct = done / total * 100;
    return {
      ...base, state: done >= total ? 'done' as const : done === 0 ? 'new' as const : 'progress' as const,
      level: lv?.level ?? null, units: `${done} de ${total} unidades`, pct, pctText: pc1(pct), change: lv?.change ?? '',
    };
  });
}

const DAY = 86_400;
/** XP of the whole account over the last `days` days (today included) and the change against the `days` before; null when that earlier stretch is not in the record or had no XP. */
export function periodSummary(xp: readonly XpDay[], days: number, now: Date): { xp: number; activeDays: number; delta: number | null } {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000;
  const back = (d: XpDay) => Math.round((today - Date.parse(toDay(d.date)) / 1000) / DAY);
  const inWindow = (from: number, to: number) => xp.filter((d) => { const b = back(d); return b >= from && b <= to; });
  const cur = inWindow(0, days - 1), prev = inWindow(days, 2 * days - 1);
  const sum = (ds: readonly XpDay[]) => ds.reduce((a, d) => a + (d.gainedXp ?? 0), 0);
  const reaches = xp.some((d) => back(d) >= 2 * days - 1);
  const p = sum(prev);
  return { xp: sum(cur), activeDays: cur.filter((d) => (d.gainedXp ?? 0) > 0).length, delta: reaches && p > 0 ? (sum(cur) - p) / p * 100 : null };
}
