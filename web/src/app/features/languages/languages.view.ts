import { fmtDate, pc1, relDate } from '../../core/format';
import { xpWeek, xpWeekLine } from '../../core/xp-week';
import { activeDaysSub, activeDaysText, Course, CourseDetail, courseProgress, es, flag, Langs, lastSevenDays, Section, toDay, xpText, XpDay } from '../../core/courses';
import { list } from '../../core/guard';
import { goalColor, goalSummary } from './goal-summary';

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
const pair = (c: Course) => c.fromLanguage && c.learningLanguage ? `${c.fromLanguage.toUpperCase()} → ${c.learningLanguage.toUpperCase()}` : '';
/** "EN → XB" with whichever side is known (legacy course list and detail). */
export const looseFromTo = (c: Course) => (c.fromLanguage ? c.fromLanguage.toUpperCase() + ' → ' : '') + (c.learningLanguage ? c.learningLanguage.toUpperCase() : '');
export const cefrLabel = (s: Section) => s.cefrLevel ? s.cefrLevel + (s.cefrSublevel ? '.' + s.cefrSublevel : '') : (s.type || 'General');
// Unit progress prints like every other percentage in the UI ("30,0 %"); the width stays the numeric string.
const unitPct = (completed: number, total: number) => (completed / total * 100).toFixed(1);

export function hero(d: LangData, selected: string | null) {
  const active = d.courses.find((c) => c.courseId === selected);
  const fromTo = active ? pair(active) : '';
  return {
    options: d.courses.map((c) => ({
      id: c.courseId,
      label: (c.learningLanguage ? flag(c.learningLanguage) + ' ' : '') + (c.title || c.courseId) + (pair(c) ? ' · ' + pair(c) : '') + ` (${xpText(c.xp)} XP)`,
    })),
    flag: active?.learningLanguage ? flag(active.learningLanguage) : '',
    meta: `${xpText(active?.xp)} XP acumulado en el curso` + (fromTo ? ' · ' + fromTo : ''),
  };
}

export function progress(d: LangData, selected: string | null, detail: Detail) {
  // the old course's units are never shown while the new one loads
  if (detail === undefined) return { text: '—', width: 0 };
  let { completed, total } = detail ? courseProgress(detail) : { completed: 0, total: 0 };
  if (total === 0) {
    const cur = arr(d.analytics?.curriculum?.courses).find((c) => c.courseId === selected);
    if (cur?.totalUnits != null && cur.totalUnits > 0) { completed = cur.completedUnits || 0; total = cur.totalUnits; }
  }
  if (total > 0) { const p = unitPct(completed, total); return { text: `${completed} / ${total} unidades (${pc1(Number(p))})`, width: Number(p) }; }
  // a failed request is unknown; "not synced" is said only when the source answered without units
  return { text: detail === null ? NA : 'Sin observación aún · Path no sincronizado para este curso', width: 0 };
}

/** Account card, the part read from the catalogue alone. */
export function account(d: LangData) {
  const l = d.langs, cs = d.courses;
  const known = cs.length > 0 && cs.every((c) => c.xp != null);
  const gap = known && l.totalXp != null ? Number(l.totalXp) - cs.reduce((a, c) => a + c.xp!, 0) : 0;
  return {
    xp: l.totalXp != null ? es(Number(l.totalXp)) + ' XP' : '—',
    streak: l.streak != null ? `🔥 ${es(Number(l.streak))} días` : '—',
    courses: cs.length + ' cursos',
    // the account total can exceed the listed courses (XP kept outside this catalogue): say so instead of two silent figures
    gap: gap > 0 ? `El total de la cuenta supera en ${es(gap)} XP la suma de los ${cs.length} cursos del catálogo: esa parte no está asignada a ninguno de ellos.` : '',
  };
}

const staleNote = (l: Langs) => {
  const obs = [l.totalXpObservedAt, l.streakObservedAt].filter(Boolean).sort()[0];
  if (!obs) return ' · XP y racha: sin observar';
  const day = (v: string) => String(v).slice(0, 10);
  return l.updatedAt && day(obs) !== day(l.updatedAt) ? ' · XP y racha observados el ' + day(obs) : '';
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
      + (cur && d.courses.some((c) => c.courseId === cur) ? ' · Último curso en Duolingo: ' + cur : '') + staleNote(l),
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
    streak: l.streak != null ? `🔥 ${l.streak} días` : '',
    days: activeDaysText(t.activeDays ?? 0, t.days ?? 0),
    daysSub: activeDaysSub(s.length ? s[0].date : null),
    sync: 'Sincronizado ' + relDate(l.createdAt || '') + ' · Actividad hasta ' + (lastIso ? fmtDate(lastIso) : '—') + (lastSync ? ' · Path ' + relDate(lastSync) : ''),
  };
}

