import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Overview } from './overview';

// Ports of tests/frontendOverviewScope, frontendErrorIsNotZero (overview), frontendEmptyAndErrorStates (overview),
// uxPhase1/uxPhase4 (overview cases). An unanswered or failed request is "No disponible" / "—", never 0.
const DAY = 864e5;
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const utcDay = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10);
const FAIL = Symbol('500');
type Api = Record<string, unknown>;

const course = (courseId: string, title: string, xp: number | null, learning: string) =>
  ({ courseId, title, xp, fromLanguage: 'en', learningLanguage: learning });
const fullApi = (): Api => ({
  '/api/languages': {
    totalXp: 421500, streak: 1212, currentCourseId: 'XB_EN', updatedAt: iso(0),
    courses: [course('XB_EN', 'Demo Beta', 94000, 'ru'), course('XC_EN', 'Demo Gamma', 6000, 'fr')],
  },
  '/api/languages/xp': { summaries: [{ date: utcDay(0), gainedXp: 120, numSessions: 2 }, { date: utcDay(1), gainedXp: 600, numSessions: 1 }] },
  '/api/stats/bundle': {
    summary: { games: 1234, wins: 5, losses: 3, draws: 2, winRate: 0.5, currentElo: 900 },
    timeline: { snapshots: [{ createdAt: iso(3 * DAY) }, { createdAt: iso(2 * DAY) }] },
  },
  '/api/matches': { rows: [{ played_at: Math.floor(Date.now() / 1000) }] },
  '/api/me/linkedin-games/summary': {
    summary: { days: 57, from: '2026-09-01', to: '2026-11-03', playStreak: { current: 12, max: 20 },
      games: { zip: { trajectory: { '7': [{ start: utcDay(0), n: 1 }] } } } },
  },
  '/api/languages/courses/XB_EN': { sections: [{ completedUnits: 3, totalUnits: 10 }] },
});

@Component({ template: '' })
class Elsewhere {}

