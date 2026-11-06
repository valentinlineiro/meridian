import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { StatsService } from '../../core/stats.service';
import { Chess } from './chess.component';
import { Compare } from './compare.component';

// Ports of tests/chessDashboard, chessDashboardThreats, chessDashboardEngine (chess tab), frontendErrorIsNotZero and
// frontendEmptyAndErrorStates (chess cases), frontendNetwork (chess), frontendWinRateCi, frontendDeltas (colour/form),
// uxPhase2/uxPhase4 (chess cases). An unanswered or failed request is "No disponible" / "—", never 0 or an empty state.
export const FAIL = Symbol('500');
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
    providers: [provideRouter([{ path: 'chess', component: Chess }, { path: ':other', component: Elsewhere }]), provideHttpClient(), provideHttpClientTesting()],
  });
  const http = TestBed.inject(HttpTestingController);
  const harness = await RouterTestingHarness.create();
  const pending = (): TestRequest[] => http.match(() => true).filter((r) => !r.cancelled);
  const flush = (r: TestRequest, body: unknown) => body === FAIL ? r.flush({ ok: false }, { status: 500, statusText: 'Internal Server Error' }) : r.flush(body as object);
  // Answers every request the page makes, in rounds (the fallback routes are asked after the bundle), then renders.
  const answer = async (api: Api) => {
    for (let round = 0; round < 6; round++) {
      const reqs = pending();
      if (!reqs.length) break;
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

    it('shouldFallBackToEachRouteOnceAndKeepRenderingWhenTheBundleFails', async () => {
      const asked: string[] = [];
      await t.harness.navigateByUrl('/chess');
      const api = chessApi({ '/api/stats/bundle': FAIL });
      for (let i = 0; i < 4; i++) { for (const r of t.pending()) { asked.push(r.request.urlWithParams); t.flush(r, api[r.request.url]); } TestBed.tick(); await new Promise((r) => setTimeout(r)); }
      await t.harness.fixture.whenStable();
      for (const r of ['/api/stats/summary', '/api/stats/results', '/api/stats/color', '/api/stats/opponents', '/api/stats/opponent-elo', '/api/stats/timeline', '/api/stats/recent?limit=50'])
        expect(asked.filter((u) => u === r)).toHaveLength(1);
      expect(t.text('colDiff')).toBe('Blancas 70,0 % · Negras 45,0 % → +25,0 pp · IC95 [+3,8; +43,3]');
    });
  });

  describe('hero', () => {
    it('shouldSayTheEloChangeIsAgainstTheFirstSnapshot', async () => {
      await t.open();
      expect(t.text('chessHeroElo')).toBe('1000');
      expect(t.text('chessHeroEloSub')).toBe('ELO · +100 vs primer snapshot');
      expect(t.text('chessHeroMeta')).toBe('100 partidas disputadas · ELO observado en sincronizaciones');
      expect(t.text('kpis')).not.toContain('vs primer snapshot'); // the hero is the one place for the ELO change
    });

    it('shouldShowTheHistoricalRateAndTheBotShareInTheHero', async () => {
      await t.open(chessApi({ '/api/stats/summary': { games: 1683, wins: 1046, losses: 505, draws: 132, winRate: 0.6216, scoreRate: 0.6, currentElo: 908, firstElo: 992 },
        '/api/stats/opponents': { macro: [{ key: 'bot', games: 1650 }, { key: 'pvp', games: 33 }] } }));
      expect(t.text('chessHeroWrLabel')).toBe('62,2 % de victorias (historial completo, todos los rivales)');
      expect(t.text('chessHeroDistMeta')).toBe('1046W · 505L · 132D');
      expect(t.text('chessHeroGames')).toBe('1650 de 1683 partidas contra bots');
      expect(t.text('chessHeroEloSub')).toBe('ELO · −84 vs primer snapshot');
      expect(t.el().querySelector<HTMLElement>('#chessHeroDist .bar-win')!.style.width).toBe('62.2%');
    });

    it('shouldColourTheStreakPillByItsKind', async () => {
      await t.open();
      expect(t.el().querySelector('#chessHeroStreak')!.className).toBe('pill pill-loss');
      expect(t.text('chessHeroStreak')).toBe('🔥 3 derrotas consecutivas');
    });

    it('shouldUseSingularAndTheWinColourForAStreakOfOneWin', async () => {
      await t.open(chessApi({ '/api/stats/summary': { ...summary, currentStreak: 1, currentStreakKind: 'win' } }));
      expect(t.el().querySelector('#chessHeroStreak')!.className).toBe('pill pill-win');
      expect(t.text('chessHeroStreak')).toBe('🔥 1 victoria consecutiva');
      expect(t.text('streak')).toContain('Racha actual: 1 victoria');
    });

    it('shouldSaySinRachaActivaWhenThereIsNoStreak', async () => {
      await t.open(chessApi({ '/api/stats/summary': { ...summary, currentStreak: 0, currentStreakKind: null } }));
      expect(t.el().querySelector('#chessHeroStreak')!.className).toBe('pill');
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
      expect(form).toContain('+2,5 pp · IC95 [−23,0; +25,4] · sin evidencia suficiente vs anteriores');
      expect(form).toContain('Anteriores · 50');
      expect(form).toContain('50,0 % [40–70] WR');
      expect(t.el().querySelector('#b50')!.className).toBe('btn btn-p');
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
      expect(t.el().querySelector('#b100')!.className).toBe('btn btn-p');
      expect(t.el().querySelector('#b20')!.className).toBe('btn btn-g');
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
      expect(t.text('colDiff')).toBe('Blancas 70,0 % · Negras 45,0 % → +25,0 pp · IC95 [+3,8; +43,3]');
      expect(t.text('col')).toContain('Win 70,0 % [20–80]');
      expect(t.text('form')).toMatch(/pp · IC95 \[/);
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
      const failing = Object.fromEntries(['bundle', 'results', 'color', 'opponents', 'opponent-elo', 'timeline', 'recent', 'openings', 'phases'].map((r) => ['/api/stats/' + r, FAIL]));
      await t.open(chessApi(failing));
      expect(t.text('kpis')).toContain('Partidas');
      for (const id of ['col', 'opp', 'evo', 'elo', 'form', 'lossContext']) expect(t.text(id)).toBe('No disponible');
      expect(t.text('chessHeroEloSub')).toBe('ELO · +100 vs primer snapshot'); // the summary still knows the first ELO
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

  describe('page index', () => {
    it('shouldOpenAndScrollToEachBlockWhenItsIndexButtonIsPressed', async () => {
      await t.open();
      const scrolled: string[] = [];
      Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this.id); };
      const evo = t.el().querySelector<HTMLDetailsElement>('#cg-evo')!;
      evo.open = false;
      const buttons = [...t.el().querySelectorAll<HTMLButtonElement>('.cindex button')];
      expect(buttons.map((b) => b.textContent)).toEqual(['Comparativa', 'Aperturas', 'Evolución', 'Partidas']);
      for (const b of buttons) b.click();
      expect(scrolled).toEqual(['cg-comp', 'cg-open', 'cg-evo', 'allMatchesCard']);
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
