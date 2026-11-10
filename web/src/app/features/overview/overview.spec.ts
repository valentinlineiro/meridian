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

const xpRows = (from: number, to: number, xp: number, extra: object = {}) =>
  Array.from({ length: from - to + 1 }, (_, i) => ({ date: utcDay(from - i), gainedXp: xp, numSessions: 1, ...extra }));
const game = (label: string, pending: string | null = null) => ({ interpretation: { label, pending }, series: [], windows: {}, trajectory: {} });
const fullApi = (): Api => ({
  '/api/languages': { totalXp: 421500, streak: 108, currentCourseId: 'XB_EN', updatedAt: iso(0), courses: [{ courseId: 'XB_EN', title: 'Demo Beta', xp: 94000 }] },
  '/api/languages/xp': { summaries: [...xpRows(7, 1, 271), ...xpRows(35, 8, 343)] },
  '/api/stats/bundle': {
    summary: { games: 1234, wins: 5, losses: 3, draws: 2, winRate: 0.5, currentElo: 900 },
    timeline: { snapshots: [{ createdAt: iso(40 * DAY), elo: 850 }, { createdAt: iso(0), elo: 900 }] },
    recent: { limit: 50, games: 50, decided: 50, winRate: 0.6, delta: { diff: 0.06, lower: 0.01, upper: 0.11 }, before: { games: 100 } },
  },
  '/api/matches': { rows: Array.from({ length: 60 }, (_, i) => ({ played_at: Math.floor((Date.now() - i * DAY) / 1000) })) },
  '/api/me/linkedin-games/summary': {
    summary: { days: 57, from: '2026-09-01', to: utcDay(0), playStreak: { current: 12, max: 20 }, games: { zip: game('estable'), tango: game('deterioro') } },
  },
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

  // Answers every request the page makes, in rounds (a failed bundle makes it ask each stats route), then renders.
  const open = async (api: Api) => {
    await harness.navigateByUrl('/overview');
    for (let round = 0; round < 3; round++) {
      const reqs = pending();
      if (!reqs.length) break;
      for (const r of reqs) {
        if (!(r.request.url in api)) throw new Error('unexpected request ' + r.request.urlWithParams);
        const body = api[r.request.url];
        if (body === FAIL) r.flush({ ok: false }, { status: 500, statusText: 'Internal Server Error' });
        else r.flush(body as object);
      }
      TestBed.tick();
      await new Promise((r) => setTimeout(r));
    }
    http.verify();
    await harness.fixture.whenStable();
    return harness.routeNativeElement as HTMLElement;
  };
  const text = (el: HTMLElement, id: string) => el.querySelector('#' + id)!.textContent!.trim();

  it('shouldSayHowYouAreDoingInOneRowPerDomainWhenEverythingAnswers', async () => {
    const el = await open(fullApi());
    expect(text(el, 'overviewHeadline')).toBe('Tango: a la baja · Ajedrez: posible subida');

    expect(el.querySelector('#overviewChessRow .pill')!.textContent).toBe('Posible subida');
    expect(text(el, 'overviewChessForm')).toMatch(/^Últimas 50 partidas \(desde el .+\): 60,0 % de victorias · \+6,0 puntos de % \(entre \+1,0 y \+11,0\) frente a las anteriores$/);
    expect(text(el, 'overviewChessElo')).toMatch(/^ELO 900 \(\+50 desde el /);

    expect(text(el, 'overviewLangXp')).toMatch(/^Últimos 7 días completos \(hasta ayer\): 1897 XP · media de las 4 semanas anteriores: 2401 XP por semana \(−21 %\)$/);
    expect(text(el, 'overviewLangStreak')).toBe('🔥 Racha de Duolingo: 108 días');
    expect(el.querySelectorAll('#overviewLangRow .wk > div')).toHaveLength(7);

    expect(el.querySelector('#overviewGamesRow .pill')!.textContent).toBe('A la baja');
    expect(text(el, 'overviewGamesLine')).toBe('Tango: A la baja · 1 sin señales de cambio');
    expect(text(el, 'overviewGamesStreak')).toBe('Racha: 12 días seguidos');
  });

  it('shouldKeepTheHistoricalTotalsOutOfTheSummary', async () => {
    const t = (await open(fullApi())).textContent!;
    for (const lifetime of ['partidas disputadas', 'cursos ·', 'días registrados', '421', 'historial completo']) expect(t).not.toContain(lifetime);
  });

  it('shouldAskOnlyForWhatTheRowsNeedWhenOpened', async () => {
    await harness.navigateByUrl('/overview');
    const params = Object.fromEntries(pending().map((r) => [r.request.url, r.request.params.toString()]));
    expect(params).toEqual({
      '/api/languages': '',
      '/api/languages/xp': 'days=45',
      '/api/stats/bundle': '',
      '/api/matches': 'limit=100',
      '/api/me/linkedin-games/summary': `today=${new Date().toLocaleDateString('sv-SE')}`,
    });
  });

  describe('Idiomas: unknown days are not zero', () => {
    it('shouldSayTheDataIsOldInsteadOfShowingZerosWhenTheSyncIsOlderThanTwoDays', async () => {
      const api = fullApi();
      Object.assign(api['/api/languages'] as object, { updatedAt: iso(32 * DAY) });
      api['/api/languages/xp'] = { summaries: [...xpRows(60, 33, 100)] };
      const el = await open(api);
      expect(text(el, 'overviewLangXp')).toBe('Sin datos nuevos desde hace 32 días · no se compara con tu media');
      expect(el.querySelector('#overviewLangRow .wk')).toBeNull();
      expect(el.querySelector('#overviewLangRow')!.textContent).not.toContain('0 XP');
      expect(text(el, 'overviewLangStreak')).toBe('Racha de Duolingo: 108 días (dato de hace 32d)');
      expect(el.querySelector('#overviewLangRow .pill-win')).toBeNull();
      expect(el.querySelector('#overviewLangRow .pill-warn')!.textContent).toContain('hace 32d');
    });

    it('shouldTrustTheXpRowsOwnSyncTimeOverTheCatalogueOne', async () => {
      const api = fullApi(); // the catalogue says fresh, the XP rows say they were written 10 days ago
      api['/api/languages/xp'] = { summaries: [...xpRows(7, 1, 271, { updatedAt: iso(10 * DAY) })] };
      expect(text(await open(api), 'overviewLangXp')).toBe('Sin datos nuevos desde hace 10 días · no se compara con tu media');
    });

    it('shouldSayTheyAreNotSyncedWhenThereIsNoSyncDate', async () => {
      const api = fullApi();
      api['/api/languages'] = { totalXp: null, streak: null, currentCourseId: null, updatedAt: null, courses: [] };
      api['/api/languages/xp'] = { summaries: [] };
      const el = await open(api);
      expect(text(el, 'overviewLangXp')).toBe('Sin sincronizar todavía');
      expect(text(el, 'overviewLangStreak')).toBe('');
    });
  });

  describe('Ajedrez', () => {
    it('shouldFlagTheChessDataAsOldWhenTheLastReadingIsOlderThanTwoDays', async () => {
      const api = fullApi();
      (api['/api/stats/bundle'] as { timeline: object }).timeline = { snapshots: [{ createdAt: iso(40 * DAY), elo: 850 }, { createdAt: iso(5 * DAY), elo: 900 }] };
      expect(text(await open(api), 'overviewChessFresh')).toBe('datos de hace 5d');
    });

    it('shouldReadEachStatsRouteWhenTheBundleFails', async () => {
      const el = await open({
        ...fullApi(), '/api/stats/bundle': FAIL,
        '/api/stats/summary': { games: 10, currentElo: 880 }, '/api/stats/timeline': { snapshots: [{ createdAt: iso(0), elo: 880 }] },
        '/api/stats/recent': { limit: 50, games: 50, decided: 50, winRate: 0.5, delta: null, before: null },
      });
      expect(text(el, 'overviewChessElo')).toBe('ELO 880');
      expect(el.querySelector('#overviewChessRow .pill')!.textContent).toBe('Aún pocos datos');
    });
  });

  describe('a failed request is "No disponible", never a zero or an empty log', () => {
    it('shouldSayNoDisponibleInEachRowWhoseDataFailed', async () => {
      const el = await open({
        ...fullApi(), '/api/stats/bundle': FAIL, '/api/stats/summary': FAIL, '/api/stats/timeline': FAIL, '/api/stats/recent': FAIL,
        '/api/languages/xp': FAIL, '/api/me/linkedin-games/summary': FAIL,
      });
      for (const id of ['overviewChessForm', 'overviewLangXp', 'overviewGamesLine']) expect(text(el, id)).toBe('No disponible');
      expect(el.querySelector('#overviewGamesRow .pill')).toBeNull();
      expect(text(el, 'overviewHeadline')).toBe('Aún no hay datos suficientes para valorar tu ritmo.');
    });

    it('shouldSayTheLogIsEmptyOnlyWhenTheSummaryAnsweredWithNoGames', async () => {
      const el = await open({ ...fullApi(), '/api/me/linkedin-games/summary': { summary: { days: 0, games: {}, playStreak: { current: 0, max: 0 } } } });
      expect(text(el, 'overviewGamesLine')).toBe('Sin partidas registradas aún');
    });
  });

  it('shouldShowPlaceholdersNotZerosWhenNothingHasAnsweredYet', async () => {
    await harness.navigateByUrl('/overview');
    const el = harness.routeNativeElement as HTMLElement;
    expect(text(el, 'overviewHeadline')).toBe('—');
    for (const id of ['overviewChessForm', 'overviewLangXp', 'overviewGamesLine']) expect(text(el, id)).toBe('—');
    expect(el.textContent).not.toContain('0 XP');
  });

  it('shouldCancelItsRequestsWhenLeaving', async () => {
    await harness.navigateByUrl('/overview');
    const inFlight = pending();
    await harness.navigateByUrl('/elsewhere');
    expect(inFlight).toHaveLength(5);
    for (const r of inFlight) expect(r.cancelled).toBe(true);
  });

  it('shouldLinkEachRowToItsViewWhenClicked', async () => {
    const el = await open(fullApi());
    const rows = [...el.querySelectorAll<HTMLAnchorElement>('a.grow')];
    expect(rows.map((a) => a.getAttribute('href'))).toEqual(['/chess', '/languages', '/games']);
    rows[2].click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/games');
  });
});
