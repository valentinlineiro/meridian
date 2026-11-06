import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, map, Observable, of, share, switchMap, throwError, TimeoutError } from 'rxjs';
import { ApiClient } from '../../core/api-client';
import { relDate, shortDate } from '../../core/format';

// Port of loadOverviewDashboard/renderOverview (src/dashboard.client.js:783–1003, 1108–1142).

interface Course { courseId: string; title?: string | null; xp?: number | null; fromLanguage?: string | null; learningLanguage?: string | null }
interface Langs { totalXp?: number | null; streak?: number | null; currentCourseId?: string | null; updatedAt?: string | null; courses?: Course[] }
interface XpDay { date: string | number; gainedXp?: number | null; numSessions?: number | null }
interface ChessSummary { games?: number | null; wins?: number | null; losses?: number | null; draws?: number | null; winRate?: number | null; currentElo?: number | null; latestElo?: number | null }
interface Timeline { snapshots?: { createdAt?: string | null }[] }
interface Match { played_at?: number | null; first_seen_at?: string | null }
interface GamesSummary {
  days?: number | null; to?: string | null; playStreak?: { current?: number | null; max?: number | null } | null;
  games?: Record<string, { trajectory?: Record<string, { start: string; n?: number | null }[]> }>;
}
interface CourseDetail { sections?: { completedUnits?: number | null; totalUnits?: number | null }[]; completedUnits?: number | null; totalUnits?: number | null }

/** What the page read. null = that request failed ("No disponible"), never an empty or zero value. */
interface OverviewData {
  langs: Langs | null;
  summaries: XpDay[] | null;
  stats: ChessSummary | null;
  matches: Match[] | null;
  lastChessSyncedAt: string | null;
  games: GamesSummary | null;
  selectedCourseId: string | null;
  detail: CourseDetail | null;
}

const NA = 'No disponible';
const SELECTED_COURSE_KEY = 'longitudinal_selected_course';
const FLAGS: Record<string, string> = { es: '🇪🇸', fr: '🇫🇷', en: '🇬🇧', ja: '🇯🇵', zh: '🇨🇳', it: '🇮🇹', de: '🇩🇪', ru: '🇷🇺', pt: '🇵🇹', ko: '🇰🇷', ar: '🇸🇦', hi: '🇮🇳' };
const es = (n: number) => n.toLocaleString('es-ES');
const gdays = (n: number) => n + (n === 1 ? ' día' : ' días');
const orNull = <T>(o: Observable<T>) => o.pipe(catchError(() => of(null)));

/** URL choice does not apply on the overview: saved selection if still in the catalogue, else the most-XP course (courses[0]). */
// ponytail: duplicated in Languages (Task 6) if it needs it; move to core then.
const resolveSelectedCourseId = (courses: Course[]): string | null => {
  if (!courses.length) return null;
  let stored: string | null = null;
  try { stored = localStorage.getItem(SELECTED_COURSE_KEY); } catch { /* storage blocked: fall through */ }
  return stored && courses.some((c) => c.courseId === stored) ? stored : courses[0].courseId;
};

interface Cell { date: string; letter: string; color: string; label: string; title: string }
const lastSevenDays = () => {
  const now = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6 + i));
    return { date: d.toISOString().slice(0, 10), letter: 'DLMXJVS'[d.getUTCDay()] };
  });
};
const toDay = (v: string | number) => typeof v === 'string' ? v.slice(0, 10) : new Date(v > 1e11 ? v : v * 1000).toISOString().slice(0, 10);

function langCard(langs: Langs | null, selected: string | null, detail: CourseDetail | null) {
  if (!langs) return { flag: '', name: '—', pair: '', source: '', units: '—', progress: 0, catalog: '—' };
  const cs = langs.courses ?? [];
  const active = cs.find((c) => c.courseId === selected);
  const src = langs.currentCourseId ? cs.find((c) => c.courseId === langs.currentCourseId) : null;
  let completed = 0, total = 0;
  if (detail?.sections) for (const s of detail.sections) { completed += s.completedUnits || 0; total += s.totalUnits || 0; }
  else if (detail?.totalUnits != null) { completed = detail.completedUnits || 0; total = detail.totalUnits || 0; }
  const pct = total > 0 ? (completed / total * 100).toFixed(1) : null;
  const catalogXp = langs.totalXp ?? (cs.length && cs.every((c) => c.xp != null) ? cs.reduce((a, c) => a + c.xp!, 0) : null);
  return {
    flag: active?.learningLanguage ? (FLAGS[active.learningLanguage.toLowerCase()] ?? '🌐') + ' ' : '',
    name: active ? active.title || active.courseId : selected || 'Ninguno',
    pair: active?.fromLanguage && active.learningLanguage ? `(${active.fromLanguage.toUpperCase()} → ${active.learningLanguage.toUpperCase()})` : '',
    // a course outside the Idiomas catalogue (Duolingo's own chess course, CHESS_CH) is not shown: its raw id says nothing here
    source: src && src.courseId !== selected ? 'Último curso en Duolingo: ' + (src.title || src.courseId) : '',
    // Explicit system state, not a bare dash: the Path is only captured for the course open at the last sync.
    units: pct != null ? `${completed} / ${total} unidades (${pct}%)` : 'Sin observación aún · Path no sincronizado para este curso',
    progress: pct != null ? Number(pct) : 0,
    catalog: `${cs.length} cursos · ${catalogXp == null ? '—' : es(catalogXp)} XP`,
  };
}

