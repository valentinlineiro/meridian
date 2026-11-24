import { fmtDate, pc1, relDate } from '../../core/format';
import { agoLabel, isStale } from '../../core/xp-week';
import { activeDaysSub, activeDaysText, Course, CourseDetail, es, Langs, Section, XpDay } from '../../core/courses';
import { list } from '../../core/guard';

// View builders of the Idiomas page: port of renderLang/renderLanguagesView/renderLanguagesAnalytics
// (src/dashboard.client.js:283–296, 436–782). Each one is run under safe() by the component, so a body it cannot read
// degrades its own card only.

export const NA = 'No disponible';

interface CurCourse { courseId: string; completedUnits?: number | null; totalUnits?: number | null; ratio?: number | null }
export interface CurDelta {
  courseId: string; status?: string | null; deltaTotalUnits?: number | null; deltaCompletedUnits?: number | null;
  previousTotalUnits?: number | null; latestTotalUnits?: number | null; previousObservedAt?: string | null; latestObservedAt?: string | null;
}
/** GET /api/languages/analytics */
export interface Analytics {
  error?: unknown; activity?: unknown;
  intensity?: { global: { xpPerSession?: number | null; secondsPerSession?: number | null }; dailyDistribution: { xpPerSessionMedian?: number | null; secondsPerSessionMedian?: number | null } };
  weekdayProfile?: { dayName: string; medianXp: number; medianSessions: number; medianSeconds: number }[];
  period?: { calendarDays?: number | null } | null;
  historicalConcentration?: { courses?: { courseId: string; title?: string | null; sharePercentage?: number | null }[]; totalLinguisticXp?: number | null } | null;
  curriculum?: { totalCourses?: number | null; courses?: CurCourse[]; recentDeltas?: CurDelta[] } | null;
}
/** GET /api/stats/lang: the older single-snapshot summary, read when the catalogue has no courses. */
export interface LegacyLang {
  createdAt?: string | null; totalXp?: number | null; streak?: number | null; totals?: { days?: number | null; activeDays?: number | null } | null;
  summaries?: { date: number }[]; courseProgressIndex?: { capturedAt: string }[];
}

/** One load of the page. xp/analytics null = that request failed; goal undefined = the settings failed, null = no goal set. */
export interface LangData { langs: Langs; courses: Course[]; xp: XpDay[] | null; analytics: Analytics | null; goal: number | null | undefined }
export type Load = { kind: 'empty' } | { kind: 'failed' } | { kind: 'legacy'; legacy: LegacyLang } | { kind: 'ok'; d: LangData };
/** The selected course's detail: undefined = still loading, null = the request failed. */
export type Detail = CourseDetail | null | undefined;

/** A list where one is expected; absent is empty, anything else is a body this view cannot read. */
const arr = <T>(v: T[] | null | undefined): T[] => { if (v == null) return []; if (!list(v)) throw new Error('not a list'); return v; };
const dec1 = (v: number) => v.toFixed(1).replace('.', ',');
/** "EN → XB" with whichever side is known (legacy course list and detail). */
export const looseFromTo = (c: Course) => (c.fromLanguage ? c.fromLanguage.toUpperCase() + ' → ' : '') + (c.learningLanguage ? c.learningLanguage.toUpperCase() : '');
// a raw source key (daily_refresh) never reaches the owner: the one known type has a name, any other reads General
export const cefrLabel = (s: Section) => s.cefrLevel ? s.cefrLevel + (s.cefrSublevel ? '.' + s.cefrSublevel : '') : s.type === 'daily_refresh' ? 'Repaso diario' : 'General';

/** "Sincronizado hace N días" once the last sync is older than the app's stale rule; null while fresh or when no sync date is known. */
export function staleLabel(d: LangData, now = Date.now()): string | null {
  const at = d.langs.updatedAt;
  if (!at || !isStale(at, now)) return null;
  return `Sincronizado ${agoLabel(at, now)}`;
}

/** Account card, the part read from the catalogue alone. */
export function account(d: LangData) {
  const l = d.langs, cs = d.courses;
  const known = cs.length > 0 && cs.every((c) => c.xp != null);
  const gap = known && l.totalXp != null ? Number(l.totalXp) - cs.reduce((a, c) => a + c.xp!, 0) : 0;
  return {
    xp: l.totalXp != null ? es(Number(l.totalXp)) + ' XP' : '—',
    courses: cs.length + ' cursos',
    // the account total can exceed the listed courses (XP kept outside this catalogue): say so instead of two silent figures
    gap: gap > 0 ? `El total de la cuenta supera en ${es(gap)} XP la suma de los ${cs.length} cursos del catálogo: esa parte no está asignada a ninguno de ellos.` : '',
  };
}

