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

  afterEach(() => { vi.useRealTimers(); });
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
  let lastApi: Api = {};
  const open = async (url = '/languages', api: Api = langApi()) => { lastApi = api; await harness.navigateByUrl(url); return answer(api); };
  /** A row opens its course's detail, which is asked for only then. */
  const clickRow = async (id: string) => { q('#langRow-' + id)!.click(); await tick(); await answer(lastApi); };
  const el = () => harness.routeNativeElement as HTMLElement;
  const q = (sel: string) => el().querySelector<HTMLElement>(sel);
  const text = (id: string) => (q('#' + id)?.textContent ?? '').replace(/\s+/g, ' ').trim();

  describe('course selection', () => {

    it('shouldAskForTheSameWindowsAsTheLegacyPage', async () => {
      await harness.navigateByUrl('/languages');
      expect(pending().map((r) => r.request.urlWithParams)).toEqual(['/api/languages']);
      reply(pending()[0], langsBody());
      await tick();
      expect(pending().map((r) => r.request.urlWithParams).sort()).toEqual(['/api/languages/analytics', '/api/languages/xp?days=90', '/api/me/settings']);
      await answer(langApi());
      http.verify();
    });





  });


  describe('level 1', () => {

    it('shouldSayWhenXpWasObservedOnAnotherDay', async () => {
      await open('/languages', langApi({ '/api/languages': { ...langsBody(), totalXpObservedAt: iso(3 * DAY) } }));
      expect(text('langSyncMeta')).toContain(` · XP observado el ${utcDay(3)}`);
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

    it('shouldOfferARetryWhenOnlyPartOfThePageFailsAndNotWhenItAllLoads', async () => {
      await open('/languages', langApi({ '/api/languages/xp': FAIL }));
      expect(text('langPartial')).toBe('Parte de los datos de Idiomas no se pudo cargar. Reintentar');
      q('#langPartial button')!.click();
      await tick();
      await answer(langApi());
      expect(q('#langPartial')).toBeNull();
      expect(text('langXpTimeline')).not.toBe('No disponible');
      http.verify();
    });








    it('shouldShowTheEmptyStateWhenThereIsNoLanguageDataAtAll', async () => {
      await open('/languages', { '/api/languages': NOT_FOUND, '/api/stats/lang': NOT_FOUND });
      expect(text('langEmpty')).toBe('Aún no hay datos de Idiomas. Pulsa Sincronizar para traerlos.');
      expect(q('#langContent')).toBeNull();
      http.verify();
    });

    it('shouldShowAFailureWithRetryInsteadOfTheEmptyStateWhenTheCatalogueFails', async () => {
      await open('/languages', { '/api/languages': FAIL, '/api/stats/lang': FAIL });
      expect(text('langEmpty')).toBe('No se pudieron cargar los datos de Idiomas. Reintentar');
      q('#langEmpty button')!.click();
      await tick();
      await answer(langApi());
      expect(q('#langSummary')).not.toBeNull();
      http.verify();
    });

    it('shouldFallBackToTheLegacyStatsWhenTheCatalogueIsEmpty', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-09T12:00:00Z') }); // "ayer" / "hace 2d" are read against the clock: pinned, not the machine's
      const legacy = { createdAt: iso(DAY), totalXp: 1500, streak: 3, totals: { days: 3, activeDays: 2 }, summaries: [{ date: 1782345600 }, { date: nowSec() }], courseProgressIndex: [{ capturedAt: iso(2 * DAY) }] };
      await open('/languages', { '/api/languages': { courses: [] }, '/api/stats/lang': legacy });
      expect(text('langAccountXp')).toBe('1500 XP'); // es-ES groups from five digits
      expect(q('#langAccountStreak')).toBeNull();
      expect(text('langAccountDays')).toBe('2 de 3 días');
      expect(text('langAccountDaysSub')).toBe('con XP · registro desde 25 jun 2026');
      expect(text('langSyncMeta')).toBe(`Sincronizado ayer · Actividad hasta ${fmtDate(utcDay(0))} · Unidades leídas hace 2d`);
      http.verify();
    });
  });

  describe('a body the view cannot read degrades its own card', () => {






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


    it('shouldDegradeTheCourseDetailAlone', async () => {
      await open('/languages', langApi({ '/api/languages/courses/XB_EN': { course: XB, sections: [{ ...section({}), lastSeenAt: 5 }] } }));
      await clickRow('XB_EN');
      expect(text('langSectionsList')).toBe('No disponible');
      expect(text('langDetailTitle')).toBe('🌐 Demo Beta');
    });
  });

  describe('course detail (level 2)', () => {
    it('shouldOpenTheCurricularDetailAndGoBack', async () => {
      await open('/languages');
      await clickRow('XB_EN');
      expect(q('#langContent')).toBeNull();
      expect(text('langDetailTitle')).toBe('🌐 Demo Beta');
      expect(text('langDetailSub')).toBe('EN → XB');
      expect(text('langDetailXpPill')).toBe('94.000 XP');
      expect(text('langCefrBody')).toBe('Nivel A1 (1 sección)3 / 10 unidades');
      expect(text('langSectionsList')).toContain('SECCIÓN 1: A1.23 / 10 unidades');
      expect(text('langSectionsList')).toContain('Última observación: 2026-11-05');
      expect(text('langSectionsList')).not.toContain('ID de sección');
      expect(router.url).toBe('/languages/XB_EN');
      expect(asked('/api/languages/courses/XB_EN')).toHaveLength(1); // the selected course's detail was read with the page, not again

      q('#btnBackToLanguages')!.click();
      await tick();
      expect(router.url).toBe('/languages');
      expect(q('#langDetailView')).toBeNull();
      expect(q('#langSummary')).not.toBeNull();
      http.verify();
    });

    it('shouldOpenTheDetailOfAnotherCourseAndAskForItOnce', async () => {
      await open('/languages');
      q('#langRow-XC_ES')!.click();
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
      await clickRow('XB_EN');
      expect(text('langCefrBody')).toBe('No disponible');
      expect(text('langSectionsList')).toBe('No disponible');
    });

    it('shouldEscapeSectionFieldsWhenRenderingTheCourseDetail', async () => {
      const s = section({ sectionId: HOSTILE, type: HOSTILE, cefrLevel: HOSTILE, cefrSublevel: null, lastSeenAt: `${HOSTILE}2026-10-01` });
      await open('/languages', langApi({ '/api/languages/courses/XB_EN': { course: XB, sections: [s, { ...s, cefrLevel: null }] } }));
      await clickRow('XB_EN');
      expect(q('#langDetailView img')).toBeNull();
      expect(text('langCefrBody')).toContain(`Nivel ${HOSTILE}`);
      expect(text('langSectionsList')).toContain('Última observación: ' + HOSTILE.slice(0, 10)); // the escaped text, never markup
    });
  });

  // Residual cases of tests/accountStaleNote, pruneLanguagesAnalytics and languagesBehaviour (legacy script).
  describe('legacy residuals', () => {
    it('shouldKeepTheSessionWeekdayAndEffortCardsInOneClosedDetailBelowTheCourses', async () => {
      await open();
      const details = q('details#langDetail') as HTMLDetailsElement;
      expect(details.open).toBe(false);
      for (const id of ['langIntensityCard', 'langWeeklyCard', 'langConcentrationCard']) expect(details.querySelector('#' + id), id).not.toBeNull();
      for (const id of ['langLimitsCard', 'langCoursesList', 'langSummary']) {
        expect(q('#' + id), id).not.toBeNull();
        expect(details.querySelector('#' + id), id).toBeNull();
      }
      for (const gone of ['langObservedChangesCard', 'langXpTimeline', 'langComparabilityCard', 'langCourseHero', 'langAccountCard', 'langWeekCard']) expect(q('#' + gone), gone).toBeNull();
    });

    it('shouldKeepTheLimitsNoticeAsAClosedDisclosureBelowTheDataAndAboveTheMethodology', async () => {
      await open();
      const limits = q('details#langLimitsCard') as HTMLDetailsElement;
      expect(limits.open).toBe(false);
      expect(limits.querySelector('summary')!.textContent).toContain('Lo que estos datos no pueden decir');
      expect(q('#langCoursesList')!.compareDocumentPosition(limits) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(limits.compareDocumentPosition(q('#langMethodology')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });


    describe('a stale sync is said on the summary', () => {

      it('shouldShowNoAgePillWhenTheSyncIsFresh', async () => {
        await open();
        expect(q('#langStalePill')).toBeNull();
      });


    });


    it('shouldLabelTheCefrCardAsCurricularUnitsNotProficiency', async () => { // tests/uxPhase0.test.ts
      await open();
      await clickRow('XB_EN');
      expect(text('langCefrCard')).toContain('Unidades curriculares por nivel CEFR');
      expect(text('langCefrCard')).toMatch(/no constituye evaluación ni certificación/i);
    });



    it('shouldSayXpWasNeverObservedWhenNoObservationExists', async () => {
      await open('/languages', langApi({ '/api/languages': { ...langsBody(), totalXpObservedAt: null, streakObservedAt: null } }));
      expect(text('langSyncMeta')).toContain(' · XP: sin observar');
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
      expect(text('langIntensityBody')).not.toMatch(/competencia|aprendes/); // the one caveat lives in the card at the top
    });

    it.each([[{ totalUnits: 4 }], [{}]])('shouldShowSectionsWithoutUnitCountsAsZeroNotAsNaN %j', async (units) => {
      await open('/languages', langApi({ '/api/languages/courses/XB_EN': { course: XB, sections: [{ sectionIndex: 1, sectionId: 's1', type: 'learning', cefrLevel: 'A1', ...units }] } }));
      expect(text('langCoursesList')).not.toContain('NaN');
      await clickRow('XB_EN');
      expect(text('langSectionsList')).toContain(`0 / ${'totalUnits' in units ? 4 : 0} unidades`);
      expect(el().innerHTML).not.toContain('NaN');
    });
  });

  describe('scoreboard', () => {
    const cur = (courseId: string, groups: [string | null, number, number][]) => ({
      courseId, completedUnits: groups.reduce((a, g) => a + g[1], 0), totalUnits: groups.reduce((a, g) => a + g[2], 0),
      cefrBreakdown: groups.map(([cefrLevel, completedUnits, totalUnits]) => ({ cefrLevel, completedUnits, totalUnits })),
    });
    const withCourses = (courses: unknown[]) => langApi({ '/api/languages/analytics': { ...analyticsBody(), curriculum: { totalCourses: 2, courses, recentDeltas: [] } } });
    const row = (id: string) => (q('#langRow-' + id)?.textContent ?? '').replace(/\s+/g, ' ').trim();

    it('shouldListOneRowPerCourseWithLevelCompletenessAndXp', async () => {
      await open('/languages', withCourses([cur('XB_EN', [['A1', 10, 10], ['A2', 5, 10]]), cur('XC_ES', [['A1', 5, 20]])]));
      expect(row('XB_EN')).toContain('Demo Beta');
      expect(row('XB_EN')).toContain('Nivel A2');
      expect(row('XB_EN')).toContain('75,0 %');
      expect(row('XB_EN')).toContain('15 de 20 unidades');
      expect(row('XB_EN')).toContain('94.000 XP');
    });

    it('shouldShowADashAndTheUnitsWhenTheCourseHasNoLevel', async () => {
      await open('/languages', withCourses([cur('XB_EN', [[null, 3, 10]]), cur('XC_ES', [['A1', 5, 20]])]));
      expect(row('XB_EN')).toContain('—');
      expect(row('XB_EN')).toContain('3 de 10 unidades');
      expect(row('XB_EN')).not.toContain('Nivel ');
    });

    it('shouldSayTheUnitsWereNotReadWhenACourseHasNoCurriculumData', async () => {
      await open('/languages', withCourses([cur('XC_ES', [['A1', 5, 20]])]));
      expect(row('XB_EN')).toContain('Unidades sin leer');
      expect(row('XB_EN')).not.toContain('0,0 %');
    });

    it('shouldFoldFinishedAndNotStartedCoursesApartFromTheOnesUnderWay', async () => {
      await open('/languages', withCourses([cur('XB_EN', [['A1', 10, 10]]), cur('XC_ES', [['A1', 5, 20]])]));
      expect(q('#langCoursesList #langRow-XC_ES')).not.toBeNull();
      expect(q('#langCoursesList #langRow-XB_EN')).toBeNull();
      const rest = q('details#langRest') as HTMLDetailsElement;
      expect(rest.open).toBe(false);
      expect(rest.querySelector('#langRow-XB_EN')).not.toBeNull();
      expect(rest.querySelector('summary')!.textContent).toContain('(1)');
    });

    it('shouldNotAskForACourseDetailUntilARowIsOpened', async () => {
      await open();
      expect(asked('/api/languages/courses/XB_EN')).toHaveLength(0);
      expect(asked('/api/languages/courses/XC_ES')).toHaveLength(0);
    });

    it('shouldSummariseTheAccountXpOfThePeriodAndChangeThePeriodWithoutAskingAgain', async () => {
      await open();
      expect(text('langSummary')).toContain('Últimos 30 días, toda la cuenta: 5072 XP · 1 día con actividad');
      q('#lp-7')!.click();
      await tick();
      expect(text('langSummary')).toContain('Últimos 7 días');
      expect(asked('/api/languages/xp')).toHaveLength(1);
    });

    it('shouldSayNoDisponibleInsteadOfZeroWhenTheXpRequestFails', async () => {
      await open('/languages', langApi({ '/api/languages/xp': FAIL }));
      expect(text('langSummary')).toBe('No disponible');
      expect(q('#langPartial')).not.toBeNull();
    });

    it('shouldSaySinActividadWhenTheXpRecordIsReallyEmpty', async () => {
      await open('/languages', langApi({ '/api/languages/xp': { summaries: [] } }));
      expect(text('langSummary')).toBe('Sin actividad registrada.');
    });

    it('shouldShowTheCourseXpAsDashWhenItIsNull', async () => {
      await open('/languages', langApi({ '/api/languages': { ...langsBody(), courses: [{ ...XB, xp: null }, XC] } }));
      expect(row('XB_EN')).toContain('— XP');
    });

    it('shouldEscapeCourseTitles', async () => {
      await open('/languages', langApi({ '/api/languages': { ...langsBody(), courses: [{ ...XB, title: HOSTILE }, XC] } }));
      expect(q('#langCoursesList img')).toBeNull();
      expect(row('XB_EN')).toContain(HOSTILE);
    });

    it('shouldTagThePeriodChooserAndEachRowForUmami', async () => {
      await open();
      expect(q('#lp-30')!.getAttribute('data-umami-event')).toBe('languages-period');
      expect(q('#langRow-XB_EN')!.getAttribute('data-umami-event')).toBe('languages-course-open');
    });
  });

});
