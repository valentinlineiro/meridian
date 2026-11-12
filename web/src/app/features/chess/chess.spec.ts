import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { StatsService } from '../../core/stats.service';
import { Chess } from './chess';
import { Compare } from './components/compare';
import { MatchesService } from './services/matches.service';
import { EngineProfile, Profile } from './components/engine-profile';
import { routes } from '../../app.routes';

// Ports of tests/chessDashboard, chessDashboardThreats, chessDashboardEngine (chess tab), frontendErrorIsNotZero and
// frontendEmptyAndErrorStates (chess cases), frontendNetwork (chess), frontendWinRateCi, frontendDeltas (colour/form),
// uxPhase2/uxPhase4 (chess cases). An unanswered or failed request is "No disponible" / "—", never 0 or an empty state.
export const FAIL = Symbol('500');
export const MISSING = Symbol('404'); // the route does not exist (an older deploy): the only failure of the bundle that still falls back to each stat's own route
export type Api = Record<string, unknown>;
export const group = (o: object) => ({ key: 'white', games: 10, wins: 5, losses: 4, draws: 1, unknown: 0, decided: 10, winRate: 0.5, scoreRate: 0.55, winRateCi: { lower: 0.2, upper: 0.8 }, ...o });
const tally = (faced: number, neutralized: number, missed: number, unpunished: number) => ({ faced, neutralized, missed, unpunished, rate: faced ? neutralized / faced : null });
export const THREATS = {
  analysed: 326, pending: 12, invalid: 2, unknownVersion: 1, gamesWithMissed: 104,
  totals: tally(499, 283, 104, 112),
  byPhase: { opening: tally(74, 53, 13, 8), middlegame: tally(268, 132, 64, 72), endgame: tally(157, 98, 27, 32) },
  recent: { games: 100, ...tally(150, 90, 30, 30) },
  rest: { games: 226, ...tally(349, 193, 74, 82) },
};
const summary = { games: 100, wins: 50, losses: 20, draws: 30, winRate: 0.5, scoreRate: 0.65, currentElo: 1000, firstElo: 900, currentStreak: 3, currentStreakKind: 'loss', longestWin: 5, longestLoss: 2 };
const BUNDLE_ROUTES = { summary: 'summary', results: 'results', color: 'color', opponents: 'opponents', opponentElo: 'opponent-elo', timeline: 'timeline', recent: 'recent' };

export const chessApi = (over: Api = {}): Api => {
  const api: Api = {
    '/api/stats/summary': summary,
    '/api/stats/results': { endConditions: {
      checkmate: { loss: 4, draw: 0 }, disconnection: { loss: 2, draw: 0 }, resignation: { loss: 3, draw: 0 },
      stalemate: { loss: 0, draw: 1 }, repetition: { loss: 0, draw: 2 }, insufficient_material: { loss: 0, draw: 1 }, fifty_moves: { loss: 0, draw: 1 },
    } },
    '/api/stats/color': { groups: [group({ key: 'white', winRate: 0.7 }), group({ key: 'black', winRate: 0.45 })], difference: { diff: 0.25, lower: 0.038, upper: 0.433 } },
    '/api/stats/opponents': {
      macro: [{ key: 'bot', games: 60, winRate: 0.6 }, { key: 'pvp', games: 40, winRate: 0.4 }],
      segments: [group({ key: 'neural', games: 30 }), group({ key: 'pvp', games: 7 })],
    },
    '/api/stats/opponent-elo': { count: 40, buckets: { '<800': 4, '800-1000': 20 }, min: 700, max: 1500, average: 1000, note: '40 / 100 matches have known opponent ELO' },
    '/api/stats/timeline': { snapshots: [{ createdAt: '2026-10-01T10:00:00Z', elo: 900 }, { createdAt: '2026-10-08T10:00:00Z', elo: 1000 }] },
    '/api/stats/openings': { white: [group({ key: 'ruy_lopez', name: 'Española (Ruy López)' })], black: [group({ key: 'sicilian', name: 'Siciliana' })], unclassified: 0, population: { hydrated: 5, totalMatches: 100 } },
    '/api/stats/mates': { given: [{ type: 'back_rank', label: 'Mate del pasillo', games: 3 }], received: [{ type: 'smothered', label: 'Mate ahogado', games: 1 }], unclassified: 2 },
    '/api/stats/phases': { phases: [group({ key: 'endgame', label: 'Final' })], medianPlies: 42, population: { hydrated: 10, totalMatches: 100 } },
    '/api/stats/threats': THREATS,
    '/api/stats/recent': { limit: 50, games: 50, wins: 25, losses: 20, draws: 5, winRate: 0.5, winRateCi: { lower: 0.36, upper: 0.64 }, scoreRate: 0.55, delta: { diff: 0.025, lower: -0.23, upper: 0.254 },
      before: { games: 50, wins: 25, losses: 25, draws: 0, winRate: 0.5, winRateCi: { lower: 0.4, upper: 0.7 }, scoreRate: 0.5 } },
    '/api/stats/profile': { analysed: 0, pending: 3, all: null, blocks: [], review: { worst: [], best: [] } },
    '/api/trajectory': { evaluations: [{ id: 'CHESS_COLOR_ASYMMETRY_LONGITUDINAL', status: 'not_emitted', criteria: { minDiffPp: 15 }, metrics: {} }] },
    '/api/matches': { rows: [], total: 0 },
    ...over,
  };
  if (!('/api/stats/bundle' in over)) api['/api/stats/bundle'] = Object.fromEntries(Object.entries(BUNDLE_ROUTES).map(([k, r]) => [k, api[`/api/stats/${r}`]]));
  return api;
};

@Component({ template: '' })
class Elsewhere {}

export const setupChess = async () => {
  localStorage.clear();
  TestBed.configureTestingModule({
    providers: [provideRouter([{ path: 'chess', component: Chess }, routes.find((r) => r.path === 'profile')!, { path: ':other', component: Elsewhere }], withComponentInputBinding()), provideHttpClient(), provideHttpClientTesting()],
  });
  const http = TestBed.inject(HttpTestingController);
  const harness = await RouterTestingHarness.create();
  const pending = (): TestRequest[] => http.match(() => true).filter((r) => !r.cancelled);
  const flush = (r: TestRequest, body: unknown) => body === FAIL ? r.flush({ ok: false }, { status: 500, statusText: 'Internal Server Error' }) : body === MISSING ? r.flush({ ok: false }, { status: 404, statusText: 'Not Found' }) : r.flush(body as object);
  // Answers every request the page makes, in rounds (the fallback routes are asked after the bundle), then renders.
  const answer = async (api: Api) => {
    for (let round = 0, quiet = 0; round < 12; round++) {
      const reqs = pending();
      // a child asks only once the parent has rendered its data (the colour persistence): wait one more pass
      if (!reqs.length) { if (++quiet > 2) break; TestBed.tick(); await new Promise((r) => setTimeout(r)); TestBed.tick(); continue; }
      quiet = 0;
      for (const r of reqs) {
        if (r.cancelled) continue; // a failure earlier in the round can cancel its siblings
        if (!(r.request.url in api)) throw new Error('unexpected request ' + r.request.urlWithParams);
        flush(r, api[r.request.url]);
      }
      TestBed.tick();
      await new Promise((r) => setTimeout(r));
    }
    await harness.fixture.whenStable();
    return harness.routeNativeElement as HTMLElement;
  };
  const open = async (api: Api = chessApi()) => { await harness.navigateByUrl('/chess'); return answer(api); };
  const el = () => harness.routeNativeElement as HTMLElement;
  // Renders what has arrived without waiting for open requests (whenStable() would).
  const tick = async () => { TestBed.tick(); await new Promise((r) => setTimeout(r)); TestBed.tick(); };
  const text = (id: string) => el().querySelector('#' + id)!.textContent!.trim();
  return { http, harness, pending, flush, answer, open, el, text, tick };
};