const staleNote = (l: Langs) => {
  const obs = l.totalXpObservedAt;
  if (!obs) return ' · XP: sin observar';
  const day = (v: string) => String(v).slice(0, 10);
  return l.updatedAt && day(obs) !== day(l.updatedAt) ? ' · XP observado el ' + day(obs) : '';
};

/** Account card, the part read from the XP history (days with XP, sync line). */
export function accountActivity(d: LangData) {
  const s = d.xp ?? [], l = d.langs;
  const last = s.length ? new Date(Number(s[s.length - 1].date) * 1000).toISOString().slice(0, 10) : null;
  const first = s.length && typeof s[0].date === 'number' ? s[0].date : null;
  const cur = l.currentCourseId;
  return {
    days: s.length ? activeDaysText(s.filter((x) => (x.gainedXp ?? 0) > 0).length, s.length) : '—',
    daysSub: s.length ? activeDaysSub(first) : '',
    sync: 'Sincronizado ' + relDate(l.updatedAt || l.createdAt || '') + (last ? ' · Actividad hasta ' + fmtDate(last) : '')
      + (cur && d.courses.some((c) => c.courseId === cur) ? ' · Último curso en Duolingo: ' + (d.courses.find((c) => c.courseId === cur)!.title || cur) : '') + staleNote(l),
  };
}

/** The older /api/stats/lang summary (renderLang): only the account card is filled. */
export function legacyAccount(l: LegacyLang) {
  const s = arr(l.summaries);
  const t = l.totals ?? {};
  const lastSync = arr(l.courseProgressIndex).reduce<string | null>((max, e) => !max || e.capturedAt > max ? e.capturedAt : max, null);
  const lastIso = s.length ? new Date(s[s.length - 1].date * 1000).toISOString().slice(0, 10) : null;
  return {
    xp: l.totalXp != null ? es(l.totalXp) + ' XP' : '—',
    days: activeDaysText(t.activeDays ?? 0, t.days ?? 0),
    daysSub: activeDaysSub(s.length ? s[0].date : null),
    sync: 'Sincronizado ' + relDate(l.createdAt || '') + ' · Actividad hasta ' + (lastIso ? fmtDate(lastIso) : '—') + (lastSync ? ' · Unidades leídas ' + relDate(lastSync) : ''),
  };
}

export interface DayCell { date: string; letter: string; color: string; label: string; title: string }
export function intensity(a: Analytics) {
  const g = a.intensity!.global, dd = a.intensity!.dailyDistribution;
  return {
    xp: g.xpPerSession != null ? dec1(g.xpPerSession) : '—',
    xpMed: dd.xpPerSessionMedian != null ? dec1(dd.xpPerSessionMedian) : '—',
    time: g.secondsPerSession ? Math.round(g.secondsPerSession) + ' s' : '—',
    timeMed: dd.secondsPerSessionMedian != null ? Math.round(dd.secondsPerSessionMedian) + ' s' : '—',
  };
}

export function weekdays(a: Analytics) {
  const days = arr(a.weekdayProfile);
  const max = Math.max(...days.map((x) => x.medianXp), 1);
  return {
    rows: days.map((w) => ({ day: w.dayName.slice(0, 3), width: Math.round(w.medianXp / max * 100), text: `${w.medianXp} XP · ${w.medianSessions} ses · ${Math.round(w.medianSeconds / 60)} m` })),
    calendarDays: a.period ? a.period.calendarDays : 0,
  };
}

/** null: the source sent no concentration (legacy leaves the card body blank). */
export function concentration(a: Analytics) {
  const hc = a.historicalConcentration;
  if (!hc) return null;
  const all = arr(hc.courses);
  return {
    rows: all.slice(0, 5).map((c) => ({ key: c.courseId, name: c.title || c.courseId, width: c.sharePercentage || 0, share: pc1(c.sharePercentage || 0) })),
    footer: `Total vitalicio lingüístico: ${es(hc.totalLinguisticXp || 0)} XP en ${all.length} cursos.`,
  };
}

