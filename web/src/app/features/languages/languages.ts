import { Section } from '../../shared/section';
import { Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink, Router } from '@angular/router';
import { catchError, forkJoin, map, Observable, of, switchMap } from 'rxjs';
import { ApiClient } from '../../core/api-client';
import { Course, CourseDetail, Langs, resolveSelectedCourseId, SELECTED_COURSE_KEY, XpDay } from '../../core/courses';
import { list, safe } from '../../core/guard';
import { CourseDetailView } from './course-detail';
import {
  account, accountActivity, activityToday, Analytics, comparability, concentration, courseList, Detail, hero, intensity, LangData, legacyAccount, LegacyLang,
  Load, NA, observed, pace, progress, timeline, week, weekdays,
} from './languages.view';

// Port of loadLanguagesDashboard/selectCourse/showCourseDetail (src/dashboard.client.js:298–419, 1143–1179).

/** 404: the source has nothing yet, a genuine empty answer (not a failure). */
const NONE = 'none' as const;
const attempt = <T>(o: Observable<T>): Observable<T | typeof NONE | null> =>
  o.pipe(catchError((e) => of(e instanceof HttpErrorResponse && e.status === 404 ? NONE : null)));
const ok = <T>(v: T | typeof NONE | null): v is T => v !== null && v !== NONE && !(v as { error?: unknown }).error;

@Component({
  selector: 'app-languages',
  imports: [CourseDetailView, RouterLink, Section],
  templateUrl: './languages.html',
})
export class Languages {
  /** The `:courseId` route param (absent on /languages). */
  readonly courseId = input<string>();

  private readonly api = inject(ApiClient);
  private readonly router = inject(Router);

  // The route is one for /languages and /languages/:id: choosing a course reuses this view, so the catalogue is read once.
  protected readonly data = rxResource<Load, unknown>({ stream: () => this.load() });
  protected readonly state = computed(() => this.data.hasValue() ? this.data.value() : undefined);
  protected readonly d = computed(() => { const s = this.state(); return s?.kind === 'ok' ? s.d : null; });

  /** URL param if in the catalogue, else the saved choice, else the most-XP course (resolveSelectedCourseId :388). */
  protected readonly selected = computed(() => { const d = this.d(); return d ? resolveSelectedCourseId(d.courses, this.courseId()) : null; });
  // A new selection cancels the request of the one before and empties the value: an old course never paints.
  private readonly detailRes = rxResource<CourseDetail | null, string | undefined>({
    params: () => this.selected() ?? undefined,
    stream: ({ params: id }) => attempt(this.api.get<CourseDetail>('/api/languages/courses/' + encodeURIComponent(id))).pipe(
      map((r) => r === NONE ? {} : ok(r) ? r : null),
    ),
  });
  protected readonly detail = computed<Detail>(() => this.detailRes.hasValue() ? this.detailRes.value() : undefined);

  /** Level 2 is open for this course (legacy keeps it out of the URL: /languages/:id is level 1 with that course). */
  private readonly detailFor = signal<string | null>(null);
  protected readonly showDetail = computed(() => this.detailFor() !== null && this.detailFor() === this.selected());
  protected readonly selectedCourse = computed(() => this.d()?.courses.find((c) => c.courseId === this.selected()));