function chessCard(stats: ChessSummary | null, syncedAt: string | null) {
  const s = stats ?? {};
  const elo = s.currentElo ?? s.latestElo ?? null;
  const known = s.wins != null && s.losses != null && s.draws != null;
  const w = s.wins || 0, l = s.losses || 0, d = s.draws || 0;
  const sum = w + l + d || 1;
  const wP = Number((w / sum * 100).toFixed(1)), lP = Number((l / sum * 100).toFixed(1));
  return {
    elo: elo != null ? `${elo} ELO` : '—',
    eloMeta: elo != null && syncedAt ? 'último snapshot de Chess: ' + relDate(syncedAt) : '',
    wrLabel: (s.winRate != null ? (s.winRate * 100).toFixed(1).replace('.', ',') + ' ' : '') + '% de victorias (historial completo, todos los rivales)',
    wrMeta: known ? `${w} W · ${l} L · ${d} D` : '—',
    // an unknown or empty history draws no bar at all, not three zero-width ones
    dist: known && w + l + d > 0 ? { w, l, d, wP, lP, dP: Number(Math.max(0, 100 - wP - lP).toFixed(1)) } : null,
    historical: s.games ? es(s.games) + ' partidas disputadas' : '—',
  };
}

// A manual log has no "broken streak": with no record for 2+ days the run is 0 because nothing was recorded.
function gamesCard(g: GamesSummary | null) {
  // a failed request is unknown, not an empty log (legacy rendered it as "0 días registrados")
  if (!g) return { label: 'Racha actual', value: '—', small: false, meta: '', historical: '—' };
  if (!g.games || !Object.keys(g.games).length) return { label: 'Racha actual', value: '—', small: false, meta: 'Sin partidas registradas aún', historical: '0 días registrados' };
  const cur = g.playStreak?.current ?? 0, max = g.playStreak?.max ?? 0;
  const maxTxt = max > 0 ? 'Racha máxima ' + gdays(max) : '';
  const historical = g.days ? gdays(g.days) + ' registrados' : '—';
  if (cur > 0) return { label: 'Racha actual', value: '🔥 ' + gdays(cur), small: false, meta: maxTxt, historical };
  return { label: 'Último registro', value: g.to ? 'Sin registro desde ' + g.to : '—', small: true, meta: [maxTxt, 'registro manual'].filter(Boolean).join(' · '), historical };
}

function week(d: OverviewData) {
  const days = lastSevenDays();
  const strip = (count: (date: string) => number, color: (n: number) => string, title: (date: string, n: number) => string): Cell[] =>
    days.map(({ date, letter }) => { const n = count(date); return { date, letter, color: color(n), label: n > 0 ? String(n) : '—', title: title(date, n) }; });

  let lang: { cells: Cell[]; summary: string } = { cells: [], summary: NA };
  if (d.summaries) {
    const byDay = new Map<string, XpDay>();
    for (const s of d.summaries) if (!byDay.has(toDay(s.date))) byDay.set(toDay(s.date), s); // first one wins, as legacy find()
    const xp = (date: string) => byDay.get(date)?.gainedXp || 0, ses = (date: string) => byDay.get(date)?.numSessions || 0;
    const cells = strip(xp, (n) => n >= 500 ? '#2ea043' : n >= 100 ? '#58a6ff' : n > 0 ? '#8ea0b8' : '#1e2e44', (date, n) => `${date}: ${n} XP · ${ses(date)} ses`);
    lang = { cells, summary: `${es(days.reduce((a, x) => a + xp(x.date), 0))} XP · ${days.reduce((a, x) => a + ses(x.date), 0)} ses` };
  }

  let chess: { cells: Cell[]; summary: string } = { cells: [], summary: NA };
  if (d.matches) {
    const perDay: Record<string, number> = {};
    for (const m of d.matches) {
      const day = m.played_at ? toDay(m.played_at) : m.first_seen_at ? m.first_seen_at.slice(0, 10) : null;
      if (day) perDay[day] = (perDay[day] || 0) + 1;
    }
    const cells = strip((date) => perDay[date] || 0, (n) => n >= 5 ? '#2ea043' : n > 0 ? '#58a6ff' : '#1e2e44', (date, n) => `${date}: ${n} partidas`);
    const total = days.reduce((a, x) => a + (perDay[x.date] || 0), 0);
    chess = { cells, summary: total + (total === 1 ? ' partida en 7 días' : ' partidas en 7 días') };
  }

  // Games logged per day, from the summary that already feeds the card (each game's daily buckets, n = records that day).
  let games: { cells: Cell[]; summary: string } = { cells: [], summary: NA };
  if (d.games) {
    const perDay: Record<string, number> = {};
    for (const g of Object.values(d.games.games ?? {})) for (const b of g.trajectory?.['7'] ?? []) perDay[b.start] = (perDay[b.start] || 0) + (b.n || 0);
    const cells = strip((date) => perDay[date] || 0, (n) => n >= 4 ? '#2ea043' : n > 0 ? '#58a6ff' : '#1e2e44', (date, n) => `${date}: ${n} resultados con media global`);
    const total = days.reduce((a, x) => a + (perDay[x.date] || 0), 0);
    games = { cells, summary: total + (total === 1 ? ' resultado con media en 7 días' : ' resultados con media en 7 días') };
  }
  return { lang, chess, games };
}