/** The complete last seven days against the four weeks before: the rule Hoy uses (core/xp-week). Null while the XP rows are unknown. */
export function pace(d: LangData, now = Date.now()): string | null {
  return d.xp ? xpWeekLine(xpWeek(d.xp, d.langs.updatedAt, now), new Date(now).toISOString().slice(0, 10)) : null;
}

export interface DayCell { date: string; letter: string; color: string; label: string; title: string }
export function week(d: LangData) {
  const days = lastSevenDays();
  const goalText = (xpOf: ((day: string) => number) | null) =>
    d.goal === undefined ? NA : d.goal === null ? 'Sin objetivo diario configurado.' : xpOf ? goalSummary(days.map((x) => x.date), xpOf, d.goal) : NA;
  if (!d.xp) return { cells: [] as DayCell[], summary: NA, goal: goalText(null) };
  const byDay = new Map<string, XpDay>();
  for (const s of d.xp) { const k = toDay(s.date); if (!byDay.has(k)) byDay.set(k, s); } // the first one wins, as legacy find()
  const xpOf = (day: string) => byDay.get(day)?.gainedXp || 0;
  let wXp = 0, wSes = 0, wSec = 0;
  const cells = days.map(({ date, letter }): DayCell => {
    const s = byDay.get(date);
    const xp = s?.gainedXp || 0, ses = s?.numSessions || 0, sec = s?.totalSessionTime || 0;
    wXp += xp; wSes += ses; wSec += sec;
    return { date, letter, color: goalColor(xp, d.goal ?? null), label: xp > 0 ? String(xp) : '—', title: `${date}: ${xp} XP · ${ses} ses · ${Math.round(sec / 60)} min` };
  });
  const wMin = Math.round(wSec / 60);
  return { cells, summary: `${es(wXp)} XP · ${wSes} ses` + (wMin > 0 ? ` · ${wMin} min` : ''), goal: goalText(xpOf) };
}

export function courseList(d: LangData, selected: string | null, detail: Detail) {
  const cur = arr(d.analytics?.curriculum?.courses);
  return d.courses.map((c) => {
    const isSelected = c.courseId === selected;
    const secs = isSelected && detail ? list<Section>(detail.sections) : null;
    let units = '', sections: { key: string; title: string; units: string; pct: string; pctText: string; width: number }[] = [], prog: { text: string; pct: string; pctText: string } | null = null;
    if (secs?.length) {
      const p = courseProgress(detail);
      units = `${p.completed} / ${p.total} unidades`;
      sections = secs.map((s, i) => {
        const comp = s.completedUnits || 0, pct = ((s.totalUnits ? comp / s.totalUnits : 0) * 100).toFixed(1);
        return { key: (s.sectionId ?? '') + i, title: `SECCIÓN ${s.sectionIndex}: ${cefrLabel(s)}`, units: `${comp} / ${s.totalUnits ?? 0} unidades`, pct, pctText: pc1(Number(pct)), width: Number(pct) };
      });
    } else {
      const m = cur.find((x) => x.courseId === c.courseId);
      if (m && m.totalUnits != null && m.totalUnits > 0) {
        units = `${m.completedUnits} / ${m.totalUnits} unidades`;
        prog = { text: `Progreso: ${m.completedUnits} / ${m.totalUnits} unidades`, pct: (Number(m.ratio) * 100).toFixed(1), pctText: pc1(Number(m.ratio) * 100) };
      }
    }
    return { id: c.courseId, isSelected, flag: flag(c.learningLanguage), title: c.title || c.courseId, fromTo: looseFromTo(c), xp: xpText(c.xp) + ' XP', units, sections, prog };
  });
}

