import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { fmtDate } from '../../core/format';

// Texts are compared as legacy's innerHTML gave them: adjacent elements with no whitespace between them.
// Ports of tests/frontend.test.ts (languages view hierarchy, course selection, #16.9.2 scope isolation),
// frontendErrorIsNotZero + frontendEmptyAndErrorStates (languages cases) and frontendEscaping (course list and detail).
// A failed request is "No disponible" / "—", never 0 or an empty history.
const DAY = 864e5;
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const utcDay = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10);
const nowSec = () => Math.floor(Date.now() / 1000);
const FAIL = Symbol('500');
const NOT_FOUND = Symbol('404');
const HOSTILE = '<img src=x onerror=alert(1)>';
type Api = Record<string, unknown>;

const course = (courseId: string, title: string, xp: number | null, from: string, learning: string) =>
  ({ courseId, title, xp, fromLanguage: from, learningLanguage: learning });
const XB = course('XB_EN', 'Demo Beta', 94000, 'en', 'xb');
const XC = course('XC_ES', 'Demo Gamma', 45000, 'es', 'xc');
const langsBody = () => ({ totalXp: 421500, streak: 1212, currentCourseId: 'XB_EN', updatedAt: iso(0), totalXpObservedAt: iso(0), streakObservedAt: iso(0), courses: [XB, XC] });
const analyticsBody = () => ({
  activity: {},
  intensity: { global: { xpPerSession: 12.34, secondsPerSession: 95.6 }, dailyDistribution: { xpPerSessionMedian: 10, secondsPerSessionMedian: 80 } },
  weekdayProfile: [{ dayName: 'Lunes', medianXp: 100, medianSessions: 2, medianSeconds: 600 }, { dayName: 'Martes', medianXp: 50, medianSessions: 1, medianSeconds: 300 }],
  period: { calendarDays: 90 },
  historicalConcentration: { courses: [{ courseId: 'XB_EN', title: 'Demo Beta', sharePercentage: 67.6 }], totalLinguisticXp: 139000 },
  curriculum: {
    totalCourses: 2,
    courses: [{ courseId: 'XC_ES', completedUnits: 5, totalUnits: 20, ratio: 0.25 }],
    recentDeltas: [{ courseId: 'XB_EN', status: 'comparable', deltaTotalUnits: 0, deltaCompletedUnits: 2, previousTotalUnits: 10, latestTotalUnits: 10, previousObservedAt: '2026-11-01T10:00:00Z', latestObservedAt: '2026-11-05T10:00:00Z' }],
  },
});
const section = (o: object) => ({ sectionId: 's1', sectionIndex: 1, type: 'learning', cefrLevel: 'A1', cefrSublevel: 2, completedUnits: 3, totalUnits: 10, lastSeenAt: '2026-11-05T10:00:00Z', ...o });
const langApi = (over: Api = {}): Api => ({
  '/api/languages': langsBody(),
  '/api/languages/xp': { summaries: [{ date: nowSec(), gainedXp: 5072, numSessions: 89, totalSessionTime: 5220 }] },
  '/api/languages/analytics': analyticsBody(),
  '/api/me/settings': { dailyGoalXp: 100 },
  '/api/languages/courses/XB_EN': { course: XB, sections: [section({})] },
  '/api/languages/courses/XC_ES': { course: XC, sections: [section({ sectionId: 's9', cefrLevel: null, type: 'daily_refresh', completedUnits: 1, totalUnits: 4 })] },
  ...over,
});