  // Every card is built on its own: a body one cannot read degrades that card alone.
  protected readonly hero = computed(() => { const d = this.d(); return d && safe(() => hero(d, this.selected()), null); });
  protected readonly progress = computed(() => { const d = this.d(); return d ? safe(() => progress(d, this.selected(), this.detail()), { text: NA, width: 0 }) : null; });
  protected readonly account = computed(() => {
    const s = this.state();
    if (s?.kind === 'legacy') return safe(() => ({ ...legacyAccount(s.legacy), courses: '—', gap: '' }), { xp: '—', streak: '—', days: '—', daysSub: '', sync: NA, courses: '—', gap: '' });
    const d = this.d();
    if (!d) return null;
    return { ...safe(() => account(d), { xp: '—', streak: '—', courses: '—', gap: '' }), ...safe(() => accountActivity(d), { days: '—', daysSub: '', sync: NA }) };
  });
  protected readonly week = computed(() => { const d = this.d(); return d && safe(() => week(d), { cells: [], summary: NA, goal: NA }); });
  protected readonly pace = computed(() => { const d = this.d(); return d && safe(() => pace(d), null); });
  protected readonly courses = computed(() => { const d = this.d(); return d && safe(() => courseList(d, this.selected(), this.detail()), NA); });
  protected readonly observed = computed(() => {
    const d = this.d();
    if (!d) return null;
    const failed = { synthesis: NA, progress: NA, structure: NA };
    return d.analytics ? safe(() => observed(d, d.analytics!), failed) : failed;
  });
  protected readonly activityToday = computed(() => { const d = this.d(); return d && safe(() => activityToday(d, this.selected()), NA); });
  protected readonly timeline = computed(() => { const d = this.d(); return d && (d.xp ? safe(() => timeline(d.xp!), NA) : NA); });
  // The four analytics cards: unavailable when the request failed, blank when the source sent no activity (legacy).
  private readonly a = computed(() => { const d = this.d(); return !d ? undefined : !d.analytics ? null : d.analytics.activity ? d.analytics : undefined; });
  protected readonly intensity = computed(() => this.card((a) => intensity(a)));
  protected readonly weekdays = computed(() => this.card((a) => weekdays(a)));
  protected readonly concentration = computed(() => this.card((a) => concentration(a)));
  protected readonly comparability = computed(() => this.card((a) => comparability(a, this.d()!.courses)));

  private card<T>(build: (a: Analytics) => T): T | typeof NA | undefined {
    const a = this.a();
    return a === undefined ? undefined : a === null ? NA : safe(() => build(a), NA);
  }
  protected isNA = (v: unknown): v is typeof NA => v === NA;

  /** selectCourse :398 — remember the choice and put it in the URL; the course already in the URL adds no history entry. */
  protected select(id: string) {
    try { localStorage.setItem(SELECTED_COURSE_KEY, id); } catch { /* storage blocked: the URL still carries it */ }
    if (id !== this.courseId()) void this.router.navigate(['/languages', id]);
  }

  protected openDetail(id: string) {
    this.select(id);
    this.detailFor.set(id);
  }

  protected back() {
    this.detailFor.set(null);
    if (this.courseId()) void this.router.navigate(['/languages']);
  }

  private load(): Observable<Load> {
    return attempt(this.api.get<Langs>('/api/languages')).pipe(switchMap((langs) => {
      const courses = ok(langs) ? (list<Course>(langs.courses) ?? []).filter((c) => typeof c?.courseId === 'string') : [];
      if (ok(langs) && courses.length) {
        return forkJoin({
          xp: attempt(this.api.get<{ summaries?: XpDay[] }>('/api/languages/xp', { days: 90 })),
          analytics: attempt(this.api.get<Analytics>('/api/languages/analytics')),
          settings: attempt(this.api.get<{ dailyGoalXp?: unknown }>('/api/me/settings')),
        }).pipe(map(({ xp, analytics, settings }): Load => {
          const d: LangData = {
            langs, courses,
            xp: ok(xp) ? list<XpDay>(xp.summaries ?? []) : null,
            analytics: ok(analytics) ? analytics : null,
            goal: ok(settings) ? (typeof settings.dailyGoalXp === 'number' ? settings.dailyGoalXp : null) : undefined,
          };
          return { kind: 'ok', d };
        }));
      }
      // No catalogue: the older single-snapshot summary, else the empty state — or a failure when a request failed.
      return attempt(this.api.get<LegacyLang>('/api/stats/lang')).pipe(map((legacy): Load =>
        ok(legacy) && legacy.totals?.days ? { kind: 'legacy', legacy }
        : langs === null || legacy === null ? { kind: 'failed' }
        : { kind: 'empty' }));
    }));
  }
}