/** Observed changes: comparable / structural / insufficient stay distinct, never collapsed into "stable". */
export function observed(d: LangData, a: Analytics) {
  const deltas = arr(a.curriculum?.recentDeltas);
  const total = a.curriculum?.totalCourses || d.courses.length;
  // comparable only with a confirmed identical denominator; an unknown one (null) is an insufficient observation
  const strict = deltas.filter((x) => x.status === 'comparable' && (x.deltaTotalUnits === 0 || (x.deltaTotalUnits === undefined && x.previousTotalUnits == null)));
  const structural = deltas.filter((x) => x.status === 'structural_change' || (x.deltaTotalUnits != null && x.deltaTotalUnits !== 0)).length;
  const insufficient = deltas.filter((x) => x.status === 'insufficient_observation' || (x.status === 'comparable' && x.deltaTotalUnits === null)).length;
  const comparable = strict.length;
  const synthesis = comparable || structural || insufficient
    ? `${comparable} de ${total} cursos comparables sin cambio estructural` + (insufficient ? ` · ${insufficient} con observación insuficiente` : '') + (structural ? ` · ${structural} con cambio estructural` : '')
    : 'Sin observaciones curriculares registradas';
  const comp = strict.find((x) => x.deltaTotalUnits === 0 && x.deltaCompletedUnits != null && x.deltaCompletedUnits > 0);
  const compCourse = comp && d.courses.find((c) => c.courseId === comp.courseId);
  const progressText = comp ? `+${comp.deltaCompletedUnits} unidades completadas en ${compCourse ? compCourse.title || compCourse.courseId : comp.courseId} (mismo árbol curricular: denominador idéntico)`
    : comparable > 0 ? 'Sin variación en unidades completadas en cursos comparables (mismo denominador)'
    : 'Sin observaciones curriculares con denominador idéntico (no se calcula avance)';
  const structure = structural > 0 ? `${structural} curso(s) con CAMBIO ESTRUCTURAL en el árbol curricular (variación en total de unidades; progreso no comparable)`
    : comparable > 0 ? 'Árbol curricular estable sin cambios estructurales en los cursos observados'
    : insufficient > 0 ? 'Observación insuficiente para determinar estabilidad (esperando 2ª sincronización)'
    : 'No se detectaron reestructuraciones de árbol curricular en las sincronizaciones observadas.';
  return { synthesis, progress: progressText, structure };
}

/** Account XP today with the course in focus (account scope: never attributed to the course). */
export function activityToday(d: LangData, selected: string | null): string {
  if (!d.xp) return NA;
  const today = new Date().toISOString().slice(0, 10);
  const s = d.xp.find((x) => toDay(x.date) === today);
  const xp = s ? s.gainedXp || 0 : 0;
  if (!(xp > 0)) return 'Sin XP registrado hoy en la cuenta';
  const active = d.courses.find((c) => c.courseId === selected);
  const focus = active ? ' · Curso en foco: ' + (active.title || active.courseId) + (pair(active) ? ` (${pair(active)})` : '') : '';
  return `+${es(xp)} XP hoy (cuenta)${focus} · No refleja competencia lingüística`;
}

export function timeline(xp: XpDay[]) {
  if (!xp.length) return { bars: [], summary: '', empty: 'Sin actividad registrada en los últimos 90 días' };
  const max = Math.max(...xp.map((s) => s.gainedXp || 0), 1);
  const bars = xp.map((s) => {
    const g = s.gainedXp || 0;
    return {
      height: Math.max(3, Math.round(g / max * 56)),
      color: g >= 500 ? 'var(--ok)' : g >= 100 ? 'var(--info)' : g > 0 ? 'var(--muted)' : 'var(--line)',
      title: `${new Date(Number(s.date) * 1000).toISOString().slice(0, 10)}: ${g} XP (${s.numSessions} ses)`,
    };
  });
  const sum = (f: (s: XpDay) => number) => xp.reduce((a, s) => a + f(s), 0);
  const hours = Math.round(sum((s) => s.totalSessionTime || 0) / 3600);
  return { bars, summary: `${es(sum((s) => s.gainedXp || 0))} XP acumulados en ${xp.length} días · ${sum((s) => s.numSessions || 0)} sesiones · ~${hours} horas de práctica`, empty: '' };
}

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

/** Every catalogued course shows up: one with no delta yet reads "waiting", not "missing". */
export function comparability(a: Analytics, courses: Course[]) {
  const deltas = arr(a.curriculum?.recentDeltas);
  const covered = new Set(deltas.map((x) => x.courseId));
  const waiting = courses.filter((c) => !covered.has(c.courseId));
  if (!deltas.length && !waiting.length) return null;
  const day = (v?: string | null) => v ? fmtDate(v.slice(0, 10)) : '—';
  return {
    rows: deltas.map((x) => {
      const comp = x.status === 'comparable', struct = x.status === 'structural_change';
      return {
        key: x.courseId,
        pill: comp ? 'pill pill-win' : struct ? 'pill pill-loss' : 'pill pill-draw',
        status: comp ? 'COMPARABLE' : struct ? 'CAMBIO ESTRUCTURAL' : 'INSUFICIENTE',
        text: comp ? `+${x.deltaCompletedUnits ?? 0} unidades completadas` : struct ? `Duolingo ha cambiado el curso (${x.previousTotalUnits} → ${x.latestTotalUnits} unidades en total)` : 'Solo hay una lectura de este curso',
        observed: `Observado: ${day(x.previousObservedAt)} → ${day(x.latestObservedAt)}`,
      };
    }),
    waiting: waiting.map((c) => ({ key: c.courseId, name: c.title || c.courseId })),
  };
}