describe('Chess', () => {
  let t: Awaited<ReturnType<typeof setupChess>>;
  beforeEach(async () => { t = await setupChess(); });

  describe('stats bundle', () => {
    it('shouldAskForTheBundleOnceAndNotForTheSevenRoutesWhenThePageOpens', async () => {
      await t.harness.navigateByUrl('/chess');
      const urls = t.pending().map((r) => r.request.url);
      expect(urls.filter((u) => u === '/api/stats/bundle')).toHaveLength(1);
      for (const r of ['summary', 'results', 'color', 'opponents', 'opponent-elo', 'timeline', 'recent']) expect(urls).not.toContain('/api/stats/' + r);
      expect(urls).toEqual(expect.arrayContaining(['/api/stats/openings', '/api/stats/phases', '/api/stats/mates', '/api/stats/threats']));
    });

    it('shouldNotFireTheSevenPerRouteReadsWhenTheBundleAnswers5xxBecauseThatOnlyOverloadsTheBackendMore', async () => {
      const asked: string[] = [];
      await t.harness.navigateByUrl('/chess');
      const api = chessApi({ '/api/stats/bundle': FAIL });
      for (let i = 0; i < 4; i++) { for (const r of t.pending()) { if (r.cancelled) continue; asked.push(r.request.urlWithParams); t.flush(r, api[r.request.url]); } TestBed.tick(); await new Promise((r) => setTimeout(r)); }
      for (const r of ['/api/stats/summary', '/api/stats/results', '/api/stats/color', '/api/stats/opponents', '/api/stats/opponent-elo', '/api/stats/timeline', '/api/stats/recent?limit=50'])
        expect(asked).not.toContain(r);
      expect(asked.filter((u) => u === '/api/stats/bundle')).toHaveLength(1);
    });

    it('shouldFallBackToEachRouteOnceAndKeepRenderingWhenTheBundleRouteIsMissing', async () => {
      const asked: string[] = [];
      await t.harness.navigateByUrl('/chess');
      const api = chessApi({ '/api/stats/bundle': MISSING });
      for (let i = 0; i < 4; i++) { for (const r of t.pending()) { asked.push(r.request.urlWithParams); t.flush(r, api[r.request.url]); } TestBed.tick(); await new Promise((r) => setTimeout(r)); }
      await t.harness.fixture.whenStable();
      for (const r of ['/api/stats/summary', '/api/stats/results', '/api/stats/color', '/api/stats/opponents', '/api/stats/opponent-elo', '/api/stats/timeline', '/api/stats/recent?limit=50'])
        expect(asked.filter((u) => u === r)).toHaveLength(1);
      expect(t.text('colDiff')).toBe('Blancas 70,0 % · Negras 45,0 % → +25,0 puntos de % (entre +3,8 y +43,3)');
    });
  });

  describe('layout (tests/ux-viewport.test.ts)', () => {
    it('shouldOrderSectionsLogicallyAndKeepTheOpponentEloCollapsed', async () => {
      await t.open();
      const ids = ['kpis', 'formCard', 'cg-comp', 'colCard', 'oppCard', 'cg-evo', 'evoCard', 'resCard', 'eloDetails', 'mb'];
      const els = ids.map((id) => t.el().querySelector('#' + id)!);
      expect(els.every(Boolean)).toBe(true);
      for (let i = 1; i < els.length; i++) expect(els[i - 1].compareDocumentPosition(els[i]) & Node.DOCUMENT_POSITION_FOLLOWING, ids[i]).toBeTruthy();
      expect((t.el().querySelector('#eloDetails') as HTMLDetailsElement).open).toBe(false);
      expect(t.el().querySelector('#kpiSub, .kpi-sub')).toBeNull();
    });
  });

  describe('layout on a phone', () => {
    const phone = (matches: boolean) => vi.stubGlobal('matchMedia', () => ({ matches }));
    afterEach(() => vi.unstubAllGlobals());
    const isOpen = (id: string) => (t.el().querySelector('#' + id) as HTMLDetailsElement).open;

    it('shouldStartWithOnlyTheFirstBlockOpenOnAPhone', async () => {
      phone(true);
      await t.open();
      expect(['cg-comp', 'cg-open', 'cg-evo', 'chessEngineProfileDetails'].map(isOpen)).toEqual([true, false, false, false]);
    });

    it('shouldKeepEveryBlockOpenOnADesktop', async () => {
      phone(false);
      await t.open();
      expect(['cg-comp', 'cg-open', 'cg-evo', 'chessEngineProfileDetails'].every(isOpen)).toBe(true);
    });
  });

  describe('hero', () => {
    it('shouldSayTheEloChangeIsAgainstTheFirstSnapshot', async () => {
      await t.open();
      expect(t.text('chessHeroElo')).toBe('1000');
      expect(t.text('chessHeroEloSub')).toBe('ELO · +100 vs primera lectura');
      expect(t.text('chessHeroMeta')).toBe('100 partidas disputadas · ELO observado en sincronizaciones');
      expect(t.text('kpis')).not.toContain('vs primera lectura'); // the hero is the one place for the ELO change
    });

    it('shouldShowTheHistoricalRateAndTheBotShareInTheHero', async () => {
      await t.open(chessApi({ '/api/stats/summary': { games: 1683, wins: 1046, losses: 505, draws: 132, winRate: 0.6216, scoreRate: 0.6, currentElo: 908, firstElo: 992 },
        '/api/stats/opponents': { macro: [{ key: 'bot', games: 1650 }, { key: 'pvp', games: 33 }] } }));
      expect(t.text('chessHeroWrLabel')).toBe('62,2 % de victorias (historial completo, todos los rivales)');
      expect(t.text('chessHeroDistMeta')).toBe('1046W · 505L · 132D');
      expect(t.text('chessHeroGames')).toBe('1650 de 1683 partidas contra bots');
      expect(t.text('chessHeroEloSub')).toBe('ELO · −84 vs primera lectura');
      expect(t.el().querySelector<HTMLElement>('#chessHeroDist .bar-win')!.style.width).toBe('62.2%');
    });

    it('shouldColourTheStreakPillByItsKind', async () => {
      await t.open();
      expect(t.el().querySelector('#chessHeroStreak')!.className.replace(/ ?u-\S+/g, '').trim()).toBe('pill pill-loss');
      expect(t.text('chessHeroStreak')).toBe('🔥 3 derrotas consecutivas');
    });

    it('shouldUseSingularAndTheWinColourForAStreakOfOneWin', async () => {
      await t.open(chessApi({ '/api/stats/summary': { ...summary, currentStreak: 1, currentStreakKind: 'win' } }));
      expect(t.el().querySelector('#chessHeroStreak')!.className.replace(/ ?u-\S+/g, '').trim()).toBe('pill pill-win');
      expect(t.text('chessHeroStreak')).toBe('🔥 1 victoria consecutiva');
      expect(t.text('streak')).toContain('Racha actual: 1 victoria');
    });

    it('shouldSaySinRachaActivaWhenThereIsNoStreak', async () => {
      await t.open(chessApi({ '/api/stats/summary': { ...summary, currentStreak: 0, currentStreakKind: null } }));
      expect(t.el().querySelector('#chessHeroStreak')!.className.replace(/ ?u-\S+/g, '').trim()).toBe('pill');
      expect(t.text('chessHeroStreak')).toBe('🔥 Sin racha activa');
    });

    it('shouldNotPrintZeroCountsInTheChessHeroWhenTheSummaryCarriesNoCounts', async () => {
      await t.open(chessApi({ '/api/stats/summary': { games: 3, winRate: 0.5 } }));
      expect(t.text('chessHeroDistMeta')).toBe('—');
      expect(t.el().querySelector('#chessHeroDist .bar-win')).toBeNull();
      expect(t.text('res')).toBe('—');
    });

    it('shouldSayThereIsNoComparableHistoryWhenThereIsOneSnapshot', async () => {
      await t.open(chessApi({ '/api/stats/timeline': { snapshots: [{ createdAt: '2026-10-08T10:00:00Z', elo: 1000 }] } }));
      expect(t.text('chessHeroEloSub')).toBe('ELO · sin histórico comparable');
    });

    it('shouldShowPlaceholdersNotZerosWhenNothingHasAnsweredYet', async () => {
      await t.harness.navigateByUrl('/chess');
      expect(t.text('chessHeroElo')).toBe('—');
      expect(t.text('chessHeroMeta')).toBe('—');
      expect(t.text('chessHeroDistMeta')).toBe('—');
      expect(t.text('chessHeroWrLabel')).toBe('% de victorias (historial completo, todos los rivales)');
      expect(t.text('kpis')).toBe('');
    });
  });

  describe('kpis, streak and form', () => {
    it('shouldLabelTheWindowWithTheGamesObservedNotTheRequestedLimit', async () => { // tests/epistemicWording.test.ts
      const rec = { ...(chessApi()['/api/stats/recent'] as object), limit: 50, games: 12, wins: 6, losses: 6, draws: 0, decided: 12 };
      await t.open(chessApi({ '/api/stats/recent': rec }));
      expect(t.text('form')).toContain('Últimas 12');
      expect(t.text('form')).not.toContain('Últimas 50');
    });

    it('shouldNotRepeatEloAndWinRateInTheKpis', async () => {
      await t.open();
      const kpis = [...t.el().querySelectorAll('#kpis m-kpi')].map((k) => k.textContent);
      expect(kpis).toEqual(['Partidas100', 'Score65,0 %victoria 1 · tablas 0,5']);
    });

    it('shouldShowTheCurrentBestAndWorstStreak', async () => {
      await t.open();
      expect(t.text('streak')).toBe('Racha actual: 3 derrotas · Mejor racha: 5W · Peor: 2L');
    });

    it('shouldNotShowZeroForAStreakTheSourceDidNotReport', async () => {
      await t.open(chessApi({ '/api/stats/summary': { ...summary, currentStreak: 0, longestWin: null, longestLoss: null } }));
      expect(t.text('streak')).toBe('Mejor racha: —');
    });

    it('shouldShowTheWindowAndTheGamesBeforeItWithTheirIntervalsAndTheDelta', async () => {
      await t.open();
      const form = t.text('form');
      expect(form).toContain('Últimas 50');
      expect(form).toContain('50,0 % [36–64] WR');
      expect(form).toContain('55,0 % score · 25W 20L 5D');
      expect(form).toContain('+2,5 puntos de % (entre −23,0 y +25,4) · sin evidencia suficiente vs anteriores');
      expect(form).toContain('Anteriores · 50');
      expect(form).not.toMatch(/score vs anteriores|vs\s+hist/); // the delta is against the earlier games, and only for the win rate
      expect(form).toContain('50,0 % [40–70] WR');
      expect(t.el().querySelector('#b50')!.getAttribute('aria-pressed')).toBe('true');
    });

    it('shouldShowTheLaterRecentWindowWhenAnEarlierOneAnswersLast', async () => {
      await t.open();
      t.el().querySelector<HTMLButtonElement>('#b20')!.click();
      await t.tick();
      const first = t.pending().find((r) => r.request.url === '/api/stats/recent')!;
      expect(first.request.params.get('limit')).toBe('20');
      t.el().querySelector<HTMLButtonElement>('#b100')!.click();
      await t.tick();
      expect(first.cancelled).toBe(true); // the earlier window can no longer answer into the card
      const later = t.pending().find((r) => r.request.url === '/api/stats/recent')!;
      expect(later.request.params.get('limit')).toBe('100');
      later.flush({ limit: 100, games: 100, wins: 90, losses: 10, draws: 0, winRate: 0.9, scoreRate: 0.9, before: { games: 0, wins: 0, losses: 0, draws: 0, winRate: null } });
      await t.tick();
      expect(t.text('form')).toContain('Últimas 100');
      expect(t.el().querySelector('#b100')!.getAttribute('aria-pressed')).toBe('true');
      expect(t.el().querySelector('#b20')!.getAttribute('aria-pressed')).toBe('false');
      expect(t.text('chessHeroWrLabel')).toContain('50,0 %'); // the hero is historical and does not follow the window
    });

    it('shouldShowUnavailableWhenARecentWindowFailsAfterOneSucceeded', async () => {
      await t.open();
      t.el().querySelector<HTMLButtonElement>('#b20')!.click();
      await t.tick();
      t.flush(t.pending().find((r) => r.request.url === '/api/stats/recent')!, FAIL);
      await t.tick();
      expect(t.text('form')).toBe('No disponible');
    });

    it('shouldShowNoDeltaWhenThereIsNone', async () => {
      const rec = { ...(chessApi()['/api/stats/recent'] as object), delta: null };
      await t.open(chessApi({ '/api/stats/recent': rec }));
      expect(t.text('form')).not.toContain('vs anteriores');
      expect(t.text('form')).not.toContain('Blancas'); // the colour split lives in Comparativa
    });
  });

  describe('comparativa, results, evolution and opponent ELO', () => {
    it('shouldShowConfidenceIntervalWithEveryColorDelta', async () => {
      await t.open();
      expect(t.text('colDiff')).toBe('Blancas 70,0 % · Negras 45,0 % → +25,0 puntos de % (entre +3,8 y +43,3)');
      expect(t.text('col')).toContain('Win 70,0 % [20–80]');
      expect(t.text('form')).toMatch(/puntos de % \(entre /);
    });

    it('shouldLeaveTheColourLineEmptyWhenAColourHasNoWinRate', async () => {
      await t.open(chessApi({ '/api/stats/color': { groups: [group({ key: 'white', winRate: 0.7 }), group({ key: 'black', winRate: null })], difference: null } }));
      expect(t.text('colDiff')).toBe('');
    });

    it('shouldSummariseBotsAgainstPlayersAndListEverySegmentWithItsGames', async () => {
      await t.open();
      expect(t.text('oppMacro')).toBe('Bots: 60 (60,0 %) · PvP: 40 (40,0 %)');
      const rows = [...t.el().querySelectorAll('#opp .row')].map((r) => r.textContent);
      expect(rows[0]).toContain('Neural');
      expect(rows[1]).toMatch(/^PvP7 · 7,0 %/); // the PvP sample size stays visible
    });

    it('shouldBreakDownLossesAndDrawsByHowTheGamesEnded', async () => {
      await t.open();
      expect(t.text('lossContext')).toBe('Derrotas: 4 mates · 2 desconexiones (10 %) · 3 rendiciones');
      expect(t.text('drawContext')).toBe('Tablas: 1 ahogados · 2 repetición · 1 material · 1 50 jugadas');
      expect(t.text('lossRateNote')).toBe('Sin contar desconexiones: 18 derrotas de 100 partidas (18 %)');
      expect(t.text('res')).toMatch(/65,0 % score/);
    });

    it('shouldNotAddALossRateNoteWhenNoLossWasADisconnection', async () => {
      await t.open(chessApi({ '/api/stats/results': { endConditions: { checkmate: { loss: 20, draw: 0 } } } }));
      expect(t.text('lossRateNote')).toBe('');
    });

    it('shouldSayHowManyDaysOfEloThereAreAndTheirRange', async () => {
      await t.open();
      expect(t.text('evoNote')).toBe('2 días con ELO leído · lecturas entre 900 y 1000 · +100 desde la primera lectura');
      expect(t.el().querySelector('#evo m-sparkline svg')).not.toBeNull();
    });

    it('shouldWriteTheOpponentEloSharesWithACommaAndASpace', async () => {
      await t.open();
      expect(t.text('elo')).toContain('40 con ELO');
      expect(t.text('elo')).toContain('40,0 % de 100 · media 1000 · 700 – 1500');
      expect(t.el().querySelectorAll('#elo .hist-row')).toHaveLength(2);
      expect(t.text('eloSummaryMeta')).toBe('· muestra conocida: 40 (40,0 %)');
      expect(t.text('eloNote')).toBe('40 / 100 matches have known opponent ELO');
    });
  });

  describe('failures', () => {
    it('shouldShowRetryAndNotClaimNoGamesWhenSummaryFails', async () => {
      await t.open(chessApi({ '/api/stats/bundle': FAIL, '/api/stats/summary': FAIL }));
      expect(t.text('kpis')).toContain('No se pudieron cargar las estadísticas de ajedrez.');
      expect(t.el().querySelector('#kpis [role=alert] button')!.textContent).toBe('Reintentar');
      expect(t.text('chessHeroMeta')).toBe('No se pudieron cargar las estadísticas');
      expect(t.text('chessHeroMeta')).not.toMatch(/Sin partidas registradas/);
    });

    it('shouldRefetchAndRecoverWhenRetryingAfterAFailedLoad', async () => {
      await t.open(chessApi({ '/api/stats/bundle': FAIL, '/api/stats/summary': FAIL }));
      t.el().querySelector<HTMLButtonElement>('#kpis [role=alert] button')!.click();
      await t.tick();
      const api = chessApi({ '/api/stats/summary': { ...summary, games: 7 } });
      const again = t.pending(); // match() takes them off the controller: answer them here
      expect(again.map((r) => r.request.url)).toContain('/api/stats/bundle'); // a retry asks the bundle again
      for (const r of again) t.flush(r, api[r.request.url]);
      await t.answer(api);
      expect(t.el().querySelector('#kpis [role=alert]')).toBeNull();
      expect(t.text('chessHeroMeta')).toMatch(/7 partidas disputadas/);
    });

    it('shouldKeepTheKpisAndSayNoDisponiblePerCardWhenTheBundleAndEveryOtherStatsRouteFail', async () => {
      const failing = Object.fromEntries(['results', 'color', 'opponents', 'opponent-elo', 'timeline', 'recent', 'openings', 'phases'].map((r) => ['/api/stats/' + r, FAIL]));
      await t.open(chessApi({ ...failing, '/api/stats/bundle': MISSING }));
      expect(t.text('kpis')).toContain('Partidas');
      for (const id of ['col', 'opp', 'evo', 'elo', 'form', 'lossContext']) expect(t.text(id)).toBe('No disponible');
      expect(t.text('chessHeroEloSub')).toBe('ELO · +100 vs primera lectura'); // the summary still knows the first ELO
    });

    it('shouldIgnoreStaleResponseWhenRouteChanged', async () => {
      await t.harness.navigateByUrl('/chess');
      const inFlight = t.pending();
      await t.harness.navigateByUrl('/elsewhere');
      for (const r of inFlight) expect(r.cancelled).toBe(true);
    });
  });

  describe('header freshness line', () => {
    it('shouldWriteTheChessUpdateDateWhileTheChessViewIsOpenAndClearItWhenLeaving', async () => {
      const stats = TestBed.inject(StatsService);
      await t.open();
      expect(stats.chessUpdated()).toBe('Ajedrez · actualizado 2026-10-08');
      await t.harness.navigateByUrl('/elsewhere');
      expect(stats.chessUpdated()).toBe('');
    });
  });

  describe('openings, phases, mates and mate threats', () => {
    it('shouldShowOpeningsByColourAndOfferThemInTheOpeningFilter', async () => {
      await t.open();
      expect(t.text('openingsWhite')).toContain('Española (Ruy López)');
      expect(t.text('openingsWhite')).not.toContain('ruy_lopez');
      expect(t.el().querySelector<HTMLElement>('#openingsBlack')!.hidden).toBe(true);
      t.el().querySelector<HTMLButtonElement>('#tabBtn-black')!.click();
      await t.tick();
      expect(t.el().querySelector<HTMLElement>('#openingsBlack')!.hidden).toBe(false);
      expect(t.el().querySelector('#tabBtn-black')!.getAttribute('aria-pressed')).toBe('true');
      expect(t.text('openingsBlack')).toContain('Siciliana');
      expect(t.text('openingsPop')).toBe('Con detalle: 5 de 100 partidas');
      t.el().querySelector<HTMLButtonElement>('#btnAllMatches')!.click();
      await t.tick();
      expect([...t.el().querySelectorAll('#fOpening option')].map((o) => (o as HTMLOptionElement).value)).toEqual(['', 'ruy_lopez', 'sicilian']);
    });

    it('shouldSayHowManyGamesHaveNoOpeningFamilyYet', async () => {
      await t.open(chessApi({ '/api/stats/openings': { white: [], black: [], unclassified: 7, population: { hydrated: 5, totalMatches: 100 } } }));
      expect(t.text('openingsPop')).toBe('Con detalle: 5 de 100 partidas · 7 sin clasificar');
    });

    it('shouldShowThePhasesWithTheirMedianLength', async () => {
      await t.open();
      expect(t.text('phasesBody')).toContain('Final');
      expect(t.text('phasesMeta')).toBe('Las partidas suelen durar 21 jugadas · con detalle: 10 partidas');
    });

    it('shouldNotShowZeroForAMedianTheSourceDidNotReport', async () => {
      await t.open(chessApi({ '/api/stats/phases': { phases: [], medianPlies: null, population: { hydrated: null } } }));
      expect(t.text('phasesMeta')).toBe('Las partidas suelen durar — jugadas · con detalle: — partidas');
    });

    it('shouldKeepTheKpisAndSayNoDisponibleWhenOpeningsOrPhasesCannotBeRead', async () => {
      await t.open(chessApi({ '/api/stats/openings': FAIL, '/api/stats/phases': FAIL }));
      expect(t.text('kpis')).toContain('Partidas');
      expect(t.text('openingsWhite')).toBe('No disponible');
      expect(t.text('phasesBody')).toBe('No disponible');
    });

    it('shouldListTheMatesGivenAndReceivedByTypeAndCountTheUntyped', async () => {
      await t.open();
      expect(t.text('matesGiven')).toContain('Mate del pasillo');
      expect(t.text('matesReceived')).toContain('Mate ahogado');
      expect(t.text('matesNote')).toBe('2 mates sin clasificar');
    });

    it('shouldHideTheMatesCardWhenThereIsNothingToShow', async () => {
      await t.open(chessApi({ '/api/stats/mates': { given: [], received: [], unclassified: 0 } }));
      expect(t.el().querySelector('#matesCard')).toBeNull();
    });

    it('shouldShowTheThreatRateWithItsDenominatorPerPhaseAndRecentAgainstTheRest', async () => {
      await t.open();
      expect(t.text('threatsMain')).toBe('Neutralizadas 283 de 499 (57 %) · te mataron 104 · el rival no las jugó 112');
      expect(t.text('threatsPhases')).toBe('Apertura 53 de 74 (72 %) · Medio juego 132 de 268 (49 %) · Final 98 de 157 (62 %)');
      expect(t.text('threatsTrend')).toBe('Últimas 100 partidas analizadas: 90 de 150 (60 %) · el resto (226): 193 de 349 (55 %)');
      const note = t.text('threatsNote');
      for (const s of ['Solo cuenta amenazas de mate en una jugada', 'Son cifras de tus partidas', 'sin margen de error', '12 partidas sin analizar', '2 no se pudieron reproducir', '1 con un formato que este panel no entiende'])
        expect(note).toContain(s);
    });

    it('shouldMarkAPhaseWithNoThreatsAsNoDataInsteadOfZeroPercent', async () => {
      const z = { faced: 0, neutralized: 0, missed: 0, unpunished: 0, rate: null };
      await t.open(chessApi({ '/api/stats/threats': { ...THREATS, byPhase: { ...THREATS.byPhase, endgame: z } } }));
      expect(t.text('threatsPhases')).toContain('Final sin amenazas');
    });

    it('shouldShowNothingMisleadingWhenNoThreatIsAnalysedOrFound', async () => {
      const z = { faced: 0, neutralized: 0, missed: 0, unpunished: 0, rate: null };
      await t.open(chessApi({ '/api/stats/threats': { ...THREATS, analysed: 0, pending: 1643, invalid: 0, unknownVersion: 0, gamesWithMissed: 0, totals: z } }));
      expect(t.text('threatsMain')).toBe('Todavía no hay partidas analizadas');
      expect(t.text('threatsNote')).toContain('1643 partidas sin analizar');
      expect(t.el().querySelector('#threatsMissedBtn')).toBeNull();
    });

    it('shouldSayThereWereNoThreatsWhenGamesWereAnalysedButNoneHadOne', async () => {
      const z = { faced: 0, neutralized: 0, missed: 0, unpunished: 0, rate: null };
      await t.open(chessApi({ '/api/stats/threats': { ...THREATS, gamesWithMissed: 0, totals: z } }));
      expect(t.text('threatsMain')).toBe('Sin amenazas de mate en 1 en las partidas analizadas');
    });

    it('shouldHideTheThreatsCardWhenTheEndpointFails', async () => {
      await t.open(chessApi({ '/api/stats/threats': { error: 'boom' } }));
      expect(t.el().querySelector('#threatsCard')).toBeNull();
    });

    it('shouldFilterTheMatchesTableToMissedThreatsWhenTheButtonIsPressed', async () => {
      await t.open();
      const btn = () => t.el().querySelector<HTMLButtonElement>('#threatsMissedBtn')!;
      expect(btn().textContent).toBe('Ver partidas donde no viste el mate (104)');
      btn().click();
      await t.tick();
      const req = t.pending().find((r) => r.request.url === '/api/matches')!;
      expect(req.request.params.get('missedThreat')).toBe('1');
      expect(btn().textContent).toBe('Quitar el filtro de mates no vistos');
    });
  });

  describe('a malformed section degrades alone', () => {
    const siblingsRender = () => {
      expect(t.text('kpis')).toContain('Partidas');
      expect(t.text('colDiff')).toContain('Blancas 70,0 %');
      expect(t.text('phasesMeta')).toBe('Las partidas suelen durar 21 jugadas · con detalle: 10 partidas');
    };

    it('shouldHideTheThreatsCardWhenAPhaseIsMissing', async () => {
      const { endgame: _gone, ...byPhase } = THREATS.byPhase;
      await t.open(chessApi({ '/api/stats/threats': { ...THREATS, byPhase } }));
      expect(t.el().querySelector('#threatsCard')).toBeNull();
      siblingsRender();
    });

    it('shouldHideTheMatesCardWhenItsListsAreNotLists', async () => {
      await t.open(chessApi({ '/api/stats/mates': { given: 'x', received: 7, unclassified: 2 } }));
      expect(t.el().querySelector('#matesCard')).toBeNull();
      siblingsRender();
    });

    it('shouldSayNoDisponibleWhenTheOpeningsAreNotLists', async () => {
      await t.open(chessApi({ '/api/stats/openings': { white: 'x', black: { a: 1 }, unclassified: 0, population: { hydrated: 5, totalMatches: 100 } } }));
      expect(t.text('openingsWhite')).toBe('No disponible');
      expect(t.text('openingsBlack')).toBe('No disponible');
      siblingsRender();
    });

    it('shouldSayNoDisponibleWhenAComparisonIsNotAList', async () => {
      const api = chessApi({ '/api/stats/phases': { phases: 'x', medianPlies: 42, population: { hydrated: 10 } }, '/api/stats/opponents': { macro: [], segments: { a: 1 } } });
      await t.open(api);
      expect(t.text('phasesBody')).toBe('No disponible');
      expect(t.text('opp')).toBe('No disponible');
      siblingsRender();
    });

    it('shouldSayNoDisponibleInPatternsWhenTheColourGroupsAreNotAList', async () => {
      await t.open(chessApi({ '/api/stats/color': { groups: 'x', difference: null } }));
      expect(t.text('chessPatternColorConclusion')).toBe('No disponible');
      expect(t.text('col')).toBe('No disponible');
      expect(t.text('kpis')).toContain('Partidas');
    });

    it('shouldSkipMatchRowsThatAreNotObjects', async () => {
      await t.open(chessApi({ '/api/matches': { rows: [null, 'x', { match_id: 'm1', opponent_name: 'Bot 8', result: 'win' }], total: 3 } }));
      expect(t.el().querySelectorAll('#mb tr')).toHaveLength(1);
      expect(t.text('mb')).toContain('Bot 8');
    });
  });

  describe('patterns', () => {
    it('shouldSayWhetherTheColourDifferenceIsDetectableAndPersistent', async () => {
      await t.harness.navigateByUrl('/chess');
      const api = chessApi({ '/api/stats/color': { groups: [group({ key: 'white', winRate: 0.68 }), group({ key: 'black', winRate: 0.62 })], difference: { diff: 0.06, lower: -0.18, upper: 0.30 } } });
      const all = t.pending(); // answer everything but the trajectory, to see the interim line
      for (const r of all) t.flush(r, api[r.request.url]);
      await t.tick();
      const traj = t.pending().find((r) => r.request.url === '/api/trajectory')!;
      expect(t.text('chessPatternColorConclusion')).toBe('Con estos datos no se puede asegurar que haya diferencia (+6,0 puntos de %; podría estar entre −18,0 y +30,0). · patrón persistente: comprobando…');
      traj.flush(api['/api/trajectory'] as object);
      await t.tick();
      expect(t.text('chessPatternColorConclusion')).toBe('Con estos datos no se puede asegurar que haya diferencia (+6,0 puntos de %; podría estar entre −18,0 y +30,0). · Patrón persistente (al menos 15 puntos de % y en las dos mitades): no demostrado');
    });

    it('shouldSaySinEvaluarWhenThePersistenceCannotBeRead', async () => {
      await t.open(chessApi({ '/api/trajectory': FAIL }));
      expect(t.text('chessPatternColorConclusion')).toBe('La diferencia se nota: +25,0 puntos de % (con estos datos, entre +3,8 y +43,3). · Patrón persistente (al menos 15 puntos de % y en las dos mitades): sin evaluar');
    });

    it('shouldSayThereIsNotEnoughColourDataOrThatItIsUnavailable', async () => {
      await t.open(chessApi({ '/api/stats/color': { groups: [], difference: null } }));
      expect(t.text('chessPatternColorConclusion')).toBe('Sin datos de color suficientes');
    });

    it('shouldSayNoDisponibleWhenTheColourRequestFails', async () => {
      await t.open(chessApi({ '/api/stats/bundle': MISSING, '/api/stats/color': FAIL }));
      expect(t.text('chessPatternColorConclusion')).toBe('No disponible');
    });

    it('shouldFormatStockfishCoverageWithExplicitDenominatorAndItsOwnDate', async () => {
      await t.open();
      expect(t.text('chessEngineCoverageVal')).toBe('0 de 100 partidas analizadas (0 %)');
      expect(t.text('chessEngineCoverageMeta')).toBe('Análisis pendiente · Denominador: 100 partidas guardadas en el historial (elegibles para análisis)');
      expect(t.text('chessPatternSuggested')).toBe('Partidas sugeridas para revisión: disponibles tras el análisis de motor.');
    });

    it('shouldShowThePartialCoverageAndNeverBorrowTheDateFromTheEloSnapshot', async () => {
      await t.open(chessApi({ '/api/stats/profile': { ...PROFILE, analysed: 42 } }));
      expect(t.text('chessEngineCoverageVal')).toBe('42 de 100 partidas analizadas (42,0 %)');
      expect(t.text('chessEngineCoverageMeta')).toBe('Denominador: 100 partidas guardadas en el historial (elegibles para análisis)');
      await t.harness.navigateByUrl('/elsewhere');
      await t.open(chessApi({ '/api/stats/profile': { ...PROFILE, analysed: 42, observedAt: '2026-11-02T10:00:00Z' } }));
      expect(t.text('chessEngineCoverageMeta')).toBe('Denominador: 100 partidas guardadas en el historial (elegibles para análisis) · observado 2026-11-02');
    });

    it('shouldSayTheCoverageIsUnavailableNotZeroWhenTheProfileFails', async () => {
      await t.open(chessApi({ '/api/stats/profile': FAIL }));
      expect(t.text('chessEngineCoverageVal')).toBe('No disponible');
      expect(t.text('chessPatternSuggested')).toBe('Partida sugerida para revisión: No disponible');
      expect(t.text('profileKpis')).toBe('No se pudo cargar el perfil');
    });

    it('shouldOfferTheSuggestedGameAndOpenItSafely', async () => {
      const worst = [{ matchId: 'game_malicious"onclick=alert(1)', opponent: 'Stockfish 8', serious: 4, acpl: 250 }];
      await t.open(chessApi({ '/api/stats/profile': { ...PROFILE, review: { worst, best: [] } } }));
      expect(t.text('chessPatternSuggested')).toContain('Partida sugerida para revisión (mayor pérdida media por jugada):');
      const btn = t.el().querySelector<HTMLButtonElement>('#chessPatternSuggested button')!;
      expect(btn.textContent).toBe('Revisar vs Stockfish 8 (4 errores graves)');
      btn.click();
      await t.tick();
      expect(t.pending().some((r) => r.request.url === '/api/me/matches/' + encodeURIComponent(worst[0].matchId) + '/game')).toBe(true);
    });

    it('shouldFilterMatchesAndScrollWhenColorChipsAreClicked', async () => {
      await t.open();
      const scrolled: string[] = [];
      Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this.id); };
      t.el().querySelector<HTMLButtonElement>('#chessPatternColorCard button')!.click();
      await t.tick();
      expect(scrolled).toEqual(['allMatchesCard']);
      expect(t.pending().find((r) => r.request.url === '/api/matches')!.request.params.get('color')).toBe('white');
      t.el().querySelector<HTMLButtonElement>('#chessPatternEngineCard button')!.click();
      expect(scrolled).toEqual(['allMatchesCard', 'chessEngineProfileDetails']);
      expect(t.el().querySelector<HTMLDetailsElement>('#chessEngineProfileDetails')!.open).toBe(true);
    });
  });

  describe('engine profile', () => {
    it('shouldAskForTheProfileWithTheSavedCutAndKeepProfileCutAcrossReloadWithSameStorageKey', async () => {
      localStorage.setItem('profile_since', 'cut');
      await t.harness.navigateByUrl('/chess');
      expect(t.pending().find((r) => r.request.url === '/api/stats/profile')!.request.urlWithParams).toBe('/api/stats/profile?since=cut');
    });

    it('shouldRememberTheCutAndAskAgainWhenAppliedOrCleared', async () => {
      await t.open(chessApi({ '/api/stats/profile': PROFILE }));
      const input = t.el().querySelector<HTMLInputElement>('#profileSinceInput')!;
      input.value = '  bot|1793359067|5j8ad1m8 ';
      t.el().querySelector<HTMLButtonElement>('#profileSinceApply')!.click();
      await t.tick();
      expect(localStorage.getItem('profile_since')).toBe('bot|1793359067|5j8ad1m8');
      const r = t.pending().find((x) => x.request.url === '/api/stats/profile')!;
      expect(r.request.urlWithParams).toBe('/api/stats/profile?since=' + encodeURIComponent('bot|1793359067|5j8ad1m8'));
      r.flush(PROFILE);
      await t.tick();
      t.el().querySelector<HTMLButtonElement>('#profileSinceClear')!.click();
      await t.tick();
      expect(localStorage.getItem('profile_since')).toBeNull();
      expect(t.pending().find((x) => x.request.url === '/api/stats/profile')!.request.urlWithParams).toBe('/api/stats/profile');
    });

    it('shouldSendOneRequestPerCutAndNeverPaintAnOlderOneThatArrivesLate', async () => {
      await t.open(chessApi({ '/api/stats/profile': PROFILE }));
      const input = t.el().querySelector<HTMLInputElement>('#profileSinceInput')!;
      const apply = t.el().querySelector<HTMLButtonElement>('#profileSinceApply')!;
      input.value = 'a';
      apply.click();
      await t.tick();
      const first = t.http.match((r) => r.url === '/api/stats/profile');
      expect(first.map((r) => r.request.urlWithParams)).toEqual(['/api/stats/profile?since=a']);
      input.value = 'b';
      apply.click();
      await t.tick();
      expect(first[0].cancelled).toBe(true); // the older cut's request is dropped, so it can never paint
      const second = t.http.match((r) => r.url === '/api/stats/profile');
      expect(second.map((r) => r.request.urlWithParams)).toEqual(['/api/stats/profile?since=b']);
      second[0].flush({ ...PROFILE, since: { matchId: 'b', playedAt: 5 }, before: sec({ games: 60 }), after: sec({ games: 70 }) });
      await t.tick();
      t.http.verify();
      expect(t.text('profileCut')).toContain('Partidas6070');
      expect(input.value).toBe('b');
    });

    it('shouldSurviveLocalStorageBeingUnavailable', async () => {
      const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
      const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
      try {
        await t.open(chessApi({ '/api/stats/profile': PROFILE }));
        expect(t.text('profileKpis')).toContain('Errores graves');
        t.el().querySelector<HTMLInputElement>('#profileSinceInput')!.value = 'x';
        t.el().querySelector<HTMLButtonElement>('#profileSinceApply')!.click();
        await t.tick();
        expect(t.pending().find((r) => r.request.url === '/api/stats/profile')!.request.urlWithParams).toBe('/api/stats/profile?since=x');
      } finally { get.mockRestore(); set.mockRestore(); }
    });
  });

  describe('game viewer', () => {
    it('shouldOpenTheGameOfAClickedRowInTheViewer', async () => {
      await t.open(chessApi({ '/api/matches': { rows: [{ match_id: 'm1', ply_count: 2, opponent_name: 'Bot 8', result: 'win' }], total: 1 } }));
      t.el().querySelector<HTMLElement>('#mb tr.gamerow')!.click();
      await t.tick();
      const asked = t.pending().filter((x) => x.request.url === '/api/me/matches/m1/game');
      expect(asked).toHaveLength(1); // one viewer, one request
      asked[0].flush({ ok: true, userColor: 'white', opponent: 'Bot 8', startFen: '8/8/8/8/8/8/8/8 w - - 0 1', plies: [] });
      await t.tick();
      t.http.verify();
      expect(t.text('gTitle')).toBe('vs Bot 8 · blancas');
      expect(document.querySelectorAll('[role=dialog]')).toHaveLength(1);
      expect(document.querySelectorAll('#gameModal')).toHaveLength(1);
    });
  });

  // Legacy showTab('profile') (src/dashboard.client.js:71–135): /profile is the chess view with the engine section open and scrolled to.
  describe('/profile route', () => {
    let scrolled: string[];
    beforeEach(() => { scrolled = []; Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this.id); }; });

    it('shouldOpenTheChessViewWithTheEngineSectionOpenAndScrolledToWhenTheRouteIsProfile', async () => {
      await t.harness.navigateByUrl('/profile');
      const asked = t.http.match((r) => r.url === '/api/stats/profile');
      expect(asked).toHaveLength(1); // asked once, like /chess
      asked[0].flush(PROFILE);
      await t.tick();
      expect(scrolled).toEqual([]); // not before the cards above it hold their data: they would push it out of view
      await t.answer(chessApi());
      t.http.verify();
      expect(t.el().querySelector('#chessTab')).not.toBeNull();
      expect(t.el().querySelector('#profileTab')).toBeNull(); // one panel only
      expect(t.el().querySelector<HTMLDetailsElement>('#chessEngineProfileDetails')!.open).toBe(true);
      expect(scrolled).toEqual(['chessEngineProfileDetails']);
    });

    it('shouldNotScrollToTheEngineSectionWhenTheRouteIsChess', async () => {
      await t.open();
      expect(scrolled).toEqual([]);
    });

    it('shouldKeepTheChessUpdateDateInTheHeaderOnProfileAndClearItWhenLeaving', async () => {
      const stats = TestBed.inject(StatsService);
      await t.harness.navigateByUrl('/profile');
      await t.answer(chessApi());
      expect(stats.chessUpdated()).toBe('Ajedrez · actualizado 2026-10-08');
      await t.harness.navigateByUrl('/elsewhere');
      expect(stats.chessUpdated()).toBe('');
    });

    it('shouldAskForTheProfileWithTheSavedCutWhenOpenedDirectlyOnProfile', async () => {
      localStorage.setItem('profile_since', 'cut');
      await t.harness.navigateByUrl('/profile');
      expect(t.pending().find((r) => r.request.url === '/api/stats/profile')!.request.urlWithParams).toBe('/api/stats/profile?since=cut');
    });
  });

  describe('page index', () => {
    it('shouldOpenAndScrollToEachBlockWhenItsIndexButtonIsPressed', async () => {
      await t.open();
      const scrolled: string[] = [];
      Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this.id); };
      const evo = t.el().querySelector<HTMLDetailsElement>('#cg-evo')!;
      evo.open = false;
      const buttons = [...t.el().querySelectorAll<HTMLButtonElement>('nav.cindex button')];
      expect(buttons.map((b) => b.textContent)).toEqual(['Comparativa', 'Aperturas', 'Evolución', 'Partidas']);
      for (const b of buttons) b.click();
      expect(scrolled).toEqual(['cg-comp', 'cg-open', 'cg-evo', 'allMatchesCard']);
      expect(evo.open).toBe(true);
    });

    it('shouldPutTheSectionInTheUrlWhenItsIndexButtonIsPressedAndOpenItFromTheUrl', async () => {
      await t.open();
      Element.prototype.scrollIntoView = function () {};
      t.el().querySelectorAll<HTMLButtonElement>('nav.cindex button')[1].click();
      await t.tick();
      expect(t.harness.fixture.debugElement.injector.get(Router).url).toBe('/chess?s=aperturas');
      const evo = t.el().querySelector<HTMLDetailsElement>('#cg-evo')!;
      evo.open = false;
      await t.harness.navigateByUrl('/chess?s=evolucion');
      await t.tick();
      await t.tick();
      expect(evo.open).toBe(true);
    });
  });
});