describe('Languages', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let router: Router;
  let seen: TestRequest[];
  let done: Set<TestRequest>;

  beforeEach(async () => {
    localStorage.clear();
    seen = [];
    done = new Set();
    TestBed.configureTestingModule({ providers: [provideRouter(routes, withComponentInputBinding()), provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    harness = await RouterTestingHarness.create();
  });

  // http.match() hands each request out once: keep them, so a spec can count what was ever asked.
  const pending = (): TestRequest[] => { seen.push(...http.match(() => true)); return seen.filter((r) => !r.cancelled && !done.has(r)); };
  const asked = (url: string) => { pending(); return seen.filter((r) => r.request.url === url); };
  const reply = (r: TestRequest, body: unknown) => {
    done.add(r);
    if (body === FAIL) r.flush({ ok: false }, { status: 500, statusText: 'Internal Server Error' });
    else if (body === NOT_FOUND) r.flush({ ok: false, error: 'no user state found' }, { status: 404, statusText: 'Not Found' });
    else r.flush(body as object);
  };
  const tick = async () => { TestBed.tick(); await new Promise((r) => setTimeout(r)); TestBed.tick(); };
  // Answers every open request in rounds (the course detail is asked once the catalogue is read), then renders.
  const answer = async (api: Api) => {
    for (let round = 0; round < 8; round++) {
      const reqs = pending();
      if (!reqs.length) break;
      for (const r of reqs) {
        if (r.cancelled) continue;
        if (!(r.request.url in api)) throw new Error('unexpected request ' + r.request.urlWithParams);
        reply(r, api[r.request.url]);
      }
      await tick();
    }
    await harness.fixture.whenStable();
    return el();
  };
  const open = async (url = '/languages', api: Api = langApi()) => { await harness.navigateByUrl(url); return answer(api); };
  const el = () => harness.routeNativeElement as HTMLElement;
  const q = (sel: string) => el().querySelector<HTMLElement>(sel);
  const text = (id: string) => (q('#' + id)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const select = async (value: string) => {
    const s = q('#langCourseSelect') as HTMLSelectElement;
    s.value = value;
    s.dispatchEvent(new Event('change'));
    await tick();
  };

  describe('course selection', () => {
    it('shouldSelectCourseFromRouteParam', async () => {
      await open('/languages/XC_ES');
      expect((q('#langCourseSelect') as HTMLSelectElement).value).toBe('XC_ES');
      expect(text('langActiveHeroMeta')).toBe('45.000 XP acumulado en el curso · ES → XC');
      expect(text('langActiveProgress')).toBe('1 / 4 unidades (25,0 %)');
      http.verify();
    });

    it('shouldAskForTheSameWindowsAsTheLegacyPage', async () => {
      await harness.navigateByUrl('/languages');
      expect(pending().map((r) => r.request.urlWithParams)).toEqual(['/api/languages']);
      reply(pending()[0], langsBody());
      await tick();
      expect(pending().map((r) => r.request.urlWithParams).sort()).toEqual(['/api/languages/analytics', '/api/languages/xp?days=90', '/api/me/settings']);
      await answer(langApi());
      http.verify();
    });

    it('shouldUpdateUrlWhenSelectingCourse', async () => {
      await open('/languages');
      expect(text('langActiveProgress')).toBe('3 / 10 unidades (30,0 %)');
      await select('XC_ES');
      expect(router.url).toBe('/languages/XC_ES');
      expect(localStorage.getItem('longitudinal_selected_course')).toBe('XC_ES');
      expect(asked('/api/languages/courses/XC_ES')).toHaveLength(1); // exactly once per selection
      await answer(langApi());
      expect(text('langActiveHeroMeta')).toBe('45.000 XP acumulado en el curso · ES → XC');
      expect(asked('/api/languages')).toHaveLength(1); // the view is reused: the catalogue is not read again

      // selecting the course already in the URL navigates nowhere (no history entry) and asks for nothing
      const nav = vi.spyOn(router, 'navigate');
      await select('XC_ES');
      expect(nav).not.toHaveBeenCalled();
      http.verify();
    });

    it('shouldFallBackToActiveCourseWhenParamUnknown', async () => {
      localStorage.setItem('longitudinal_selected_course', 'XC_ES');
      await open('/languages/NOPE');
      expect((q('#langCourseSelect') as HTMLSelectElement).value).toBe('XC_ES'); // saved selection beats courses[0]
      http.verify();
    });

    it('shouldFallBackToTheMostXpCourseWhenNothingIsSavedAndTheParamIsUnknown', async () => {
      await open('/languages/NOPE');
      expect((q('#langCourseSelect') as HTMLSelectElement).value).toBe('XB_EN');
      expect(text('langActiveHeroMeta')).toBe('94.000 XP acumulado en el curso · EN → XB');
      http.verify();
    });

    it('shouldNotPaintTheOldCourseWhileTheNewOneLoads', async () => {
      await open('/languages/XB_EN');
      expect(text('langActiveProgress')).toBe('3 / 10 unidades (30,0 %)');
      await harness.navigateByUrl('/languages/XC_ES');
      await tick();
      expect(text('langActiveProgress')).toBe('—');
      expect(q('#langCoursesList')!.textContent).not.toContain('SECCIÓN 1: A1.2');
      await answer(langApi());
      expect(text('langActiveProgress')).toBe('1 / 4 unidades (25,0 %)');
      http.verify();
    });

    it('shouldCancelTheEarlierCourseWhenSwitchingFast', async () => {
      await harness.navigateByUrl('/languages/XB_EN');
      const api = langApi();
      for (let i = 0; i < 2; i++) { for (const r of pending()) if (!r.request.url.startsWith('/api/languages/courses/')) reply(r, api[r.request.url]); await tick(); }
      const [first] = asked('/api/languages/courses/XB_EN');
      await harness.navigateByUrl('/languages/XC_ES');
      await tick();
      expect(first.cancelled).toBe(true);
      await answer(api);
      expect(text('langActiveHeroMeta')).toBe('45.000 XP acumulado en el curso · ES → XC');
      http.verify();
    });

    it('shouldSelectTheCourseWhenItsSummaryIsClicked', async () => {
      await open('/languages');
      const summaries = [...el().querySelectorAll<HTMLElement>('#langCoursesList summary')];
      summaries[1].click();
      await tick();
      expect(router.url).toBe('/languages/XC_ES');
      await answer(langApi());
      http.verify();
    });
  });

  describe('scope isolation (#16.9.2)', () => {
    it('shouldMaintainStrictCourseXPAccountXPValueIsolation', async () => {
      await open();
      expect(text('langActiveHeroMeta')).toBe('94.000 XP acumulado en el curso · EN → XB');
      expect(text('langAccountXp')).toBe('421.500 XP');
      expect(text('langAccountStreak')).toBe('🔥 1212 días');
      expect(text('langAccountDays')).toBe('1 de 1 días');
      expect(text('langAccountDaysSub')).toBe(`con XP · registro desde ${fmtDate(utcDay(0))}`);
      expect(text('langAccountCourses')).toBe('2 cursos');
      expect(q('#langCourseHero')!.querySelector('#langAccountXp')).toBeNull();
      expect(q('#langAccountCard')!.querySelector('#langCourseSelect')).toBeNull();
      expect(q('#langCourseHero .pill-scope')!.textContent!.trim()).toBe('CURSO');
      expect(q('#langAccountCard .pill-scope')!.textContent!.trim()).toBe('CUENTA');
    });

    it('shouldChangeOnlyCourseScopedDataWhenSwitchingCourse', async () => {
      await open();
      const account = ['langAccountXp', 'langAccountStreak', 'langAccountDays', 'langAccountCourses', 'langWeekSummary', 'langXpSummary'].map(text);
      await select('XC_ES');
      await answer(langApi());
      expect(text('langActiveHeroMeta')).toBe('45.000 XP acumulado en el curso · ES → XC');
      expect(['langAccountXp', 'langAccountStreak', 'langAccountDays', 'langAccountCourses', 'langWeekSummary', 'langXpSummary'].map(text)).toEqual(account);
      await select('XB_EN');
      await answer(langApi());
      expect(text('langActiveHeroMeta')).toBe('94.000 XP acumulado en el curso · EN → XB');
    });
  });

  describe('level 1', () => {
    it('shouldRenderHeroAccountAndSyncLines', async () => {
      await open();
      const opts = [...el().querySelectorAll('#langCourseSelect option')].map((o) => o.textContent!.trim());
      expect(opts).toEqual(['🌐 Demo Beta · EN → XB (94.000 XP)', '🌐 Demo Gamma · ES → XC (45.000 XP)']);
      expect(text('langCourseFlag')).toBe('🌐');
      expect(q('#langActiveProgressBar')!.style.width).toBe('30%');
      expect(text('langSyncMeta')).toBe(`Sincronizado hoy · Actividad hasta ${fmtDate(utcDay(0))} · Último curso en Duolingo: XB_EN`);
      expect(text('langXpGapNote')).toBe('El total de la cuenta supera en 282.500 XP la suma de los 2 cursos del catálogo: esa parte no está asignada a ninguno de ellos.');
      expect(text('langLimitsCard')).toContain('Lo que estos datos no pueden decir');
      expect(text('langMethodology')).toContain('ΔtotalUnits = 0');
      expect(q('#langTab')!.classList).not.toContain('tab-panel'); // the global CSS hides a .tab-panel that is not .active
    });

    it('shouldSayWhenXpAndStreakWereObservedOnAnotherDay', async () => {
      await open('/languages', langApi({ '/api/languages': { ...langsBody(), totalXpObservedAt: iso(3 * DAY) } }));
      expect(text('langSyncMeta')).toContain(` · XP y racha observados el ${utcDay(3)}`);
    });

    it('shouldRenderGoalColorByXp', async () => {
      const summaries = [{ date: nowSec(), gainedXp: 150, numSessions: 2, totalSessionTime: 600 }, { date: nowSec() - 86400, gainedXp: 50, numSessions: 1, totalSessionTime: 60 },
        { date: nowSec() - 2 * 86400, gainedXp: 100, numSessions: 1, totalSessionTime: 0 }];
      await open('/languages', langApi({ '/api/languages/xp': { summaries } }));
      const dots = [...el().querySelectorAll<HTMLElement>('#langActivityStrip > div > div')].map((d) => d.style.background);
      expect(dots).toHaveLength(7);
      expect(dots[6]).toBe('rgb(46, 160, 67)'); // #2ea043: goal met
      expect(dots[5]).toBe('rgb(88, 166, 255)'); // #58a6ff: some XP, under the goal
      expect(dots[4]).toBe('rgb(46, 160, 67)'); // exactly the goal is met
      expect(dots[3]).toBe('rgb(30, 46, 68)'); // #1e2e44: no XP
      expect(text('langGoalToday')).toBe('Hoy: 150 / 100 XP · objetivo cumplido · 2 de 7 días con objetivo cumplido');
      expect(text('langWeekSummary')).toBe('300 XP · 4 ses · 11 min');
      expect(el().querySelectorAll<HTMLElement>('#langActivityStrip > div')[6].title).toBe(`${utcDay(0)}: 150 XP · 2 ses · 10 min`);
    });

    it('shouldColourEveryActiveDayGreyWithoutAGoal', async () => {
      await open('/languages', langApi({ '/api/me/settings': { dailyGoalXp: null } }));
      const dots = [...el().querySelectorAll<HTMLElement>('#langActivityStrip > div > div')].map((d) => d.style.background);
      expect(dots[6]).toBe('rgb(142, 160, 184)'); // #8ea0b8
      expect(text('langGoalToday')).toBe('Sin objetivo diario configurado.');
    });

    it('shouldListTheCoursesWithTheSelectedOneOpenAndItsSections', async () => {
      await open();
      expect(text('langCoursesCount')).toBe('2 cursos registrados');
      const items = [...el().querySelectorAll<HTMLDetailsElement>('#langCoursesList > details')];
      expect(items.map((d) => d.open)).toEqual([true, false]);
      expect(items[0].querySelector('.pill-selected')!.textContent).toBe('Seleccionado');
      expect(items[0].textContent!.replace(/\s+/g, ' ')).toContain('SECCIÓN 1: A1.23 / 10 unidades (30,0 %)');
      expect(items[1].querySelector('.pill-selected')).toBeNull();
      expect(items[1].textContent!.replace(/\s+/g, ' ')).toContain('Progreso: 5 / 20 unidades25,0 %');
    });

    it('shouldDescribeTheObservedChangesWithoutCollapsingInsufficientIntoStable', async () => {
      await open();
      expect(text('langObservedSynthesis')).toBe('1 de 2 cursos comparables sin cambio estructural');
      expect(text('langCurricularProgressDetail')).toBe('+2 unidades completadas en Demo Beta (mismo árbol curricular: denominador idéntico)');
      expect(text('langCourseStructureDetail')).toBe('Árbol curricular estable sin cambios estructurales en los cursos observados');
      expect(text('langAccountActivityDetail')).toBe('+5072 XP hoy (cuenta) · Curso en foco: Demo Beta (EN → XB) · No refleja competencia lingüística');
    });

    it('shouldCountInsufficientAndStructuralChangesApart', async () => {
      const a = analyticsBody();
      a.curriculum.recentDeltas = [
        { courseId: 'XB_EN', status: 'structural_change', deltaTotalUnits: 5, deltaCompletedUnits: 0, previousTotalUnits: 10, latestTotalUnits: 15, previousObservedAt: '2026-11-01T10:00:00Z', latestObservedAt: '2026-11-05T10:00:00Z' },
        { courseId: 'XC_ES', status: 'comparable', deltaTotalUnits: null as unknown as number, deltaCompletedUnits: 0, previousTotalUnits: 4, latestTotalUnits: 4, previousObservedAt: '', latestObservedAt: '' },
      ];
      await open('/languages', langApi({ '/api/languages/analytics': a, '/api/languages/xp': { summaries: [] } }));
      expect(text('langObservedSynthesis')).toBe('0 de 2 cursos comparables sin cambio estructural · 1 con observación insuficiente · 1 con cambio estructural');
      expect(text('langCurricularProgressDetail')).toBe('Sin observaciones curriculares con denominador idéntico (no se calcula avance)');
      expect(text('langCourseStructureDetail')).toBe('1 curso(s) con CAMBIO ESTRUCTURAL en el árbol curricular (variación en total de unidades; progreso no comparable)');
      expect(text('langAccountActivityDetail')).toBe('Sin XP registrado hoy en la cuenta');
      const rows = [...el().querySelectorAll('#langComparabilityBody .row')].map((r) => r.textContent!.replace(/\s+/g, ' ').trim());
      expect(rows[0]).toBe('XB_ENCAMBIO ESTRUCTURALReestructuración de árbol por la fuente (10 → 15 unidades totales)Observado: 1 nov 2026 → 5 nov 2026');
      // legacy parity: this card reads the status alone, so an unknown denominator still says COMPARABLE here
      expect(rows[1]).toBe('XC_ESCOMPARABLEΔ +0 unidades completadasObservado: — → —');
    });

    it('shouldRenderTheNinetyDaysAndTheAnalyticsCards', async () => {
      await open();
      expect(el().querySelectorAll('#langXpTimeline > div')).toHaveLength(1);
      expect(text('langXpSummary')).toBe('5072 XP acumulados en 1 días · 89 sesiones · ~1 horas de práctica');
      expect(text('langIntensityBody')).toContain('XP / sesión12,3global · med: 10,0');
      expect(text('langIntensityBody')).toContain('Tiempo / sesión96 sglobal · med: 80 s');
      const week = [...el().querySelectorAll('#langWeeklyBody .hist-row')].map((r) => r.textContent!.replace(/\s+/g, ' ').trim());
      expect(week).toEqual(['Lun100 XP · 2 ses · 10 m', 'Mar50 XP · 1 ses · 5 m']);
      expect(text('langWeeklyBody')).toContain('Medianas observadas por día de la semana en la ventana de 90 días.');
      expect(text('langConcentrationBody')).toBe('Demo Beta67,6 %Total vitalicio lingüístico: 139.000 XP en 1 cursos.');
      const comp = [...el().querySelectorAll('#langComparabilityBody .row')].map((r) => r.textContent!.replace(/\s+/g, ' ').trim());
      expect(comp).toEqual([
        'XB_ENCOMPARABLEΔ +2 unidades completadasObservado: 1 nov 2026 → 5 nov 2026',
        'Demo GammaESPERANDO 2ª OBSERVACIÓNAún no hay una segunda captura del Path de este curso para poder comparar.',
      ]);
    });

    it('shouldShowTheCourseXpAsDashWhenItIsNull', async () => {
      await open('/languages', langApi({ '/api/languages': { ...langsBody(), courses: [{ ...XB, xp: null }, XC] } }));
      expect(el().querySelector('#langCourseSelect option')!.textContent).toContain('(— XP)');
      expect(text('langCoursesList')).toContain('— XP');
      expect(text('langXpGapNote')).toBe(''); // an unknown course XP is not summed as 0
    });

    it('shouldEscapeCourseTitlesAndIds', async () => {
      const bad = { ...XB, courseId: `X'),alert(1),('`, title: HOSTILE };
      await open('/languages', langApi({ '/api/languages': { ...langsBody(), currentCourseId: bad.courseId, courses: [bad] }, [`/api/languages/courses/${encodeURIComponent(bad.courseId)}`]: { course: bad, sections: [] } }));
      expect(q('#langCoursesList img')).toBeNull();
      expect(q('#langCourseSelect img')).toBeNull();
      expect(text('langCoursesList')).toContain(HOSTILE);
    });
  });

  describe('a failed request is not an empty history', () => {
    it('shouldSayNoDisponibleInsteadOfSinActividadWhenTheNinetyDayXpFails', async () => {
      await open('/languages', langApi({ '/api/languages/xp': FAIL }));
      expect(text('langXpTimeline')).toBe('No disponible');
      expect(text('langWeekSummary')).toBe('No disponible');
      expect(q('#langActivityStrip')!.textContent).not.toContain('0 XP');
      expect(el().querySelectorAll('#langActivityStrip > div')).toHaveLength(0);
      expect(text('langGoalToday')).toBe('No disponible');
      expect(text('langAccountDays')).toBe('—');
      expect(text('langAccountActivityDetail')).toBe('No disponible');
      expect(text('langAccountXp')).toBe('421.500 XP'); // the rest of the page stays
    });

    it('shouldSaySinActividadOnlyWhenTheNinetyDaysAreReallyEmpty', async () => {
      await open('/languages', langApi({ '/api/languages/xp': { summaries: [] } }));
      expect(text('langXpTimeline')).toBe('Sin actividad registrada en los últimos 90 días');
      expect(text('langWeekSummary')).toBe('0 XP · 0 ses');
    });

    it('shouldSayNoDisponibleWhenTheAnalyticsFail', async () => {
      await open('/languages', langApi({ '/api/languages/analytics': FAIL }));
      for (const id of ['langObservedSynthesis', 'langCurricularProgressDetail', 'langCourseStructureDetail', 'langIntensityBody', 'langWeeklyBody', 'langConcentrationBody', 'langComparabilityBody']) {
        expect(text(id), id).toBe('No disponible');
      }
      expect(text('langActiveProgress')).toBe('3 / 10 unidades (30,0 %)');
    });

    it('shouldSayNoDisponibleWhenTheSettingsFail', async () => {
      await open('/languages', langApi({ '/api/me/settings': FAIL }));
      expect(text('langGoalToday')).toBe('No disponible');
      expect(text('langWeekSummary')).toBe('5072 XP · 89 ses · 87 min');
    });

    it('shouldSayNoDisponibleWhenTheCourseDetailFailsAndNothingElseKnowsItsUnits', async () => {
      await open('/languages', langApi({ '/api/languages/courses/XB_EN': FAIL }));
      expect(text('langActiveProgress')).toBe('No disponible');
      expect(q('#langActiveProgressBar')!.style.width).toBe('0%');
      expect(text('langAccountXp')).toBe('421.500 XP');
    });

    it('shouldUseTheAnalyticsUnitsWhenTheCourseDetailFails', async () => {
      await open('/languages/XC_ES', langApi({ '/api/languages/courses/XC_ES': FAIL }));
      expect(text('langActiveProgress')).toBe('5 / 20 unidades (25,0 %)');
    });

    it('shouldSayThePathIsNotSyncedOnlyWhenTheCourseReallyHasNoUnits', async () => {
      await open('/languages', langApi({ '/api/languages/courses/XB_EN': { course: XB, sections: [] } }));
      expect(text('langActiveProgress')).toBe('Sin observación aún · Path no sincronizado para este curso');
    });

    it('shouldShowTheEmptyStateWhenThereIsNoLanguageDataAtAll', async () => {
      await open('/languages', { '/api/languages': NOT_FOUND, '/api/stats/lang': NOT_FOUND });
      expect(text('langEmpty')).toBe('Sin datos de Languages — sincroniza con la extensión.');
      expect(q('#langContent')).toBeNull();
      http.verify();
    });

    it('shouldShowAFailureWithRetryInsteadOfTheEmptyStateWhenTheCatalogueFails', async () => {
      await open('/languages', { '/api/languages': FAIL, '/api/stats/lang': FAIL });
      expect(text('langEmpty')).toBe('No se pudieron cargar los datos de Idiomas. Reintentar');
      q('#langEmpty button')!.click();
      await tick();
      await answer(langApi());
      expect(text('langAccountXp')).toBe('421.500 XP');
      http.verify();
    });

    it('shouldFallBackToTheLegacyStatsWhenTheCatalogueIsEmpty', async () => {
      const legacy = { createdAt: iso(DAY), totalXp: 1500, streak: 3, totals: { days: 3, activeDays: 2 }, summaries: [{ date: 1782345600 }, { date: nowSec() }], courseProgressIndex: [{ capturedAt: iso(2 * DAY) }] };
      await open('/languages', { '/api/languages': { courses: [] }, '/api/stats/lang': legacy });
      expect(text('langAccountXp')).toBe('1500 XP'); // es-ES groups from five digits
      expect(text('langAccountStreak')).toBe('🔥 3 días');
      expect(text('langAccountDays')).toBe('2 de 3 días');
      expect(text('langAccountDaysSub')).toBe('con XP · registro desde 25 jun 2026');
      expect(text('langSyncMeta')).toBe(`Sincronizado ayer · Actividad hasta ${fmtDate(utcDay(0))} · Path hace 2d`);
      http.verify();
    });
  });

  describe('a body the view cannot read degrades its own card', () => {
    it('shouldDegradeTheHeroAloneWhenTheCourseDetailCannotBeRead', async () => {
      await open('/languages', langApi({ '/api/languages/courses/XB_EN': { course: XB, sections: [null] } }));
      expect(text('langActiveProgress')).toBe('No disponible');
      expect(text('langAccountXp')).toBe('421.500 XP');
      expect(text('langCoursesCount')).toBe('2 cursos registrados');
    });

    it('shouldDegradeTheAccountCardAloneWhenItsDatesCannotBeRead', async () => {
      await open('/languages', langApi({ '/api/languages/xp': { summaries: [{ date: 'bad', gainedXp: 1, numSessions: 1, totalSessionTime: 1 }] } }));
      expect(text('langSyncMeta')).toBe('No disponible');
      expect(text('langActiveProgress')).toBe('3 / 10 unidades (30,0 %)');
    });

    it('shouldDegradeTheWeekCardAloneWhenTheSummariesCannotBeRead', async () => {
      await open('/languages', langApi({ '/api/languages/xp': { summaries: [null] } }));
      expect(text('langWeekSummary')).toBe('No disponible');
      expect(text('langAccountXp')).toBe('421.500 XP');
    });

    it('shouldDegradeTheCourseListAloneWhenACourseCannotBeRead', async () => {
      const a = analyticsBody();
      (a.curriculum as { courses: unknown }).courses = [null];
      await open('/languages', langApi({ '/api/languages/analytics': a }));
      expect(text('langCoursesList')).toBe('No disponible');
      expect(text('langObservedSynthesis')).toBe('1 de 2 cursos comparables sin cambio estructural');
    });

    it('shouldDegradeTheObservedChangesAloneWhenTheDeltasCannotBeRead', async () => {
      const a = analyticsBody();
      (a.curriculum as { recentDeltas: unknown }).recentDeltas = [null];
      await open('/languages', langApi({ '/api/languages/analytics': a }));
      expect(text('langObservedSynthesis')).toBe('No disponible');
      expect(text('langComparabilityBody')).toBe('No disponible');
      expect(text('langIntensityBody')).toContain('12,3');
    });

    it('shouldDegradeTheNinetyDaysAloneWhenADateCannotBeRead', async () => {
      await open('/languages', langApi({ '/api/languages/xp': { summaries: [{ date: 'bad', gainedXp: 1, numSessions: 1, totalSessionTime: 1 }] } }));
      expect(text('langXpTimeline')).toBe('No disponible');
      expect(text('langWeekSummary')).toBe('0 XP · 0 ses');
    });

    it('shouldDegradeTheIntensityCardAlone', async () => {
      await open('/languages', langApi({ '/api/languages/analytics': { ...analyticsBody(), intensity: null } }));
      expect(text('langIntensityBody')).toBe('No disponible');
      expect(text('langWeeklyBody')).toContain('Lun');
    });

    it('shouldDegradeTheWeekdayCardAlone', async () => {
      await open('/languages', langApi({ '/api/languages/analytics': { ...analyticsBody(), weekdayProfile: [{ dayName: null }] } }));
      expect(text('langWeeklyBody')).toBe('No disponible');
      expect(text('langIntensityBody')).toContain('12,3');
    });

    it('shouldDegradeTheConcentrationCardAlone', async () => {
      await open('/languages', langApi({ '/api/languages/analytics': { ...analyticsBody(), historicalConcentration: { courses: 'x' } } }));
      expect(text('langConcentrationBody')).toBe('No disponible');
      expect(text('langIntensityBody')).toContain('12,3');
    });

    it('shouldDegradeTheComparabilityCardAlone', async () => {
      const a = analyticsBody();
      a.curriculum.recentDeltas = [{ ...a.curriculum.recentDeltas[0], previousObservedAt: 5 as unknown as string }];
      await open('/languages', langApi({ '/api/languages/analytics': a }));
      expect(text('langComparabilityBody')).toBe('No disponible');
      expect(text('langObservedSynthesis')).toBe('1 de 2 cursos comparables sin cambio estructural');
    });

    it('shouldDegradeTheCourseDetailAlone', async () => {
      await open('/languages', langApi({ '/api/languages/courses/XB_EN': { course: XB, sections: [{ ...section({}), lastSeenAt: 5 }] } }));
      q('#langCoursesList details[open] button')!.click();
      await tick();
      expect(text('langSectionsList')).toBe('No disponible');
      expect(text('langDetailTitle')).toBe('🌐 Demo Beta');
    });
  });

  describe('course detail (level 2)', () => {
    it('shouldOpenTheCurricularDetailAndGoBack', async () => {
      await open('/languages');
      q('#langCoursesList details[open] button')!.click();
      await tick();
      expect(q('#langGlobalView')).toBeNull();
      expect(text('langDetailTitle')).toBe('🌐 Demo Beta');
      expect(text('langDetailSub')).toBe('EN → XB · ID: XB_EN');
      expect(text('langDetailXpPill')).toBe('94.000 XP');
      expect(text('langCefrBody')).toBe('Nivel A1 (1 sec)3 / 10 unidades');
      expect(text('langSectionsList')).toContain('SECCIÓN 1: A1.23 / 10 unidades');
      expect(text('langSectionsList')).toContain('Section ID: s1 · Tipo: learning · Última observación: 2026-11-05');
      expect(router.url).toBe('/languages/XB_EN');
      expect(asked('/api/languages/courses/XB_EN')).toHaveLength(1); // the selected course's detail was read with the page, not again

      q('#btnBackToLanguages')!.click();
      await tick();
      expect(router.url).toBe('/languages');
      expect(q('#langDetailView')).toBeNull();
      expect(text('langAccountXp')).toBe('421.500 XP');
      http.verify();
    });

    it('shouldOpenTheDetailOfAnotherCourseAndAskForItOnce', async () => {
      await open('/languages');
      el().querySelectorAll<HTMLButtonElement>('#langCoursesList details button')[1].click();
      await tick();
      expect(router.url).toBe('/languages/XC_ES');
      expect(asked('/api/languages/courses/XC_ES')).toHaveLength(1);
      await answer(langApi());
      expect(asked('/api/languages/courses/XC_ES')).toHaveLength(1);
      expect(text('langDetailTitle')).toBe('🌐 Demo Gamma');
      http.verify();
    });

    it('shouldSayNoDisponibleWhenTheDetailRequestFails', async () => {
      await open('/languages', langApi({ '/api/languages/courses/XB_EN': FAIL }));
      q('#langCoursesList details[open] button')!.click();
      await tick();
      expect(text('langCefrBody')).toBe('No disponible');
      expect(text('langSectionsList')).toBe('No disponible');
    });

    it('shouldEscapeSectionFieldsWhenRenderingTheCourseDetail', async () => {
      const s = section({ sectionId: HOSTILE, type: HOSTILE, cefrLevel: HOSTILE, cefrSublevel: null, lastSeenAt: `${HOSTILE}2026-10-01` });
      await open('/languages', langApi({ '/api/languages/courses/XB_EN': { course: XB, sections: [s, { ...s, cefrLevel: null }] } }));
      q('#langCoursesList details[open] button')!.click();
      await tick();
      expect(q('#langDetailView img')).toBeNull();
      expect(text('langCefrBody')).toContain(`Nivel ${HOSTILE}`);
      expect(text('langSectionsList')).toContain(`Section ID: ${HOSTILE} · Tipo: ${HOSTILE}`);
    });
  });

  // Residual cases of tests/accountStaleNote, pruneLanguagesAnalytics and languagesBehaviour (legacy script).
  describe('legacy residuals', () => {
    it('shouldKeepSecondaryAnalyticsBehindProgressiveDisclosure', async () => { // tests/uxPhase1.test.ts
      await open();
      const details = q('details#langAnalyticsDetails')!;
      for (const id of ['langObservedChangesCard', 'langXpTimeline', 'langIntensityCard', 'langWeeklyCard', 'langConcentrationCard', 'langComparabilityCard'])
        expect(details.querySelector('#' + id), id).not.toBeNull();
      for (const id of ['langLimitsCard', 'langCourseHero', 'langAccountCard', 'langWeekCard', 'langCoursesList']) {
        expect(q('#' + id), id).not.toBeNull();
        expect(details.querySelector('#' + id), id).toBeNull();
      }
    });

    it('shouldLabelTheCefrCardAsCurricularUnitsNotProficiency', async () => { // tests/uxPhase0.test.ts
      await open();
      q('#langCoursesList details[open] button')!.click();
      await tick();
      expect(text('langCefrCard')).toContain('Unidades curriculares por nivel CEFR');
      expect(text('langCefrCard')).toMatch(/no constituye evaluación ni certificación/i);
    });

    it('shouldTellCoursesWithTheSameTitleApartInTheSelector', async () => { // tests/uxPhase4.test.ts
      const ru = [course('RU_EN', 'Russian', 159280, 'en', 'ru'), course('RU_ES', 'Russian', 36335, 'es', 'ru')];
      await open('/languages', langApi({ '/api/languages': { ...langsBody(), currentCourseId: 'RU_EN', courses: ru }, '/api/languages/courses/RU_EN': { course: ru[0], sections: [] } }));
      const labels = [...el().querySelectorAll('#langCourseSelect option')].map((o) => o.textContent!);
      expect(labels.some((l) => l.includes('Russian · EN → RU (159.280 XP)'))).toBe(true);
      expect(labels.some((l) => l.includes('Russian · ES → RU (36.335 XP)'))).toBe(true);
    });

    it('shouldKeepTheGoalReadOnlyWithALinkToSettings', async () => { // tests/settingsPage.test.ts
      await open();
      expect(q('#langGoalRow input')).toBeNull();
      expect(q('#langGoalRow a')!.getAttribute('href')).toBe('/settings');
      expect(text('langGoalToday')).toContain('/ 100 XP');
    });

    it('shouldSayXpAndStreakWereNeverObservedWhenNoObservationExists', async () => {
      await open('/languages', langApi({ '/api/languages': { ...langsBody(), totalXpObservedAt: null, streakObservedAt: null } }));
      expect(text('langSyncMeta')).toContain(' · XP y racha: sin observar');
    });

    it('shouldStaySilentWhenXpAndStreakWereObservedInTheLastSnapshot', async () => {
      await open();
      expect(text('langSyncMeta')).not.toMatch(/observados el|sin observar/);
    });

    it('shouldNotShowTheConcentrationIndicesNorXpPerMinute', async () => {
      const a = analyticsBody() as ReturnType<typeof analyticsBody> & Record<string, unknown>;
      Object.assign(a.historicalConcentration, { hhi: 0.3552, effectiveCourseCount: 2.82, top3SharePercentage: 90 });
      Object.assign(a.intensity.global, { xpPerMinute: 28 });
      Object.assign(a.intensity.dailyDistribution, { xpPerMinuteMedian: 29 });
      await open('/languages', langApi({ '/api/languages/analytics': a }));
      expect(text('langConcentrationBody')).not.toMatch(/HHI|Cursos efectivos|Cuota Top 3|0[.,]3552|2[.,]82/);
      expect(text('langIntensityBody')).not.toMatch(/XP \/ minuto|29[.,]0/);
      expect(text('langIntensityBody')).toMatch(/No representan eficiencia cognitiva ni velocidad de aprendizaje/);
    });

    it.each([[{ totalUnits: 4 }], [{}]])('shouldShowSectionsWithoutUnitCountsAsZeroNotAsNaN %j', async (units) => {
      await open('/languages', langApi({ '/api/languages/courses/XB_EN': { course: XB, sections: [{ sectionIndex: 1, sectionId: 's1', type: 'learning', cefrLevel: 'A1', ...units }] } }));
      expect(text('langCoursesList')).not.toContain('NaN');
      q('#langCoursesList details[open] button')!.click();
      await tick();
      expect(text('langSectionsList')).toContain(`0 / ${'totalUnits' in units ? 4 : 0} unidades`);
      expect(el().innerHTML).not.toContain('NaN');
    });
  });
});