describe('Overview', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'overview', component: Overview }, { path: ':other', component: Elsewhere }]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  const pending = (): TestRequest[] => http.match(() => true).filter((r) => !r.cancelled);

  // Answers every request the page makes (in rounds: the course detail is asked after /api/languages), then renders.
  const open = async (api: Api) => {
    await harness.navigateByUrl('/overview');
    for (let round = 0; round < 5; round++) {
      const reqs = pending();
      if (!reqs.length) break;
      for (const r of reqs) {
        if (!(r.request.url in api)) throw new Error('unexpected request ' + r.request.urlWithParams);
        const body = api[r.request.url];
        if (body === FAIL) r.flush({ ok: false }, { status: 500, statusText: 'Internal Server Error' });
        else r.flush(body as object);
      }
      TestBed.tick(); // whenStable() would wait on the next round's open requests
      await new Promise((r) => setTimeout(r));
    }
    http.verify();
    await harness.fixture.whenStable();
    return harness.routeNativeElement as HTMLElement;
  };
  const text = (el: HTMLElement, id: string) => el.querySelector('#' + id)!.textContent!.trim();

  it('shouldRenderStreakAndDomainCards', async () => {
    const el = await open(fullApi());

    expect(text(el, 'overviewStreak')).toBe('Duolingo · 🔥 1212 días de racha');
    expect(el.querySelector('#overviewStreak')!.className).toBe('pill pill-win');
    expect(text(el, 'overviewSyncMeta')).toBe('Idiomas: sincronizado hoy · Ajedrez: sincronizado hace 2d · Games: último registro 3 nov 2026 · manual');

    expect(text(el, 'overviewLangActiveCourse')).toBe('🇷🇺 Demo Beta (EN → RU)');
    expect(text(el, 'overviewLangSourceCourse')).toBe('');
    expect(text(el, 'overviewLangUnits')).toBe('3 / 10 unidades (30,0 %)');
    expect(el.querySelector<HTMLElement>('#overviewLangProgressBar')!.style.width).toBe('30%');
    expect(text(el, 'overviewLangCatalogXp')).toBe('2 cursos · 421.500 XP');

    expect(text(el, 'overviewChessElo')).toBe('900 ELO');
    expect(text(el, 'overviewChessEloMeta')).toBe('último snapshot de Chess: hace 2d');
    expect(text(el, 'overviewChessWrLabel')).toBe('50,0 % de victorias (historial completo, todos los rivales)');
    expect(text(el, 'overviewChessWrMeta')).toBe('5 W · 3 L · 2 D');
    expect(el.querySelector<HTMLElement>('#overviewChessDist .bar-win')!.style.width).toBe('50%');
    expect(el.querySelector<HTMLElement>('#overviewChessDist .bar-draw')!.title).toBe('Tablas: 2');
    expect(text(el, 'overviewChessHistorical')).toBe('1234 partidas disputadas'); // es-ES does not group four digits

    expect(text(el, 'overviewGamesStreakLabel')).toBe('Racha actual');
    expect(text(el, 'overviewGamesStreak')).toBe('🔥 12 días');
    expect(text(el, 'overviewGamesMeta')).toBe('Racha máxima 20 días');
    expect(text(el, 'overviewGamesHistorical')).toBe('57 días registrados');

    expect(text(el, 'overviewLangWeekSummary')).toBe('720 XP · 3 ses');
    expect(text(el, 'overviewChessWeekSummary')).toBe('1 partida en 7 días');
    expect(text(el, 'overviewGamesWeekSummary')).toBe('1 resultado con media en 7 días');
    const langDays = [...el.querySelectorAll<HTMLElement>('#overviewLangWeek > div')];
    expect(langDays).toHaveLength(7);
    expect(langDays[6].title).toBe(`${utcDay(0)}: 120 XP · 2 ses`);
    expect(langDays[5].querySelector('span:last-child')!.textContent).toBe('600');
    expect(langDays[0].querySelector('span:last-child')!.textContent).toBe('—');
  });

  it('shouldAskForTheSameWindowsAsTheLegacyPageWhenOpened', async () => {
    await harness.navigateByUrl('/overview');
    const params = Object.fromEntries(pending().map((r) => [r.request.url, r.request.params.toString()]));
    expect(params).toEqual({
      '/api/languages': '',
      '/api/languages/xp': 'days=30',
      '/api/stats/bundle': '',
      '/api/matches': 'limit=100',
      '/api/me/linkedin-games/summary': `today=${new Date().toLocaleDateString('sv-SE')}`,
    });
  });

  it('shouldShowErrorNotZeroWhenStatsRequestFails', async () => {
    const el = await open({ ...fullApi(), '/api/stats/bundle': FAIL, '/api/stats/summary': FAIL, '/api/stats/timeline': FAIL });
    expect(text(el, 'overviewChessElo')).toBe('—');
    expect(text(el, 'overviewChessEloMeta')).toBe('');
    expect(text(el, 'overviewChessWrLabel')).toBe('% de victorias (historial completo, todos los rivales)');
    expect(text(el, 'overviewChessWrMeta')).toBe('—');
    expect(el.querySelector('#overviewChessDist .bar-win')).toBeNull();
    expect(text(el, 'overviewChessHistorical')).toBe('—');
    expect(text(el, 'overviewSyncMeta')).toContain('Ajedrez: sin sincronizar');
  });

  it('shouldSayNoDisponibleWhenTheWeekRequestsFail', async () => {
    const el = await open({ ...fullApi(), '/api/languages/xp': FAIL, '/api/matches': FAIL, '/api/me/linkedin-games/summary': FAIL });
    for (const id of ['overviewLangWeekSummary', 'overviewChessWeekSummary', 'overviewGamesWeekSummary']) expect(text(el, id)).toBe('No disponible');
    for (const id of ['overviewLangWeek', 'overviewChessWeek', 'overviewGamesWeek']) expect(el.querySelector('#' + id)!.children).toHaveLength(0);
    // a failed summary is not an empty log: no "Sin partidas registradas aún", no "0 días registrados"
    expect(text(el, 'overviewGamesStreak')).toBe('—');
    expect(text(el, 'overviewGamesMeta')).toBe('');
    expect(text(el, 'overviewGamesHistorical')).toBe('—');
  });

  it('shouldShowTheEmptyLogCopyWhenTheGamesSummaryHasNoGames', async () => {
    const el = await open({ ...fullApi(), '/api/me/linkedin-games/summary': { summary: { days: 0, games: {}, playStreak: { current: 0, max: 0 } } } });
    expect(text(el, 'overviewGamesStreak')).toBe('—');
    expect(text(el, 'overviewGamesMeta')).toBe('Sin partidas registradas aún');
    expect(text(el, 'overviewGamesHistorical')).toBe('0 días registrados');
  });

  it('shouldReadEachStatsRouteWhenTheBundleFails', async () => {
    const el = await open({
      ...fullApi(), '/api/stats/bundle': FAIL,
      '/api/stats/summary': { games: 10, wins: 5, losses: 3, draws: 2, winRate: 0.5, latestElo: 880 },
      '/api/stats/timeline': { snapshots: [{ createdAt: iso(5 * DAY) }] },
    });
    expect(text(el, 'overviewChessElo')).toBe('880 ELO');
    expect(text(el, 'overviewChessEloMeta')).toBe('último snapshot de Chess: hace 5d');
  });

  it('shouldShowEmptyStateWhenNoData', async () => {
    const el = await open({
      '/api/languages': { totalXp: null, streak: null, currentCourseId: null, updatedAt: null, courses: [] },
      '/api/languages/xp': { summaries: [] },
      '/api/stats/bundle': { summary: { games: 0, wins: 0, losses: 0, draws: 0, winRate: null }, timeline: { snapshots: [] } },
      '/api/matches': { rows: [] },
      '/api/me/linkedin-games/summary': { summary: { days: 0, games: {}, playStreak: { current: 0, max: 0 } } },
    });
    expect(text(el, 'overviewStreak')).toBe('Duolingo · 🔥 —');
    expect(el.querySelector('#overviewStreak')!.className).toBe('pill');
    expect(text(el, 'overviewSyncMeta')).toBe('Idiomas: sin sincronizar · Ajedrez: sin sincronizar · Games: registro manual');
    expect(text(el, 'overviewLangActiveCourse')).toBe('Ninguno');
    expect(text(el, 'overviewLangUnits')).toBe('Sin observación aún · Path no sincronizado para este curso');
    expect(text(el, 'overviewLangCatalogXp')).toBe('0 cursos · — XP');
    expect(text(el, 'overviewChessElo')).toBe('—');
    expect(text(el, 'overviewChessWrMeta')).toBe('0 W · 0 L · 0 D');
    expect(el.querySelector('#overviewChessDist .bar-win')).toBeNull();
    expect(text(el, 'overviewChessHistorical')).toBe('—');
    expect(text(el, 'overviewGamesStreak')).toBe('—');
    expect(text(el, 'overviewGamesHistorical')).toBe('0 días registrados');
    expect(text(el, 'overviewLangWeekSummary')).toBe('0 XP · 0 ses');
    expect(text(el, 'overviewChessWeekSummary')).toBe('0 partidas en 7 días');
    expect(text(el, 'overviewGamesWeekSummary')).toBe('0 resultados con media en 7 días');
    expect(el.querySelectorAll('#overviewLangWeek > div')).toHaveLength(7);
  });

  it('shouldShowPlaceholdersNotZerosWhenNothingHasAnsweredYet', async () => {
    await harness.navigateByUrl('/overview');
    const el = harness.routeNativeElement as HTMLElement;
    expect(text(el, 'overviewStreak')).toBe('Duolingo · 🔥 —');
    expect(text(el, 'overviewSyncMeta')).toBe('Pulso unificado y verificado por dominio');
    for (const id of ['overviewLangActiveCourse', 'overviewLangCatalogXp', 'overviewChessElo', 'overviewChessWrMeta', 'overviewGamesStreak', 'overviewLangWeekSummary', 'overviewChessWeekSummary', 'overviewGamesWeekSummary'])
      expect(text(el, id)).toBe('—');
  });

  it('shouldIgnoreStaleResponseWhenRouteChanged', async () => {
    await harness.navigateByUrl('/overview');
    const inFlight = pending();
    await harness.navigateByUrl('/elsewhere');
    // Leaving the view cancels its requests: a late answer has nothing left to write into.
    expect(inFlight).toHaveLength(5);
    for (const r of inFlight) expect(r.cancelled).toBe(true);
    await harness.navigateByUrl('/overview');
    expect(text(harness.routeNativeElement as HTMLElement, 'overviewChessElo')).toBe('—');
  });

  it('shouldNotAskForTheCourseDetailWhenLeavingBeforeTheCatalogueAnswers', async () => {
    await harness.navigateByUrl('/overview');
    const langs = pending().find((r) => r.request.url === '/api/languages')!;
    await harness.navigateByUrl('/elsewhere');
    expect(langs.cancelled).toBe(true);
    expect(http.match('/api/languages/courses/XB_EN')).toHaveLength(0);
  });

  describe('scope of each number', () => {
    it('shouldNameTheLastDuolingoCourseWhenItDiffersFromTheSelectedOne', async () => {
      localStorage.setItem('longitudinal_selected_course', 'XB_EN');
      const api = fullApi();
      (api['/api/languages'] as { currentCourseId: string }).currentCourseId = 'XC_EN';
      const el = await open(api);
      expect(text(el, 'overviewLangActiveCourse')).toContain('Demo Beta');
      expect(text(el, 'overviewLangSourceCourse')).toBe('Último curso en Duolingo: Demo Gamma');
    });

    it('shouldFollowTheSavedSelectionWhenItIsInTheCatalogue', async () => {
      localStorage.setItem('longitudinal_selected_course', 'XC_EN');
      const el = await open({ ...fullApi(), '/api/languages/courses/XC_EN': { totalUnits: 4, completedUnits: 1 } });
      expect(text(el, 'overviewLangActiveCourse')).toContain('Demo Gamma');
      expect(text(el, 'overviewLangSourceCourse')).toBe('Último curso en Duolingo: Demo Beta');
      expect(text(el, 'overviewLangUnits')).toBe('1 / 4 unidades (25,0 %)');
    });

    it('shouldNotShowACourseOutsideTheCatalogueWhenDuolingoReportsIt', async () => {
      const api = fullApi();
      (api['/api/languages'] as { currentCourseId: string }).currentCourseId = 'CHESS_CH';
      const el = await open(api);
      expect(text(el, 'overviewLangSourceCourse')).toBe('');
    });

    it('shouldNotSumUnknownCourseXpAsZeroWhenACourseHasNoXp', async () => {
      const api = fullApi();
      Object.assign(api['/api/languages'] as object, { totalXp: null, courses: [course('XB_EN', 'Demo Beta', 100, 'ru'), course('XC_EN', 'B', null, 'fr')] });
      const el = await open(api);
      expect(text(el, 'overviewLangCatalogXp')).toBe('2 cursos · — XP');
    });

    it('shouldSayHowOldTheStreakIsWhenTheLastSyncIsOlderThanTwoDays', async () => {
      const api = fullApi();
      Object.assign(api['/api/languages'] as object, { streak: 1117, updatedAt: iso(27 * DAY) });
      const el = await open(api);
      expect(text(el, 'overviewStreak')).toBe('Duolingo · 🔥 1117 días de racha (sincronizado hace 27d)');
    });

    it('shouldShowTheLastRecordDateWhenTheGamesStreakIsZero', async () => {
      const api = fullApi();
      Object.assign((api['/api/me/linkedin-games/summary'] as { summary: object }).summary, { days: 170, playStreak: { current: 0, max: 122 } });
      const el = await open(api);
      expect(text(el, 'overviewGamesStreakLabel')).toBe('Último registro');
      expect(text(el, 'overviewGamesStreak')).toBe('Sin registro desde 3 nov 2026');
      expect(text(el, 'overviewGamesMeta')).toBe('Racha máxima 122 días · registro manual');
    });

    it('shouldNotDateTheEloWhenThereIsNoElo', async () => {
      const api = fullApi();
      (api['/api/stats/bundle'] as { summary: object }).summary = { games: 3 };
      const el = await open(api);
      expect(text(el, 'overviewChessElo')).toBe('—');
      expect(text(el, 'overviewChessEloMeta')).toBe('');
      expect(text(el, 'overviewChessWrMeta')).toBe('—'); // counts the source did not report are not 0 W · 0 L · 0 D
    });

    it('shouldTagEachNumberWithItsScopeWhenRendered', async () => {
      const el = await open(fullApi());
      expect(el.querySelector('#overviewLangCard')!.textContent).toContain('Curso seleccionadoCURSO');
      expect(el.querySelector('#overviewLangCard')!.textContent).toContain('Todos los cursos CUENTA');
      expect(el.querySelector('#overviewLangWeekCard')!.textContent).toContain('Cuenta · últimos 7 días CUENTA');
      expect(el.querySelector('#overviewHero')!.textContent).not.toContain('CUENTA');
      expect(el.textContent).not.toContain('Curso destacado');
    });

    it('shouldLinkEachDomainCardToItsViewWhenClicked', async () => {
      const el = await open(fullApi());
      const buttons = [...el.querySelectorAll<HTMLButtonElement>('#overviewDomainsGrid .btn')];
      expect(buttons.map((b) => b.textContent!.trim())).toEqual(['Ver Idiomas →', 'Ver Ajedrez →', 'Ver LinkedIn Games →']);
      buttons[2].click();
      await harness.fixture.whenStable();
      expect(TestBed.inject(Router).url).toBe('/games');
    });
  });
});
