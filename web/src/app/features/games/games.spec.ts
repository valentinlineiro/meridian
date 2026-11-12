import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { Games } from './games';
import { chartGeometry } from './games-chart';
import { speedWords } from '../../core/words';

// Port of tests/frontendGames.test.ts (the vm sandbox becomes component tests). Each legacy `it` keeps its name.
const blk = (o: Record<string, any> = {}) => ({
  eff: { median: 1.13, nEff: 28 }, beat: { rate: 0.65, k: 18, nBeat: 28 }, time: { median: 51.5, p25: 42.5, p75: 64, nTime: 30 }, ...o,
});
const win = (o: Record<string, any> = {}) => ({
  ...blk(), prev: blk({ eff: { median: 1.3, nEff: 27 } }),
  delta: { effRel: { value: -0.13, nCur: 28, nPrev: 27 }, beatPp: { value: -6, nCur: 28, nPrev: 27 }, medianSec: { value: 0.5, nCur: 30, nPrev: 29 } }, ...o,
});
const BANDS = { '28': [-0.26, 0.34], '28v56': [-0.23, 0.3], rho112: [-0.19, 0.18] };
const interp = (o: Record<string, any> = {}) => ({ label: 'estable', reason: null, candidate: 'estable', previousCandidate: 'estable', pending: null, bands: BANDS, calibratedThrough: '2026-11-03', ...o });
const win28 = (arrow: string | null = 'flat', value = -0.13) => {
  const w = win();
  return { ...w, delta: { ...w.delta, effRel: { ...w.delta.effRel, value, arrow, band: BANDS['28'] } } };
};
const traj = [{ start: '2026-10-30', n: 1, eff: 1.2, beat: 1 }, { start: '2026-10-31', n: 0, eff: null, beat: null }, { start: '2026-11-01', n: 2, eff: 1.1, beat: 0.5 }];
const game = (o: Record<string, any> = {}) => ({
  n: 57, nWithAvg: 57, beatAvgRate: 0.65,
  efficiency: { last28: 1.13, prev28: 1.3, change: -0.13, nLast28: 20, nPrev28: 20 },
  best: { seconds: 32, date: '2026-09-30' }, beatStreak: { current: 1, max: 8 }, regression: false,
  trend112: { rho: 0.28, slopePctPer28d: 3.3, n: 110, days: 112 }, recent28vBase56: { delta: -0.31, nCur: 27, nBase: 54 }, interpretation: interp(),
  series: [{ date: '2026-10-01', eff: 1.2, roll: 1.2 }, { date: '2026-10-02', eff: 1.1, roll: 1.15 }],
  firstDate: '2026-05-17',
  windows: { '7': win(), '28': win28(), '90': win({ prev: null, delta: null }), all: win({ prev: null, delta: null }) },
  trajectory: { '7': traj, '28': traj, '90': traj, all: traj },
  adjusted: { label: 'sin_cambio', elasticity: 0.5, n: 57, windows: { '7': { pct: 5, n: 6 }, '28': { pct: 12.4, n: 28 }, '90': { pct: -1, n: 57 }, all: { pct: null, n: 3 } }, trend: { pctPer28d: -4, noise: [-9, 2], weeks: 12 } },
  losses: { cells: [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, n: dow === 6 ? 3 : 10, losses: dow === 0 ? 7 : 1, rate: dow === 0 ? 0.7 : 0.1, lo: 0.4, hi: 0.9 })), losses: 12, near: 3 }, ...o,
});
const summaryOf = (games: Record<string, unknown>, o: Record<string, unknown> = {}) =>
  ({ ok: true, summary: { days: 170, from: '2026-05-17', to: '2026-11-03', playStreak: { current: 48, max: 122 }, games, ...o } });
const FAIL = Symbol('500');
type Body = unknown;