// Ports of frontendWinRateCi (renderCompare) and chessDashboard P3/P4.
describe('m-compare', () => {
  const g = (o: object) => ({ key: 'white', games: 0, wins: 0, losses: 0, draws: 0, unknown: 0, decided: 0, winRate: null, scoreRate: null, winRateCi: null, ...o });
  const render = async (groups: object[], total: number, cap?: number, noun?: string) => {
    const f = TestBed.createComponent(Compare);
    f.componentRef.setInput('groups', groups);
    f.componentRef.setInput('total', total);
    if (cap) f.componentRef.setInput('cap', cap);
    if (noun) f.componentRef.setInput('noun', noun);
    await f.whenStable();
    return f.nativeElement as HTMLElement;
  };
  const widths = (el: HTMLElement) => ['win', 'loss', 'draw'].map((k) => el.querySelector<HTMLElement>('.bar-' + k)!.style.width);

  it('shouldShowIntervalNextToWinRateWhenPresent', async () => {
    const el = await render([g({ games: 20, wins: 13, losses: 7, decided: 20, winRate: 0.65, winRateCi: { lower: 0.4327, upper: 0.8188 } })], 20);
    expect(el.textContent).toContain('Win 65,0 % [43–82]');
  });

  it('shouldShowDashWhenThereIsNoInterval', async () => {
    const el = await render([g({ games: 3, unknown: 3 })], 3);
    expect(el.textContent).not.toMatch(/\[\d/);
    expect(el.textContent).toContain('Win —');
  });

  it('shouldSizeBarsOverDecidedGamesAndLeaveUnknownsOut', async () => {
    const el = await render([g({ games: 10, wins: 2, losses: 2, draws: 1, unknown: 5, decided: 5, winRate: 0.4 })], 10);
    expect(widths(el)).toEqual(['40%', '40%', '20%']);
    expect(el.textContent).toContain('· barra sobre 5 decididas · 5 sin resultado');
  });

  it('shouldDrawEmptyBarsWhenNothingDecided', async () => {
    expect(widths(await render([g({ games: 2, unknown: 2 })], 2))).toEqual(['0%', '0%', '0%']);
  });

  it('shouldSaySinDatosWhenThereAreNoGroups', async () => {
    expect((await render([], 10)).textContent!.trim()).toBe('Sin datos');
  });

  const phase = (o: object = {}) => g({ key: 'opening', label: 'Apertura', games: 169, wins: 52, losses: 115, draws: 2, decided: 169, winRate: 0.308, winRateCi: { lower: 0.24, upper: 0.38 }, scoreRate: 0.31, disconnections: 54,
    competitive: { games: 115, decided: 115, winRate: 0.452, winRateCi: { lower: 0.36, upper: 0.55 } }, ...o });
  it('shouldKeepThePhaseRowAndAddTheWinRateWithoutDisconnectionsAndTheirCount', async () => {
    const t = (await render([phase()], 1683)).textContent!;
    expect(t).toContain('Win 30,8 %');
    expect(t).toContain('Sin desconexiones: Win 45,2 % [36–55] en 115 decididas');
    expect(t).toContain('· 54 derrotas por desconexión (47 % de las derrotas)');
  });

  it('shouldSaySoWhenAPhaseHasNoDisconnections', async () => {
    expect((await render([phase({ disconnections: 0 })], 100)).textContent).toContain('Sin desconexiones en esta fase');
  });

  it('shouldLeaveOtherComparisonsUntouched', async () => {
    expect((await render([phase({ disconnections: undefined, competitive: undefined, key: 'white' })], 100)).textContent).not.toContain('desconexi');
  });

  it('shouldShowTheFirstRowsAndKeepTheRestOneTapAwayWithoutDroppingAny', async () => {
    const many = Array.from({ length: 43 }, (_, i) => g({ key: `o${i}`, label: `Apertura ${i}`, games: 10 + i }));
    const el = await render(many, 1000, 8, 'aperturas');
    expect(el.querySelectorAll(':scope > .row')).toHaveLength(8);
    expect(el.querySelectorAll('details.more-rows .row')).toHaveLength(35);
    expect(el.querySelector('details.more-rows summary')!.textContent).toBe('Ver 35 aperturas más');
    expect(el.textContent).toContain('Apertura 42');
  });

  it('shouldNotAddAFoldToAShortListOrWhereNoCapIsAsked', async () => {
    expect((await render(Array.from({ length: 8 }, () => g({ games: 1 })), 100, 8)).querySelector('.more-rows')).toBeNull();
    expect((await render(Array.from({ length: 20 }, () => g({ games: 1 })), 100)).querySelectorAll('.row')).toHaveLength(20);
  });
});

// Port of paintProfile (src/dashboard.client.js:1680–1770) and tests/chessDashboardEngine "profile tab".
const sec = (o: object = {}) => ({
  games: 100, moves: 4000, serious: 388, ratePer100: 9.7, acpl: 102.5,
  byPhase: { opening: { moves: 1000, serious: 85, ratePer100: 8.5 }, middlegame: { moves: 2400, serious: 271, ratePer100: 11.3 }, endgame: { moves: 600, serious: 26, ratePer100: 4.3 } },
  byColor: { white: { games: 50, moves: 2000, serious: 184, ratePer100: 9.2 }, black: { games: 50, moves: 2000, serious: 204, ratePer100: 10.2 } },
  decisive: { lossGames: 40, withDecisive: 30, medianMove: 10, byPhase: { opening: 15, middlegame: 14, endgame: 1 },
    competitive: { lossGames: 30, withDecisive: 24, medianMove: 12, byPhase: { opening: 12, middlegame: 11, endgame: 1 } },
    disconnection: { lossGames: 10, withDecisive: 6, byPhase: { opening: 3, middlegame: 3, endgame: 0 } } },
  conversion: { advantage: { games: 80, win: 62, draw: 6, loss: 12 }, disadvantage: { games: 20, win: 10, draw: 2, loss: 8 }, thrown: 12 },
  ...o,
});
const row = (id: string, acpl: number, o: object = {}) => ({ matchId: id, result: 'loss', opponent: 'Stockfish Bot', playedAt: 1790000000, color: 'white', moves: 30, serious: 6, acpl, decisivePly: 12, ...o });
const PROFILE = {
  analysed: 100, pending: 3, invalid: 1, unknownVersion: 2, bots: { games: 98, total: 100, share: 0.98 }, since: null,
  all: sec(), before: null, after: null,
  blocks: [{ games: 50, moves: 2000, serious: 200, ratePer100: 10, acpl: 100, partial: false }, { games: 50, moves: 2000, serious: 188, ratePer100: 9.4, acpl: 90, partial: true }],
  review: { worst: [row('bot|111|aaaaaaaa', 395)], best: [row('bot|222|bbbbbbbb', 5)] },
};
const EMPTY = { ...PROFILE, analysed: 0, pending: 1648, all: sec({ games: 0, moves: 0, serious: 0, ratePer100: null, acpl: null }), blocks: [], review: { worst: [], best: [] } };

describe('EngineProfile', () => {
  let el: HTMLElement;
  let fixture: ReturnType<typeof TestBed.createComponent<EngineProfile>>;
  const render = async (profile: unknown, cut = '') => {
    fixture.componentRef.setInput('profile', profile as Profile);
    fixture.componentRef.setInput('cut', cut);
    TestBed.tick();
    // the matches list the panel opens games into asks for its first page: answer it, or whenStable() waits on it
    for (const r of TestBed.inject(HttpTestingController).match(() => true)) r.flush({ rows: [], total: 0 });
    await fixture.whenStable();
    return el;
  };
  const text = (id: string) => el.querySelector('#' + id)!.textContent!.trim();

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [MatchesService, provideHttpClient(), provideHttpClientTesting()] });
    fixture = TestBed.createComponent(EngineProfile);
    el = fixture.nativeElement;
  });

  it('shouldSayTheReviewListIsOrderedByAverageLossPerMoveNotBySeriousErrors', async () => { // tests/uxPhase4.test.ts
    await render(PROFILE);
    expect(text('profileReviewCard')).toContain('ordenadas por pérdida media por jugada');
    expect(text('profileReviewCard')).toContain('información adicional, no como criterio de orden');
  });

  it('shouldHeadlineFourPlainLanguageFiguresWithTheirDenominators', async () => {
    await render(PROFILE);
    expect([...el.querySelectorAll('#profileKpis m-kpi')].map((k) => [k.querySelector('b')!.textContent, k.querySelector('small')!.textContent])).toEqual([
      ['9,7', 'por 100 jugadas · 388 de 4000'],
      ['1,0', 'peones por jugada'],
      ['80 %', '24 de 30 derrotas sin desconexión · 10 por desconexión aparte'],
      ['78 %', '62 de 80 · 12 perdidas'],
    ]);
  });

  it('shouldNameTheWorstPhaseInAFixedRuleSentence', async () => {
    await render(PROFILE);
    expect(text('profileVerdict')).toBe('Mayor tasa observada de errores graves: medio juego (11,3 por 100 jugadas; final: 4,3). Hay un momento decisivo en 80 % de tus derrotas sin desconexión (24 de 30), con mediana en tu jugada 12.');
  });

  it('shouldDrawPhaseAndColourBarsWithRateAndCount', async () => {
    await render(PROFILE);
    const bars = (id: string) => [...el.querySelectorAll(`#${id} .prof-bar`)].map((b) => [...b.children].map((c) => c.textContent));
    expect(bars('profilePhases')[1]).toEqual(['Medio juego', '', '11,3', '271 de 2400']);
    expect(el.querySelector<HTMLElement>('#profilePhases .prof-bar:nth-child(2) i')!.style.width).toBe('100%');
    expect(bars('profileColors').map((b) => b[3])).toEqual(['184 de 2000', '204 de 2000']);
  });

  it('shouldDrawTheTrendByBlocksAndMarkThePartialOne', async () => {
    await render(PROFILE);
    const cols = [...el.querySelectorAll<HTMLElement>('#profileTrend .prof-cols i')];
    expect(cols.map((c) => c.title)).toEqual(['Partidas 1–50: 10,0 por 100 jugadas (200 de 2000 jugadas)', 'Partidas 51–100: 9,4 por 100 jugadas (188 de 2000 jugadas) · bloque incompleto']);
    expect(cols.map((c) => c.className)).toEqual(['', 'partial']);
    expect(text('profileTrend')).toContain('Primeras partidas · 10,0');
    expect(text('profileTrend')).toContain('Últimas · 9,4 (incompleto)');
  });

  it('shouldExplainWhenThereAreNotEnoughBlocksForATrend', async () => {
    await render({ ...PROFILE, blocks: [PROFILE.blocks[0]] });
    expect(text('profileTrend')).toContain('al menos dos bloques');
  });

  it('shouldRenderDecisiveMomentsSharesByPhase', async () => {
    await render(PROFILE);
    const d = text('profileDecisive');
    expect(d).toContain('24 de 30 derrotas sin desconexión tienen un momento decisivo, a la mitad de los casos antes de tu jugada 12.');
    expect([...el.querySelectorAll('#profileDecisive .prof-bar b')].map((b) => b.textContent)).toEqual(['50 %', '46 %', '4 %']);
    expect(d).toContain('Aparte: 10 derrotas por desconexión (6 con un momento decisivo registrado)');
  });

  it('shouldNotRenderZeroOfZeroWhenEveryLossWasADisconnection', async () => {
    const all = sec({ decisive: { lossGames: 10, withDecisive: 6, medianMove: 5, byPhase: { opening: 6, middlegame: 0, endgame: 0 },
      competitive: { lossGames: 0, withDecisive: 0, medianMove: null, byPhase: { opening: 0, middlegame: 0, endgame: 0 } },
      disconnection: { lossGames: 10, withDecisive: 6, byPhase: { opening: 6, middlegame: 0, endgame: 0 } } } });
    await render({ ...PROFILE, all });
    expect(text('profileDecisive')).not.toContain('0 de 0');
    expect(text('profileDecisive')).toContain('Ninguna derrota fue una partida competitiva');
    expect(text('profileDecisive')).toContain('Aparte: 10 derrotas por desconexión');
    expect(text('profileKpis')).not.toContain('0 de 0');
    expect(text('profileVerdict')).not.toContain('0 de 0');
  });

  it('shouldRenderConversionWithDrawsApartAndNoUnexplainedThreshold', async () => {
    await render(PROFILE);
    const c = text('profileConversion');
    expect(c).toContain('Con ventaja de más de 3 peones');
    expect(c).toContain('Ganadas 78 % (62)');
    expect(c).toContain('Tablas 6');
    expect(c).toContain('Con desventaja de más de 3 peones');
  });

  it('shouldShowFiveGamesPerReviewListAndKeepTheRestOneTapAway', async () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ ...row(`g${i}`, 500 - i), opponent: `Rival ${i}` }));
    await render({ ...PROFILE, review: { worst: mk(20), best: mk(20) } });
    for (const id of ['profileWorst', 'profileBest']) {
      expect(el.querySelectorAll(`#${id} > .prof-game`)).toHaveLength(5);
      expect(el.querySelectorAll(`#${id} details.more-rows .prof-game`)).toHaveLength(15);
      expect(el.querySelector(`#${id} details.more-rows summary`)!.textContent).toBe('Ver 15 partidas más');
    }
    await render({ ...PROFILE, review: { worst: mk(4), best: [] } });
    expect(el.querySelector('#profileWorst .more-rows')).toBeNull();
  });

  it('shouldIdentifyReviewGamesByOpponentDateAndWhatWentWrongAndOpenThem', async () => {
    await render(PROFILE);
    const a = el.querySelector<HTMLAnchorElement>('#profileWorst .prof-game')!;
    expect(a.querySelector('b')!.textContent).toBe('Stockfish Bot');
    expect(a.querySelector('.pill')!.className).toBe('pill pill-loss');
    expect(a.textContent).toContain('Se torció en tu jugada 6. 6 errores graves en 30 jugadas · pérdida media de evaluación: 4,0 peones por jugada');
    expect(a.textContent).toContain(new Date(1790000000 * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) + ' · blancas');
    a.click();
    expect(TestBed.inject(MatchesService).openId()).toBe('bot|111|aaaaaaaa');
  });

  it('shouldNameNamelessOpponentsBots', async () => {
    await render({ ...PROFILE, review: { worst: [row('m1', 40, { opponent: null, decisivePly: null })], best: [] } });
    expect(el.querySelector('#profileWorst .prof-game b')!.textContent).toBe('Bot');
  });

  it('shouldCompareBeforeAndAfterTheCutAndWarnWhenTheSampleIsSmall', async () => {
    await render({ ...PROFILE, since: { matchId: 'cut', playedAt: 5 }, before: sec({ games: 60, ratePer100: 10 }), after: sec({ games: 23, ratePer100: 6.25 }) }, 'cut');
    const cells = [...el.querySelectorAll('#profileCut .prof-cmp > *')].map((c) => c.textContent);
    expect(cells.slice(4, 12)).toEqual(['Partidas', '60', '23', '', 'Errores graves por 100 jugadas', '10.0', '6.3', '−3.8']);
    expect(el.querySelector('#profileCut .pill-win')!.textContent).toBe('−3.8');
    expect(text('profileCut')).toContain('Solo 23 partidas después del corte');
    expect(text('profileSinceNote')).toBe('');
  });

  it('shouldNotWarnOnceThereAreFiftyGamesAfterTheCut', async () => {
    await render({ ...PROFILE, since: { matchId: 'cut', playedAt: 5 }, before: sec({ games: 60 }), after: sec({ games: 50, ratePer100: 12 }) }, 'cut');
    expect(text('profileCut')).not.toContain('Solo ');
    expect(el.querySelector('#profileCut .pill-loss')!.textContent).toBe('+2.3');
  });

  it('shouldExplainAnUnknownCutInsteadOfSilentlyShowingEverything', async () => {
    await render(PROFILE, 'nope');
    expect(text('profileSinceNote')).toBe('No encontré esa partida con fecha: se muestra todo sin dividir.');
    expect(el.querySelector<HTMLInputElement>('#profileSinceInput')!.value).toBe('nope');
  });

  it('shouldSayUpFrontThatMostGamesAreAgainstBotsAndWhatIsLeftOut', async () => {
    await render(PROFILE);
    expect(text('profileContext')).toContain('98 % contra bots');
    const note = text('profileNote');
    for (const s of ['3 partidas sin analizar', '1 no se pudieron evaluar', '2 con un formato que este panel no entiende', 'sin margen de error']) expect(note).toContain(s);
  });

  it('shouldShowNothingMisleadingWhenNothingIsAnalysedYet', async () => {
    await render({ ...PROFILE, since: null, before: sec(), after: sec() }, 'cut');
    await render(EMPTY);
    expect(text('profileKpis')).toBe('Todavía no hay partidas analizadas');
    expect(text('profileNote')).toContain('1648 partidas sin analizar');
    expect(text('profileContext')).toBe('Calculado con Stockfish sobre tus partidas guardadas.');
    for (const id of ['profileVerdict', 'profilePhases', 'profileColors', 'profileTrend', 'profileCut', 'profileDecisive', 'profileConversion', 'profileWorst', 'profileBest']) expect(text(id)).toBe('');
  });

  it('shouldShowAnErrorLineWhenTheProfileCannotBeLoadedOrRead', async () => {
    await render(null);
    expect(text('profileKpis')).toBe('No se pudo cargar el perfil');
    expect(text('profileNote')).toBe('');
    await render({ analysed: 5 }); // a body this panel cannot read is not a profile
    expect(text('profileKpis')).toBe('No se pudo cargar el perfil');
  });

  // A wrong-typed field degrades its own section to "No disponible" (a KPI to "—"); the siblings render, nothing reads NaN.
  const bad = 'x' as unknown as number;
  const all = (o: object) => ({ ...PROFILE, all: sec(o) });
  const withCut = (o: object) => ({ ...PROFILE, since: { matchId: 'cut', playedAt: 5 }, before: sec(o), after: sec({ games: 70 }) });
  const SECTIONS = ['profileContext', 'profileVerdict', 'profileCut', 'profilePhases', 'profileColors', 'profileTrend', 'profileDecisive', 'profileConversion', 'profileWorst', 'profileBest'];
  it.each<[string, object, string[], number[]]>([
    ['context', { ...PROFILE, bots: { share: bad } }, ['profileContext'], []],
    ['first KPI', all({ ratePer100: bad }), [], [0]],
    ['second KPI', all({ acpl: bad }), [], [1]],
    ['verdict (and the decisive card that shares the count)', all({ decisive: { ...sec().decisive, competitive: { ...sec().decisive.competitive, withDecisive: bad } } }), ['profileVerdict', 'profileDecisive'], [2]],
    ['phase and colour bars', all({ byColor: { white: { moves: 2000, serious: 184, ratePer100: bad }, black: sec().byColor.black } }), ['profilePhases', 'profileColors'], []],
    ['trend', { ...PROFILE, blocks: [PROFILE.blocks[0], { ...PROFILE.blocks[1], ratePer100: bad }] }, ['profileTrend'], []],
    ['decisive moments', all({ decisive: { ...sec().decisive, competitive: { ...sec().decisive.competitive, byPhase: { opening: bad, middlegame: 11, endgame: 1 } } } }), ['profileDecisive'], []],
    ['conversion', all({ conversion: { ...sec().conversion, disadvantage: { games: 20, win: bad, draw: 2, loss: 8 } } }), ['profileConversion'], []],
    ['worst games', { ...PROFILE, review: { worst: [row('w', bad)], best: PROFILE.review.best } }, ['profileWorst'], []],
    ['best games', { ...PROFILE, review: { worst: PROFILE.review.worst, best: 'nope' } }, ['profileBest'], []],
    ['before/after comparison', withCut({ ratePer100: bad }), ['profileCut'], []],
  ])('shouldDegradeOnlyThe %s when its field is unreadable', async (_, body, na, kpisNa) => {
    await render(body, 'cut');
    for (const id of SECTIONS) {
      if (na.includes(id)) expect(text(id)).toBe('No disponible');
      else expect(text(id)).not.toBe('No disponible');
    }
    const kpis = [...el.querySelectorAll('#profileKpis m-kpi')].map((k) => k.querySelector('b')!.textContent);
    expect(kpis).toHaveLength(4);
    kpis.forEach((v, i) => kpisNa.includes(i) ? expect(v).toBe('—') : expect(v).not.toBe('—'));
    expect(el.textContent).not.toContain('NaN');
    for (const i of el.querySelectorAll<HTMLElement>('i[style]')) expect(i.getAttribute('style')).not.toMatch(/NaN|-\d/);
  });

  it('shouldNotRenderNaNCentipawnsWhenTheAverageLossIsMissing', async () => {
    await render(all({ acpl: null }));
    expect(el.querySelectorAll('#profileKpis m-kpi small')[1].textContent).toBe('peones por jugada');
  });

  it('shouldEmitTheTrimmedCutOnApplyAndAnEmptyOneOnClear', async () => {
    await render(PROFILE);
    const applied: string[] = [];
    fixture.componentInstance.cutChange.subscribe((v) => applied.push(v));
    el.querySelector<HTMLInputElement>('#profileSinceInput')!.value = '  bot|1793359067|5j8ad1m8 ';
    el.querySelector<HTMLButtonElement>('#profileSinceApply')!.click();
    el.querySelector<HTMLButtonElement>('#profileSinceClear')!.click();
    expect(applied).toEqual(['bot|1793359067|5j8ad1m8', '']);
    expect(el.querySelector<HTMLInputElement>('#profileSinceInput')!.value).toBe('');
  });
});
