import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { Games } from './games';
import { chartGeometry } from './games-chart';

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
      const links = [...el.querySelectorAll('#gamesNow a.gc')];
      expect(links.map((a) => a.getAttribute('href')).sort()).toEqual(['/games/queens', '/games/zip']);
      expect(links.every((a) => a.textContent!.includes('Queens') || a.textContent!.includes('Zip'))).toBe(true); // the whole row is the link, its name is its text
    });
  });

  describe('the card says what its pill compares', () => {
    it('shouldShowTheVerdictSentenceUnderEachGameRow', async () => {
      await open({ queens: game({ interpretation: interp({ label: 'deterioro' }) }) });
      expect(el.querySelector('#gamesNow .gc .gc-why')!.textContent!.trim().length).toBeGreaterThan(0);
    });

    it('shouldNotRepeatTheStableBadgeWithASentence', async () => {
      await open({ queens: game() });
      expect(el.querySelector('#gamesNow .gc')!.textContent).toContain('Estable');
      expect(el.querySelector('#gamesNow .gc .gc-why')).toBeNull();
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

    it('shouldOfferToRegisterTheGameFromItsOwnReport', async () => {
      await openReport({ queens: game(), zip: game() });
      expect(el.querySelector('#gameRegisterOpen')!.textContent).toContain('Registrar Queens hoy');
      await click('#gameRegisterOpen');
      expect(el.querySelector('#gamesRegister')!.hasAttribute('open')).toBe(true);
      expect(el.querySelector('#lgRegTitle')!.textContent).toContain('Queens · hoy');
    });

    it('shouldShowTheReportOfTheGameInsteadOfTheListWhenTheRouteHasAGame', async () => {
      await openReport({ queens: game(), zip: game() });
      expect(el.querySelector('h1')!.textContent).toBe('Queens');
      expect(el.querySelector('app-game-report')).not.toBeNull();
      expect(el.querySelector('#gamesList')).toBeNull(); // not the list of games
      expect(el.querySelector('a[href="/games"]')!.textContent).toContain('Todos los juegos');
      expect(el.querySelector('a.gr-back')).not.toBeNull(); // the class that gives it a 44px touch target on phones
    });

    it('shouldRenderTheReportWhenADraftOfTodaysSheetIsWaiting', async () => {
      const d = new Date(), pad = (n: number) => String(n).padStart(2, '0');
      sessionStorage.setItem('meridian.gamesRegisterDraft', JSON.stringify({ date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, values: { zip: { score: '0:48', avg: '' } }, removed: [] }));
      try {
        await openReport({ queens: game(), zip: game() });
        expect(el.querySelector('app-game-report')).not.toBeNull(); // the sheet lives in the list: the report must not try to open it
      } finally { sessionStorage.clear(); }
    });

    it('shouldSayThereAreNoGamesYetWhenTheKeyIsValidButTheSummaryHasNoSuchGame', async () => {
      await openReport({ zip: game() }, 'queens');
      expect(el.querySelector('h1')!.textContent).toBe('Queens');
      expect(el.textContent).toContain('Aún sin partidas registradas de Queens');
      expect(el.querySelector('app-game-report')).toBeNull();
    });

    it('shouldSayTheGamesDidNotLoadWithARetryWhenTheSummaryFailsInReportMode', async () => {
      await openReport(FAIL);
      expect(el.querySelector('h1')!.textContent).toBe('Queens');
      expect(el.querySelector('app-error-block')!.textContent).toContain('No pudimos cargar tus juegos.');
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
      expect(text('gamesHeroDays')).toContain('registrados');
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
      expect(el.querySelector('#gamesHeroSince')).toBeNull(); // no pill while the log is current
      expect(text('gamesHeroMeta')).toBe('');
      expect(el.textContent).not.toMatch(/seguidos|récord|racha/i); // a log is not a score
      expect(text('gamesHeroDays')).toBe('170 días registrados · 17 may 2026 → 3 nov 2026');
      expect(el.querySelector('#gamesTab')!.classList.contains('tab-panel')).toBe(false);
      expect(el.querySelector('#gamesTab')!.hasAttribute('hidden')).toBe(false);
    });

    it('shouldSayLastRecordInTheHeroWhenThePlayStreakIsZero', async () => {
      await open({ zip: game() }, undefined, { playStreak: { current: 0, max: 122 } });
      expect(text('gamesHeroSince')).toMatch(/^Último registro: 3 nov( 2026)?$/);
      expect(el.querySelector('#gamesHeroSince')!.classList.contains('pill-warn')).toBe(false); // a gap in the log is a note, not an alert
      expect(el.querySelector('#gamesHero .gh-head')!.contains(el.querySelector('#gamesHeroSince'))).toBe(true); // beside the title, not in the footer
      expect(text('gamesHeroMeta')).toBe('registro manual');
    });

    it('shouldExposeTodayAndHowYouAreDoingAsHeadingsWhenTheHubLoads', async () => {
      await open({ zip: game() });
      expect(el.querySelector('h2#gamesHeroToday')).not.toBeNull();
      expect(el.querySelector('#gamesNow')!.parentElement!.contains(el.querySelector('#gamesOverview'))).toBe(true); // the sentence heads the games, not a card of its own
    });

    it('shouldCountTodaysRecordedGamesInTheHeroTitle', async () => {
      await open({ zip: game() }, { ok: true, day: { games: { zip: { score: '0:08' }, tango: { score: '0:20' } } } });
      expect(text('gamesHeroToday')).toBe('Hoy · 2 registrados');
    });

    it('shouldKeepTheRegisterToOneLineAndAButtonWithNoPerGameRowsWhenTheHubLoads', async () => {
      await open({ zip: game() }, { ok: true, day: { games: { zip: { score: '0:08' } } } });
      expect(el.querySelector('#gamesToday')).toBeNull();
      expect(el.querySelector('[id^="gamesToday-"]')).toBeNull();
      expect(text('gamesHeroToday')).toBe('Hoy · 1 registrado');
      expect(el.querySelector('#gamesRegisterOpen')).not.toBeNull();
    });

    it('shouldKeepTheButtonWhenTodayCouldNotBeRead', async () => {
      await open({ zip: game() }, FAIL);
      expect(text('gamesHeroToday')).toBe('Hoy');
      expect(el.querySelector('#gamesRegisterOpen')).not.toBeNull();
      expect(el.textContent).not.toContain('Sin registrar');
    });

    it('shouldPutTodayBeforeTheTrendOfTheGames', async () => {
      await open({ zip: game() });
      const before = (a: string, b: string) => el.querySelector(a)!.compareDocumentPosition(el.querySelector(b)!) & Node.DOCUMENT_POSITION_FOLLOWING;
      expect(before('#gamesHeroToday', '#gamesOverview')).toBeTruthy();
      expect(before('#gamesOverview', '#gamesNow')).toBeTruthy();
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

    it('shouldOfferToRegisterTodayAndOpenTheDialogFilledWithTodaysRecord', async () => {
      await open({ zip: game() }, { ok: true, day: { games: { zip: { score: '0:08', avg: '0:09' } } } });
      expect(text('gamesRegisterOpen')).toBe('Registrar hoy');
      await click('#gamesRegisterOpen');
      expect(el.querySelector('#gamesRegister')!.hasAttribute('open')).toBe(true);
      expect((el.querySelector('#lgReg-zip-score') as HTMLInputElement).value).toBe('0:08');
      expect((el.querySelector('#lgReg-zip-avg') as HTMLInputElement).value).toBe('0:09');
      expect((el.querySelector('#lgReg-tango-score') as HTMLInputElement).value).toBe('');
    });

    it('shouldSayEditWhenAllSixGamesAreRecorded', async () => {
      const six = Object.fromEntries(['zip', 'tango', 'queens', 'mini_sudoku', 'patches', 'wend'].map((k) => [k, { score: '0:30' }]));
      await open({ zip: game() }, { ok: true, day: { games: six } });
      expect(text('gamesRegisterOpen')).toBe('Editar lo de hoy');
      expect(text('gamesHeroToday')).toBe('Hoy · todo registrado');
    });

    it('shouldMakeRegistrarHoyThePrimaryButtonOnlyWhileNothingIsLogged', async () => {
      await open({ zip: game() });
      expect(el.querySelector('#gamesRegisterOpen')!.className).toContain('btn-p');
      await open({ zip: game() }, { ok: true, day: { games: { zip: { score: '0:08' } } } });
      expect(el.querySelector('#gamesRegisterOpen')!.className).toContain('btn-g');
    });

    it('shouldKeepTheCardsInTheRegistersOrderNotTheTrendOrder', async () => {
      await open({ wend: game(), zip: game(), queens: game() });
      const names = [...el.querySelectorAll('#gamesNow .gc-name b')].map((b) => b.textContent);
      expect(names).toEqual(['Zip', 'Queens', 'Wend']);
    });

    it('shouldOfferToContinueAWaitingDraftInsteadOfOpeningTheSheet', async () => {
      const d = new Date(), pad = (n: number) => String(n).padStart(2, '0');
      sessionStorage.setItem('meridian.gamesRegisterDraft', JSON.stringify({ date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, values: { zip: { score: '0:48', avg: '' } }, removed: [] }));
      await open({ zip: game() });
      expect(el.querySelector('#gamesRegister')!.hasAttribute('open')).toBe(false);
      await click('#gamesDraftResume');
      expect(el.querySelector('#gamesRegister')!.hasAttribute('open')).toBe(true);
      expect((el.querySelector('#lgReg-zip-score') as HTMLInputElement).value).toBe('0:48');
      sessionStorage.clear();
    });

    it('shouldOfferTheWholeHistoryAsCsvFromTheFooter', async () => {
      await open({ zip: game() });
      const a = el.querySelector<HTMLAnchorElement>('.gh-foot #gamesExport')!;
      expect(a.getAttribute('href')).toBe('/api/me/linkedin-games/export.csv');
      expect(a.hasAttribute('download')).toBe(true);
    });

    it('shouldSayTheDayCouldNotBeLoadedInsteadOfShowingNothingRecordedWhenTodayFails', async () => {
      await open({ zip: game() }, FAIL);
      expect(text('gamesNote')).toBe('No se pudo cargar el día.');
      expect(el.querySelector('#gamesRegisterOpen')).not.toBeNull(); // still the way to log a result
      expect(text('gamesHeroDays')).toContain('registrados');
    });

    it('shouldSayThereIsNoDataYetWhenTheSummaryIsEmpty', async () => {
      await open({});
      expect(text('gamesHeroMeta')).toBe('Aún no hay datos.');
      expect(el.querySelector('#gamesHeroSince')).toBeNull();
      expect(el.querySelectorAll('#gamesRows tr, #gamesHead th, #gamesList > section')).toHaveLength(0);
    });

    it('shouldSayTheSummaryCouldNotBeLoadedWhenTheRequestFails', async () => {
      await open(FAIL);
      expect(el.querySelector('app-error-block')!.textContent).toContain('No pudimos cargar tus juegos.');
      expect(el.querySelector('app-error-block button')!.textContent).toBe('Reintentar');
      expect(text('gamesHeroMeta')).toBe('—'); // never "Aún no hay datos."
      expect(el.querySelectorAll('#gamesList > section')).toHaveLength(0);
    });

    it('shouldSayTheSummaryCouldNotBeLoadedWhenTheBodyHasNoGames', async () => {
      await open({ ok: true, summary: { days: 3 } });
      expect(el.querySelector('app-error-block')!.textContent).toContain('No pudimos cargar tus juegos.');
    });
  });

  describe('a malformed part degrades alone', () => {
    it('shouldShowTheHeroAsUnavailableWhenItsFieldsAreMalformed', async () => {
      await open({ zip: game() }, undefined, { days: { bad: 1 } });
      expect(text('gamesHeroMeta')).toBe('No disponible');
      expect(el.querySelectorAll('#gamesNow .gc')).toHaveLength(1);
    });

    it('shouldKeepTheRegisterButtonWhenTheDayBodyIsMalformed', async () => {
      await open({ zip: game() }, { ok: true, day: { games: 'x' } });
      expect(text('gamesRegisterOpen')).toBe('Registrar hoy');
      expect(text('gamesHeroToday')).toBe('Hoy'); // unknown is never said as zero
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

    it('shouldExposeAccessibleControlsForThePeriod', async () => {
      await open({ zip: game() });
      expect(el.querySelector('[role="group"][aria-label="Periodo de análisis"]')).not.toBeNull();
      for (const k of ['7', '28', '90', 'all']) expect(el.querySelector(`#gr-${k}[aria-pressed]`)).not.toBeNull();
      expect(el.textContent).not.toMatch(/Todos \(agregado\)/);
    });

    it('shouldNeverMentionRegressionOnTheList', async () => {
      await open({ zip: game({ regression: true }) });
      expect(el.textContent).not.toMatch(/regresi/i);
    });
  });

  describe('chart geometry', () => {
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
  });
  describe('loss map', () => {
    it('shouldNameTheWorstWeekdayOnlyWhenItHasEnoughGames', async () => {
      await open({ queens: game() });
      expect(text('gamesLossNote')).toBe('Donde más pierdes: Queens los lunes (70 %, 10 partidas).');
      const cells = [...el.querySelectorAll('#gamesLoss tbody td')].map((c) => c.textContent!.trim());
      expect(cells[0]).toBe('70 %10 partidas'); // rate + sample size
      expect(cells[6]).toBe('—'); // Sunday has 3 games
      expect(cells.length).toBe(7);
      expect(text('gamesLossNear')).toBe('Por poco (menos de un 15 % más lento que la media): Queens 25 %.');
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
  });
  describe('how you are doing (the overview card)', () => {
    const down = game({ interpretation: interp({ label: 'deterioro', reason: 'sostenido', candidate: 'deterioro', previousCandidate: 'deterioro' }) });
    const up = game({ interpretation: interp({ label: 'mejora_sostenida', candidate: 'mejora_sostenida', previousCandidate: 'mejora_sostenida' }) });
    const few = game({ interpretation: interp({ label: 'datos_insuficientes', reason: 'cobertura_insuficiente' }) });

    it('shouldNameEachGameByItsStateInOneSentenceWithoutACount', async () => {
      await open({ tango: down, queens: up, zip: game(), mini_sudoku: few });
      expect(text('gamesOverviewSentence')).toBe('Tango baja. Queens mejora. Zip, sin cambios. Mini Sudoku, pocos datos.');
    });

    it('shouldJoinSeveralNamesAndUseThePlural', async () => {
      await open({ queens: up, zip: up, tango: up });
      expect(text('gamesOverviewSentence')).toBe('Queens, Tango y Zip mejoran.');
    });

    it('shouldShowNothingWhenThereAreNoGames', async () => {
      await open({});
      expect(el.querySelector('#gamesOverview')).toBeNull();
    });
  });

  describe('first look', () => {
    const withSeries = (effs: number[]) => effs.map((eff, i) => ({ date: `2026-10-${String(10 + i).padStart(2, '0')}`, eff, roll: 1.2 }));
    const rowOf = (name: string) => [...el.querySelectorAll('#gamesNow .gc')].find((r) => r.textContent!.includes(name))!;

    it('shouldShowTheVerdictAndTheBigNumberOfEachGameAsOneCompactRow', async () => {
      await open({ zip: game(), tango: game() });
      const zip = rowOf('Zip');
      expect(zip.querySelector('.gc-big')!.textContent!.trim()).toBe('+13 %');
      expect(zip.querySelector('.gc-cap')!.textContent!.trim()).toBe('más rápido que la media');
      expect(zip.textContent).toContain('Estable');
    });

    it('shouldShowTheChangeAgainstThePreviousPeriodOnEachCard', async () => {
      await open({ zip: game() });
      expect(rowOf('Zip').querySelector('.gc-delta')!.textContent!.trim()).toBe('−13 % frente al periodo anterior');
    });

    it('shouldShowHowOftenYouBeatTheAverageOnEachCard', async () => {
      await open({ zip: game() });
      expect(rowOf('Zip').querySelector('.gc-beat')!.textContent!.trim()).toBe('Le ganas a la media en el 65 % de las partidas');
    });

    it('shouldNotShowTheBeatRateWhenThereIsTooLittleData', async () => {
      await open({ tango: game({ interpretation: interp({ label: 'insuficiente', reason: 'pocos_datos' }), windows: { ...game().windows, '28': { ...win28(), eff: { median: 1.2, nEff: 4 } } } }) });
      expect(rowOf('Tango').querySelector('.gc-beat')).toBeNull();
    });

    it('shouldTagThePeriodChooserAndEachCardForUmami', async () => {
      await open({ zip: game() });
      expect(el.querySelector('#gr-28')!.getAttribute('data-umami-event')).toBe('games-period');
      expect(rowOf('Zip').getAttribute('data-umami-event')).toBe('games-open');
    });

    it('shouldKeepOneComparisonOnTheCardAndExplainTheLabelInTheHelp', async () => {
      await open({ zip: game() });
      expect(rowOf('Zip').querySelector('.gc-cap')!.textContent).toContain('que la media');
      expect(rowOf('Zip').textContent).not.toContain('frente a antes');
      expect(el.querySelector('#cg-games-now app-help')!.textContent).toContain('compara con tu periodo anterior');
    });

    it('shouldShowTheNumberOfGamesInsteadOfAPercentageWhenThereIsTooLittleData', async () => {
      await open({ zip: game(), tango: game({ interpretation: interp({ label: 'insuficiente', reason: 'pocos_datos' }), windows: { ...game().windows, '28': { ...win28(), eff: { median: 1.2, nEff: 4 } } } }) });
      expect(rowOf('Tango').querySelector('.gc-big')!.textContent!.trim()).toBe('4');
      expect(rowOf('Tango').querySelector('.gc-cap')!.textContent!.trim()).toBe('partidas');
      expect(rowOf('Zip').querySelector('.gc-big')!.textContent!.trim()).toBe('+13 %');
    });

    it('shouldShowTheSaveNoteInsideTheTodayCard', async () => {
      await open({ zip: game() }, FAIL);
      expect(el.querySelector('#gamesHero')!.contains(el.querySelector('#gamesNote'))).toBe(true);
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

    it('shouldFoldTheWeekdayMapIntoOneClosedDetail', async () => {
      await open({ zip: game() });
      const d = el.querySelector<HTMLDetailsElement>('details#gamesDetail')!;
      expect(d.open).toBe(false);
      expect(d.querySelector('#gamesLoss')).not.toBeNull();
      expect(d.querySelector('summary')!.textContent).toContain('por día de la semana');
    });

    it('shouldNotOfferTheTrajectoryOrTheDifficultyOnTheHub', async () => {
      await open({ zip: game() });
      for (const id of ['gamesChart', 'gamesDiff', 'gamesTrajGame', 'cg-games-more', 'gamesDataTable']) expect(el.querySelector('#' + id)).toBeNull();
    });

    it('shouldDropOnlyTheRowOfAMalformedGame', async () => {
      await open({ zip: game({ windows: {} }), tango: game() });
      expect(el.querySelectorAll('#gamesNow .gc')).toHaveLength(1);
    });
  });
});