describe('Games', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<Games>;
  let el: HTMLElement;

  const tick = async () => { TestBed.tick(); await new Promise((r) => setTimeout(r)); TestBed.tick(); };
  const pending = (): TestRequest[] => http.match(() => true).filter((r) => !r.cancelled);
  const reply = (r: TestRequest, body: Body) => body === FAIL ? r.flush({ ok: false }, { status: 500, statusText: 'x' }) : r.flush(body as object);
  /** Answers the page's two GETs (summary, today's day). */
  const answer = async (summary: Body, day: Body = { ok: true, day: { games: {} } }, reqs = pending()) => {
    for (const r of reqs) reply(r, r.request.url.endsWith('/summary') ? summary : day);
    await tick();
  };
  const open = async (games: Record<string, unknown> | Body, day?: Body, summaryExtra: Record<string, unknown> = {}) => {
    fixture = TestBed.createComponent(Games);
    el = fixture.nativeElement;
    await tick();
    await answer(games === FAIL || (games as any)?.ok !== undefined ? games : summaryOf(games as Record<string, unknown>, summaryExtra), day);
    return el;
  };
  const text = (id: string) => el.querySelector('#' + id)!.textContent!.trim();
  const click = async (sel: string) => { el.querySelector<HTMLElement>(sel)!.click(); await tick(); };
  const setRange = (r: string) => click('#gr-' + r);

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
  });

  describe('the list links to each report', () => {
    it('shouldLinkEachGameRowToItsReport', async () => {
      await open({ queens: game(), zip: game() });
      const links = [...el.querySelectorAll('#gamesNow .gc-h a')];
      expect(links.map((a) => a.getAttribute('href')).sort()).toEqual(['/games/queens', '/games/zip']);
      expect(links.map((a) => a.getAttribute('aria-label')).sort()).toEqual(['Informe de Queens', 'Informe de Zip']);
      expect(links.map((a) => a.textContent!.trim()).sort()).toEqual(['Queens', 'Zip']); // the visible name is the link
    });
  });

  describe('report mode (/games/:game)', () => {
    const openReport = async (games: Record<string, unknown> | Body, key = 'queens') => {
      fixture = TestBed.createComponent(Games);
      el = fixture.nativeElement;
      fixture.componentRef.setInput('game', key);
      await tick();
      await answer(games === FAIL ? games : summaryOf(games as Record<string, unknown>));
      return el;
    };

    it('shouldShowTheReportOfTheGameInsteadOfTheListWhenTheRouteHasAGame', async () => {
      await openReport({ queens: game(), zip: game() });
      expect(el.querySelector('h1')!.textContent).toBe('Queens');
      expect(el.querySelector('app-game-report')).not.toBeNull();
      expect(el.querySelector('#gamesList')).toBeNull(); // not the list of games
      expect(el.querySelector('a[href="/games"]')!.textContent).toContain('Todos los juegos');
      expect(el.querySelector('a.gr-back')).not.toBeNull(); // the class that gives it a 44px touch target on phones
    });

    it('shouldSayThereAreNoGamesYetWhenTheKeyIsValidButTheSummaryHasNoSuchGame', async () => {
      await openReport({ zip: game() }, 'queens');
      expect(el.querySelector('h1')!.textContent).toBe('Queens');
      expect(el.textContent).toContain('Aún sin partidas registradas de Queens');
      expect(el.querySelector('app-game-report')).toBeNull();
    });

    it('shouldSayNoDisponibleWhenTheSummaryFailsInReportMode', async () => {
      await openReport(FAIL);
      expect(el.querySelector('h1')!.textContent).toBe('Queens');
      expect(el.textContent).toContain('No disponible');
      expect(el.querySelector('app-game-report')).toBeNull();
    });

    it('shouldNotRequestTheSummaryAgainWhenTheGameChangesOrThePeriodChanges', async () => {
      await openReport({ queens: game(), zip: game() });
      fixture.componentRef.setInput('game', 'zip');
      await tick();
      el.querySelector<HTMLButtonElement>('#gr-7')!.click();
      await tick();
      expect(pending()).toHaveLength(0);
      http.verify();
      expect(el.querySelector('h1')!.textContent).toBe('Zip');
    });
  });

  describe('games tab', () => {
    it('shouldLoadTheSummaryOnBootWhenThePageIsOpenedDirectlyOnGames', async () => {
      fixture = TestBed.createComponent(Games);
      el = fixture.nativeElement;
      await tick();
      const reqs = pending(); // match() takes them off the queue: answer these same ones
      expect(reqs.filter((r) => r.request.url === '/api/me/linkedin-games/summary')).toHaveLength(1);
      await answer(summaryOf({ zip: game() }), undefined, reqs);
      http.verify();
      expect(text('gamesHeroStreak')).toBe('48 días seguidos');
    });

    it('shouldFetchSummaryAndTodayWhenTheGamesTabOpens', async () => {
      fixture = TestBed.createComponent(Games);
      await tick();
      const urls = pending().map((r) => r.request.urlWithParams);
      expect(urls).toHaveLength(2);
      expect(urls.some((u) => /^\/api\/me\/linkedin-games\/summary\?today=\d{4}-\d{2}-\d{2}$/.test(u))).toBe(true);
      expect(urls.some((u) => /^\/api\/me\/linkedin-games\?date=\d{4}-\d{2}-\d{2}$/.test(u))).toBe(true);
    });

    it('shouldUseLocalDayNotUtc', async () => {
      const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env; // Node re-reads TZ on assignment
      const tz = env['TZ'];
      env['TZ'] = 'America/Los_Angeles';
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-11-04T03:00:00Z')); // UTC is already the 4th; Los Angeles is still on the 3rd
      try {
        fixture = TestBed.createComponent(Games);
        await tick();
        const urls = pending().map((r) => r.request.urlWithParams);
        expect(urls).toContain('/api/me/linkedin-games/summary?today=2026-11-03');
        expect(urls).toContain('/api/me/linkedin-games?date=2026-11-03');
      } finally {
        vi.useRealTimers();
        if (tz === undefined) delete env['TZ']; else env['TZ'] = tz;
      }
    });

    it('shouldRenderTheHero', async () => {
      await open({ zip: game({ beatAvgRate: 0.84 }), tango: game() });
      expect(el.querySelector('#gamesHeroDist')).toBeNull(); // no pooled "beats the average" across games
      expect(text('gamesHeroStreak')).toBe('48 días seguidos');
      expect(text('gamesHeroMeta')).toBe('Tu récord: 122 días');
      expect(text('gamesHeroDays')).toBe('170 días registrados · 17 may 2026 → 3 nov 2026');
      expect(el.querySelector('#gamesTab')!.classList.contains('tab-panel')).toBe(false);
      expect(el.querySelector('#gamesTab')!.hasAttribute('hidden')).toBe(false);
    });

    it('shouldSayLastRecordInTheHeroWhenThePlayStreakIsZero', async () => {
      await open({ zip: game() }, undefined, { playStreak: { current: 0, max: 122 } });
      expect(text('gamesHeroStreakLabel')).toBe('LinkedIn Games · último registro');
      expect(text('gamesHeroStreak')).toBe('Sin registro desde 3 nov 2026');
      expect(text('gamesHeroMeta')).toBe('Tu récord: 122 días · registro manual');
    });

    it('shouldCountTodaysRecordedGamesInTheHeroTitle', async () => {
      await open({ zip: game() }, { ok: true, day: { games: { zip: { score: '0:08' }, tango: { score: '0:20' } } } });
      expect(text('gamesHeroToday')).toBe('Hoy · 2 de 6 registrados');
    });

    it('shouldNotCountWhenTodayCouldNotBeReadSoItNeverClaimsZero', async () => {
      await open({ zip: game() }, FAIL);
      expect(text('gamesHeroToday')).toBe('Hoy');
      await open({ zip: game() }, { ok: true, day: { games: 'x' } });
      expect(text('gamesHeroToday')).toBe('Hoy');
      await open({ zip: game() }, { ok: true, day: { games: ['zip'] } }); // an array is not the object of recorded games
      expect(text('gamesHeroToday')).toBe('Hoy');
      await open({ zip: game() }, { ok: true, day: { games: null } });
      expect(text('gamesHeroToday')).toBe('Hoy');
    });

    it('shouldShowTheStreakAsSmallTextNotAsTheHeadline', async () => {
      await open({ zip: game() });
      expect((el.querySelector('#gamesHeroStreak') as HTMLElement).style.fontSize).toBe('');
      expect(el.querySelector('#gamesHeroToday')!.compareDocumentPosition(el.querySelector('#gamesHeroStreak')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('shouldMarkTodaysRecordedGamesInTheHeroChips', async () => {
      await open({ zip: game() }, { ok: true, day: { games: { zip: { score: '0:08' } } } });
      const chips = [...el.querySelectorAll('#gamesToday button')];
      expect(chips).toHaveLength(6);
      expect(chips.find((c) => c.textContent!.includes('Zip'))!.className).toContain('pill-win');
      expect(chips.find((c) => c.textContent!.includes('Zip'))!.textContent).toBe('✓ Zip');
      expect(chips.find((c) => c.textContent!.includes('Tango'))!.className).not.toContain('pill-win');
    });

    it('shouldOfferTheWholeHistoryAsCsvFromTheHero', async () => {
      await open({ zip: game() });
      const a = el.querySelector<HTMLAnchorElement>('#gamesHero #gamesExport')!;
      expect(a.getAttribute('href')).toBe('/api/me/linkedin-games/export.csv');
      expect(a.hasAttribute('download')).toBe(true);
    });

    it('shouldStartALineInTheQuickBoxWhenAHeroChipIsPressed', async () => {
      await open({ zip: game() });
      const box = () => el.querySelector<HTMLTextAreaElement>('#gamesHero #lgQuickText')!;
      await click('#gamesToday [data-game="tango"]');
      expect(box().value).toBe('Tango, ');
      expect(document.activeElement).toBe(box());
      expect([box().selectionStart, box().selectionEnd]).toEqual([7, 7]); // the cursor waits after "Tango, "
      box().value = 'Tango, 0:30'; box().dispatchEvent(new Event('input'));
      await click('#gamesToday [data-game="zip"]');
      expect(box().value).toBe('Tango, 0:30\nZip, ');
      expect([box().selectionStart, box().selectionEnd]).toEqual([box().value.length, box().value.length]);
    });

    it('shouldSayTheDayCouldNotBeLoadedInsteadOfShowingNothingRecordedWhenTodayFails', async () => {
      await open({ zip: game() }, FAIL);
      expect(text('gamesNote')).toBe('No se pudo cargar el día.');
      expect(el.querySelectorAll('#gamesToday button')).toHaveLength(6); // still the way to log a result
      expect(text('gamesHeroStreak')).toBe('48 días seguidos');
    });

    it('shouldSayThereIsNoDataYetWhenTheSummaryIsEmpty', async () => {
      await open({});
      expect(text('gamesHeroMeta')).toBe('Aún no hay datos.');
      expect(text('gamesHeroStreak')).toBe('—');
      expect(el.querySelectorAll('#gamesRows tr, #gamesHead th, #gamesList > section')).toHaveLength(0);
    });

    it('shouldSayTheSummaryCouldNotBeLoadedWhenTheRequestFails', async () => {
      await open(FAIL);
      expect(text('gamesNote')).toBe('No se pudo cargar el resumen.');
      expect(text('gamesHeroMeta')).toBe('—'); // never "Aún no hay datos."
      expect(el.querySelectorAll('#gamesList > section')).toHaveLength(0);
    });

    it('shouldSayTheSummaryCouldNotBeLoadedWhenTheBodyHasNoGames', async () => {
      await open({ ok: true, summary: { days: 3 } });
      expect(text('gamesNote')).toBe('No se pudo cargar el resumen.');
    });
  });

  describe('a malformed part degrades alone', () => {
    it('shouldShowTheHeroAsUnavailableWhenItsFieldsAreMalformed', async () => {
      await open({ zip: game() }, undefined, { days: { bad: 1 } });
      expect(text('gamesHeroMeta')).toBe('No disponible');
      expect(el.querySelectorAll('#gamesNow .gc')).toHaveLength(1);
    });

    it('shouldKeepTheChipsWhenTheDayBodyIsMalformed', async () => {
      await open({ zip: game() }, { ok: true, day: { games: 'x' } });
      expect([...el.querySelectorAll('#gamesToday button')].map((b) => b.className)).toEqual(Array(6).fill('pill pill-scope'));
    });
  });

  describe('period and controls', () => {
    it('shouldPutThePeriodInTheUrlWhenItIsPickedAndDropItForTheDefault', async () => {
      await open({ zip: game() });
      const url = () => TestBed.inject(Router).url;
      await setRange('7');
      await new Promise((r) => setTimeout(r));
      expect(url()).toBe('/?r=7');
      await setRange('28');
      await new Promise((r) => setTimeout(r));
      expect(url()).toBe('/');
    });

    it('shouldShowThePeriodFromTheUrlAndFallBackToTheDefaultWhenItIsUnknown', async () => {
      fixture = TestBed.createComponent(Games);
      el = fixture.nativeElement;
      fixture.componentRef.setInput('r', '90');
      await tick();
      await answer(summaryOf({ zip: game() }));
      expect(el.querySelector('#gr-90')!.getAttribute('aria-pressed')).toBe('true');
      fixture.componentRef.setInput('r', 'xx');
      await tick();
      expect(el.querySelector('#gr-28')!.getAttribute('aria-pressed')).toBe('true');
    });

    it('shouldChangeThePeriodWithoutAskingTheServerAgain', async () => {
      await open({ zip: game() });
      await setRange('7');
      http.verify();
      expect(el.querySelector('#gr-7')!.getAttribute('aria-pressed')).toBe('true');
      expect(el.querySelector('#gr-28')!.getAttribute('aria-pressed')).toBe('false');
    });

    it('shouldExposeAccessibleControlsForPeriodAndChart', async () => {
      await open({ zip: game() });
      expect(el.querySelector('[role="group"][aria-label="Periodo de análisis"]')).not.toBeNull();
      for (const k of ['7', '28', '90', 'all']) expect(el.querySelector(`#gr-${k}[aria-pressed]`)).not.toBeNull();
      expect(el.querySelector('label.muted[for="gamesTrajGame"]')).not.toBeNull();
      expect(el.textContent).not.toMatch(/Todos \(agregado\)/);
    });

    it('shouldNeverMentionRegressionOnTheList', async () => {
      await open({ zip: game({ regression: true }) });
      expect(el.textContent).not.toMatch(/regresi/i);
    });
  });

  describe('games trajectory chart', () => {
    const titles = () => [...el.querySelectorAll('#gamesChart svg title')].map((t) => t.textContent!);
    const chooseGame = async (k: string) => {
      const sel = el.querySelector<HTMLSelectElement>('#gamesTrajGame')!;
      sel.value = k; sel.dispatchEvent(new Event('change')); await tick();
    };

    it('shouldDrawBothSeriesWithTheSampleSizeBarsOnTheSameAxis', async () => {
      await open({ zip: game() });
      const svg = el.querySelector('#gamesChart svg')!;
      expect(svg.querySelectorAll('circle[fill="var(--link)"]').length).toBeGreaterThan(0); // efficiency
      expect(svg.querySelectorAll('circle[fill="var(--ok)"]').length).toBeGreaterThan(0); // beats the average
      expect(svg.querySelectorAll('rect')).toHaveLength(2); // bars only where n > 0
      expect(titles()).toContain('2026-11-01 · 2 partidas · frente a la media: un poco más rápido');
      expect(svg.textContent).toContain('todos'); // beat strip axis, in words
      expect(svg.getAttribute('aria-label')).toContain('Los mismos datos están en la tabla siguiente.');
    });

    it('shouldLeaveAVisibleGapInsteadOfDrawingAPointForABucketWithoutObservations', async () => {
      await open({ zip: game() });
      const svg = el.querySelector('#gamesChart svg')!;
      expect(svg.querySelectorAll('circle')).toHaveLength(4); // 2 buckets with data × 2 series
      expect(titles().some((t) => t.startsWith('2026-10-31 ·'))).toBe(false); // neither point nor bar
      expect(svg.querySelectorAll('polyline')).toHaveLength(0); // the gap splits the line: isolated points stay points
    });

    it('shouldDrawTheRawValuesWithoutSmoothing', async () => {
      const t = [{ start: 'a', n: 1, eff: 1.5, beat: 1 }, { start: 'b', n: 1, eff: 3, beat: 0 }, { start: 'c', n: 1, eff: 2, beat: 1 }];
      await open({ zip: game({ trajectory: { '7': t, '28': t, '90': t, all: t } }) });
      for (const v of ['a · 1 partida · frente a la media: bastante más rápido', 'b · 1 partida · frente a la media: mucho más rápido', 'c · 1 partida · frente a la media: el doble de rápido']) expect(titles()).toContain(v);
      expect(el.querySelectorAll('#gamesChart polyline')).toHaveLength(2);
      expect(el.querySelector('#gamesChart polyline')!.getAttribute('points')).toBe('40.0,55.0 176.0,10.0 312.0,40.0');
    });

    it('shouldNotStackTheLowestWordOnTopOfMediaWhenNoDayWasBelowTheAverage', () => {
      const above = chartGeometry([{ start: 'a', n: 1, eff: 1.5, beat: 1 }, { start: 'b', n: 1, eff: 3, beat: 0 }])!;
      expect(above.showLo).toBe(false); // the lowest point IS the average line: one label, "media"
      expect(above.showHi).toBe(true);
      const below = chartGeometry([{ start: 'a', n: 1, eff: 0.5, beat: 1 }, { start: 'b', n: 1, eff: 3, beat: 0 }])!;
      expect([below.showLo, below.showHi]).toEqual([true, true]);
      const under = chartGeometry([{ start: 'a', n: 1, eff: 0.5, beat: 1 }, { start: 'b', n: 1, eff: 0.8, beat: 0 }])!;
      expect([under.showLo, under.showHi]).toEqual([true, false]); // the highest point is the average line
    });

    it('shouldUseTheWholeWidthItIsGiven', () => {
      const b = [{ start: 'a', n: 1, eff: 1.5, beat: 1 }, { start: 'b', n: 1, eff: 3, beat: 0 }];
      const g = chartGeometry(b, 900)!;
      expect(g.viewBox).toBe('0 0 900 196');
      expect(g.xr).toBe(892);
      expect(g.eff.dots.map((d) => d.cx)).toEqual(['40.0', '892.0']);
    });

    it('shouldChartOneGameAtATimeAndOfferNoAggregate', async () => {
      await open({ zip: game({ n: 170 }), tango: game({ trajectory: { '7': [], '28': [{ start: '2026-11-01', n: 1, eff: 1.1, beat: 1 }], '90': [], all: [] } }) });
      expect([...el.querySelectorAll('#gamesTrajGame option')].map((o) => o.textContent)).toEqual(['Zip', 'Tango']);
      expect(el.querySelector<HTMLSelectElement>('#gamesTrajGame')!.value).toBe('zip'); // the game with the most observations
      await chooseGame('tango');
      expect(titles().some((t) => t.startsWith('2026-11-01 · 1 partida'))).toBe(true);
      expect(el.querySelector<HTMLSelectElement>('#gamesTrajGame')!.value).toBe('tango');
      http.verify(); // switching game asks nothing
    });

    it('shouldExplainWhatTheChartShowsAndNameTheBucketSize', async () => {
      await open({ zip: game() });
      expect(text('gamesChartNote')).toMatch(/Cifras de las últimas 4 semanas, un punto por día, sin suavizar/);
      await setRange('90');
      expect(text('gamesChartNote')).toMatch(/Cifras de los últimos 3 meses, un punto por semana \(lunes\), sin suavizar/);
    });

    it('shouldSayThereAreNoObservationsWhenNoBucketHasData', async () => {
      const t = [{ start: '2026-11-01', n: 0, eff: null, beat: null }];
      await open({ zip: game({ trajectory: { '7': t, '28': t, '90': t, all: t } }) });
      expect(text('gamesChart')).toContain('Sin observaciones con media');
    });

    it.each([
      ['eff', { start: '2026-11-01', n: 2, eff: 'x', beat: 0.5 }],
      ['beat', { start: '2026-11-01', n: 2, eff: 1.1, beat: 'x' }],
      ['n', { start: '2026-11-01', n: 'x', eff: 1.1, beat: 0.5 }],
    ])('shouldShowTheChartAsUnavailableInsteadOfDrawingNaNWhenABucket%sIsNotANumber', async (_, bad) => {
      const t = [traj[0], bad];
      await open({ zip: game({ trajectory: { '7': t, '28': t, '90': t, all: t } }), tango: game() });
      expect(text('gamesChart')).toBe('No disponible');
      expect(el.querySelector('#gamesChart svg')).toBeNull();
      expect([...el.querySelectorAll('#gamesChart *')].some((n) => [...n.attributes].some((a) => a.value.includes('NaN')))).toBe(false);
    });

    it('shouldShowTheTrajectoryAsUnavailableWhenItIsMalformedWhileTheTableStillRenders', async () => {
      await open({ zip: game({ trajectory: { '28': 'x' } }) });
      expect(text('gamesChart')).toBe('No disponible');
      expect(el.querySelectorAll('#gamesDataRows tr')).toHaveLength(0);
      expect(el.querySelector('#gamesChart svg')).toBeNull();
    });
  });

  describe('games trajectory data table', () => {
    const dataRows = () => [...el.querySelectorAll('#gamesDataRows tr')].map((tr) => [...tr.children].map((c) => c.textContent));
    const chooseGame = async (k: string) => {
      const sel = el.querySelector<HTMLSelectElement>('#gamesTrajGame')!;
      sel.value = k; sel.dispatchEvent(new Event('change')); await tick();
    };

    it('shouldListOneRowPerBucketWithPeriodSpeedBeatRateAndGames', async () => {
      await open({ zip: game() });
      expect(dataRows()).toEqual([
        ['2026-10-30', '×1,2', '100 %', '1'],
        ['2026-10-31', '—', '—', '0'], // the gap stays a row, with n = 0
        ['2026-11-01', '×1,1', '50 %', '2'],
      ]);
      expect(el.querySelector('#gamesDataRows th')!.getAttribute('scope')).toBe('row');
    });

    it('shouldCarryTheSameValuesAsTheDrawnSeries', async () => {
      const t = [{ start: '2026-10-20', n: 3, eff: 1.234, beat: 2 / 3 }, { start: '2026-10-21', n: 0, eff: null, beat: null }, { start: '2026-10-22', n: 5, eff: 2.5, beat: 0.8 }];
      await open({ zip: game({ trajectory: { '7': t, '28': t, '90': t, all: t } }) });
      const tl = [...el.querySelectorAll('#gamesChart svg title')].map((x) => x.textContent!), rows = dataRows();
      t.forEach((b, i) => {
        const [, eff, beat, n] = rows[i];
        expect(n).toBe(String(b.n));
        if (b.n === 0) {
          expect([eff, beat]).toEqual(['—', '—']);
          expect(tl.some((x) => x.startsWith(b.start + ' ·'))).toBe(false);
        } else {
          const games = b.n === 1 ? '1 partida' : `${b.n} partidas`;
          expect(tl).toContain(`${b.start} · ${games} · frente a la media: ${speedWords(b.eff)}`);
          expect(tl).toContain(`${b.start} · ${games} · le ganas a la media en el ${beat}`);
        }
      });
      expect(rows.map((r) => r[0])).toEqual(t.map((b) => b.start));
    });

    it('shouldLabelWeeklyBucketsAsWeeksAndFollowThePeriodAndTheGame', async () => {
      const wk = [{ start: '2026-10-26', n: 4, eff: 2, beat: 0.75 }];
      await open({ zip: game({ n: 170 }), tango: game({ trajectory: { '7': traj, '28': traj, '90': wk, all: wk } }) });
      await chooseGame('tango');
      await setRange('90');
      expect(dataRows()).toEqual([['Semana del 2026-10-26', '×2', '75 %', '4']]);
      expect(text('gamesDataCaption')).toBe('Datos de la trayectoria de Tango, los últimos 3 meses: un valor por semana.');
      await setRange('7');
      expect(text('gamesDataCaption')).toMatch(/un valor por día\.$/);
      expect(dataRows()).toHaveLength(3);
    });

    it('shouldClearTheTableWhenThereIsNoData', async () => {
      await open({ zip: game() });
      expect(dataRows()).toHaveLength(3);
      (fixture.componentInstance as any).data.reload();
      await tick();
      await answer({ ok: true, summary: { days: 0, from: null, to: null, playStreak: { current: 0, max: 0 }, games: {} } });
      expect(dataRows()).toHaveLength(0);
      expect(text('gamesChart')).toBe('');
      expect(text('gamesChartNote')).toBe('');
    });

    it('shouldOfferTheTableInsideADetailsWithAccessibleStructureAndPointTheChartToIt', async () => {
      await open({ zip: game() });
      const block = el.querySelector('#gamesDataDetails')!;
      expect(block.querySelector('summary')!.textContent).toBe('Ver los datos del gráfico (tabla)');
      expect(block.querySelector('caption#gamesDataCaption.sr-only')).not.toBeNull();
      expect(block.querySelector('table')!.getAttribute('aria-describedby')).toBe('gamesDataCaption');
      expect(block.querySelectorAll('thead th[scope="col"]')).toHaveLength(4);
      expect(el.querySelector('#gamesChart svg')!.getAttribute('aria-label')).toContain('Los mismos datos están en la tabla siguiente.');
    });
  });
  describe('adjusted form, loss map and difficulty', () => {
    it('shouldNameTheWorstWeekdayOnlyWhenItHasEnoughGames', async () => {
      await open({ queens: game() });
      expect(text('gamesLossNote')).toBe('Donde más pierdes: Queens los lunes (70 %, 10 partidas).');
      const cells = [...el.querySelectorAll('#gamesLoss tbody td')].map((c) => c.textContent!.trim());
      expect(cells[0]).toBe('70 %10 partidas'); // rate + sample size
      expect(cells[6]).toBe('—'); // Sunday has 3 games
      expect(cells.length).toBe(7);
      expect(text('gamesLossNear')).toBe('Derrotas por poco: Queens 25 %.');
    });

    it('shouldStillNameTheWorstWeekdayWhenEveryRateIsLow', async () => {
      const calm = game({ losses: { cells: [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, n: 10, losses: dow === 3 ? 2 : 1, rate: dow === 3 ? 0.2 : 0.1, lo: 0.02, hi: 0.4 })), losses: 8, near: 0 } });
      await open({ zip: calm });
      expect(text('gamesLossNote')).toBe('Donde más pierdes: Zip los jueves (20 %, 10 partidas).');
    });

    it('shouldSayThereIsNotEnoughWhenNoWeekdayHasEightGames', async () => {
      const few = game({ losses: { cells: [0, 1, 2, 3, 4, 5, 6].map((dow) => ({ dow, n: 7, losses: 3, rate: 3 / 7, lo: 0.1, hi: 0.8 })), losses: 21, near: 0 } });
      await open({ zip: few });
      expect(text('gamesLossNote')).toContain('Aún no hay ningún día');
    });

    it('shouldDrawTheLastFourWeeksOfDifficultyMondayFirst', async () => {
      const difficulty = [{ date: '2026-11-02', level: 'duro' }, { date: '2026-11-03', level: 'facil' }];
      await open({ zip: game() }, undefined, { difficulty });
      const cells = [...el.querySelectorAll('#gamesDiff .gd')];
      expect(cells).toHaveLength(28);
      expect(cells[21].className).toContain('gd-duro'); // Monday 2 Nov is the first day of the last week
      expect(cells[22].className).toContain('gd-facil');
      expect(cells[0].className).toContain('gd-none');
      expect(text('gamesDiffNote')).toBe('En estas 4 semanas: 1 días fáciles, 0 normales y 1 duros.');
    });

  });
  describe('first look', () => {
    const withSeries = (effs: number[]) => effs.map((eff, i) => ({ date: `2026-10-${String(10 + i).padStart(2, '0')}`, eff, roll: 1.2 }));
    const rowOf = (name: string) => [...el.querySelectorAll('#gamesNow .gc')].find((r) => r.textContent!.includes(name))!;

    it('shouldShowTheBigNumberTheChangeAndTheSentenceOfEachGame', async () => {
      await open({ zip: game(), tango: game() });
      const zip = rowOf('Zip');
      expect(zip.querySelector('.gc-big')!.textContent!.trim()).toBe('+13 %');
      expect(zip.querySelector('.gc-cap')!.textContent!.trim()).toBe('más rápido que la media');
      expect(zip.querySelector('.gc-delta')!.textContent!.trim()).toBe('−13 % frente al periodo anterior');
      expect(zip.textContent).toContain('No hay cambios en las últimas 4 semanas.');
      expect(zip.textContent).toContain('Tiempo normal 0:52');
    });

    it('shouldSayTheSentenceOfTheVerdictSoItNeverContradictsThePill', async () => {
      const down = game({ interpretation: interp({ label: 'deterioro', reason: 'reciente', candidate: 'deterioro', previousCandidate: 'deterioro' }) });
      await open({ tango: down });
      const row = rowOf('Tango');
      expect(row.querySelector('.gc-line')!.textContent).toContain('Vas más lento que antes, y se ha repetido dos semanas seguidas.');
      expect(row.textContent).not.toContain('de lo normal'); // the difficulty-adjusted form is another frame: it lives in the report
    });

    it('shouldSayMoreSlowAndShowADashWhenTheMedianSpeedIsBelowOrMissing', async () => {
      const slow = game({ windows: { ...game().windows, '28': win28('flat', -0.1) } });
      slow.windows['28'].eff = { median: 0.94, nEff: 28 };
      const none = game();
      (none.windows['28'] as any).eff = { median: null, nEff: 0 };
      await open({ zip: slow, tango: none });
      expect(rowOf('Zip').querySelector('.gc-big')!.textContent!.trim()).toBe('−6 %');
      expect(rowOf('Zip').querySelector('.gc-cap')!.textContent!.trim()).toBe('más lento que la media');
      expect(rowOf('Tango').querySelector('.gc-big')!.textContent!.trim()).toBe('—');
    });

    it('shouldOmitTheChangeWhenThePeriodHasNoPreviousOne', async () => {
      await open({ zip: game() });
      await setRange('90');
      expect(rowOf('Zip').querySelector('.gc-delta')).toBeNull();
    });

    it('shouldDrawTheLast14ResultsAsBarsWhoseHeightIsTheDistanceToTheAverage', async () => {
      const series = withSeries(Array.from({ length: 20 }, (_, i) => (i % 4 === 0 ? 0.8 : 1.5)));
      await open({ zip: game({ series }) });
      const bars = rowOf('Zip').querySelectorAll('.gbars .gb');
      expect(bars).toHaveLength(14);
      expect(rowOf('Zip').querySelectorAll('.gb-dn i')).toHaveLength(3); // indexes 8, 12, 16 of the last 14 (6..19)
      expect(rowOf('Zip').querySelectorAll('.gb-up i')).toHaveLength(11);
      const h = (sel: string) => (rowOf('Zip').querySelector(sel) as HTMLElement).style.height;
      expect(h('.gb-up i')).toBe('100%'); // 1.5 is +50 %: the full half
      expect(h('.gb-dn i')).toBe('40%'); // 0.8 is -20 %
      expect(rowOf('Zip').querySelector('.gbars')!.getAttribute('aria-label')).toBe('Últimas 14 partidas con media: 11 mejores que la media y 3 peores.');
    });

    it('shouldCapTheBarsAndKeepAVisibleStubForAnAlmostEqualResult', async () => {
      await open({ zip: game({ series: withSeries([3, 1.01]) }) });
      expect((rowOf('Zip').querySelector('.gb-up i') as HTMLElement).style.height).toBe('100%');
      expect(parseFloat((rowOf('Zip').querySelectorAll('.gb-up i')[1] as HTMLElement).style.height)).toBeGreaterThanOrEqual(8);
    });

    it('shouldNotDrawTheOldDotsOrTheLineOnTheRows', async () => {
      await open({ zip: game() });
      expect(el.querySelector('#gamesNow .dot, #gamesNow .spark, #gamesNow .grow-tag')).toBeNull();
    });

    it('shouldKeepTheChartOneClickAwayUnderMoreDetail', async () => {
      await open({ zip: game() });
      const more = el.querySelector<HTMLDetailsElement>('#cg-games-more')!;
      expect(more.open).toBe(false);
      expect(more.querySelector('#gamesChart')).not.toBeNull();
    });

    it('shouldDropOnlyTheRowOfAMalformedGame', async () => {
      await open({ zip: game({ windows: {} }), tango: game() });
      expect(el.querySelectorAll('#gamesNow .gc')).toHaveLength(1);
    });
  });
});