function view(d: OverviewData) {
  const streak = d.langs?.streak;
  const synced = d.langs?.updatedAt;
  const old = !!synced && Date.now() - new Date(synced).getTime() > 2 * 864e5;
  const gTo = d.games?.to;
  return {
    // The streak is Duolingo's: name the source and, when the last sync is old, say how old the figure is.
    streak: streak != null ? `Duolingo · 🔥 ${es(Number(streak))} días de racha` + (old ? ` (sincronizado ${relDate(synced!)})` : '') : 'Duolingo · 🔥 —',
    streakWin: !!streak,
    syncMeta: [
      synced ? 'Idiomas: sincronizado ' + relDate(synced) : 'Idiomas: sin sincronizar',
      d.lastChessSyncedAt ? 'Ajedrez: sincronizado ' + relDate(d.lastChessSyncedAt) : 'Ajedrez: sin sincronizar',
      gTo ? `Games: último registro ${shortDate(gTo)} · manual` : d.games?.days ? `Games: ${gdays(d.games.days)} registrados` : 'Games: registro manual',
    ].join(' · '),
    lang: langCard(d.langs, d.selectedCourseId, d.detail),
    chess: chessCard(d.stats, d.lastChessSyncedAt),
    games: gamesCard(d.games),
    week: week(d),
  };
}

@Component({
  selector: 'app-overview',
  imports: [RouterLink, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './overview.component.html',
})
export class Overview {
  private readonly api = inject(ApiClient);

  // Each request fails on its own into null ("No disponible"); the resource is cancelled with the view, so a late answer is dropped.
  protected readonly data = rxResource<OverviewData, unknown>({ stream: () => this.load() });
  protected readonly v = computed(() => { const d = this.data.value(); return d ? view(d) : null; });

  private load(): Observable<OverviewData> {
    // One bundle serves summary and timeline; if it fails each falls back to its own route, unless it timed out
    // (the backend is slow: more reads would not help).
    const bundle = this.api.get<{ summary?: ChessSummary; timeline?: Timeline }>('/api/stats/bundle').pipe(
      map((b) => { if (!b?.summary) throw new Error('bundle'); return { b, timedOut: false }; }),
      catchError((e) => of({ b: null, timedOut: e instanceof TimeoutError })),
      share(),
    );
    const stat = <T>(key: 'summary' | 'timeline', route: string): Observable<T | null> => orNull(bundle.pipe(switchMap(({ b, timedOut }) =>
      b ? of((b[key] ?? null) as T | null) : timedOut ? throwError(() => new Error('timeout')) : this.api.get<T>(route))));
    return forkJoin({
      langs: orNull(this.api.get<Langs>('/api/languages')),
      xp: orNull(this.api.get<{ summaries?: XpDay[] }>('/api/languages/xp', { days: 30 })),
      stats: stat<ChessSummary>('summary', '/api/stats/summary'),
      timeline: stat<Timeline>('timeline', '/api/stats/timeline'),
      matches: orNull(this.api.get<{ rows?: Match[] }>('/api/matches', { limit: 100 })),
      games: orNull(this.api.get<{ summary?: GamesSummary }>('/api/me/linkedin-games/summary', { today: new Date().toLocaleDateString('sv-SE') })),
    }).pipe(switchMap((r) => {
      const selectedCourseId = r.langs?.courses?.length ? resolveSelectedCourseId(r.langs.courses) : null;
      const detail = selectedCourseId ? orNull(this.api.get<CourseDetail>('/api/languages/courses/' + encodeURIComponent(selectedCourseId))) : of(null);
      const snaps = r.timeline?.snapshots;
      return detail.pipe(map((detail): OverviewData => ({
        langs: r.langs,
        summaries: r.xp ? r.xp.summaries ?? [] : null,
        stats: r.stats,
        matches: r.matches ? r.matches.rows ?? [] : null,
        lastChessSyncedAt: snaps?.[snaps.length - 1]?.createdAt ?? null,
        games: r.games?.summary ?? null,
        selectedCourseId,
        detail,
      })));
    }));
  }
}
