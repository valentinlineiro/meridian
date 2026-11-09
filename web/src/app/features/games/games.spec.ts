import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
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
  trajectory: { '7': traj, '28': traj, '90': traj, all: traj }, ...o,
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
  /** textContent without the screen-reader-only extras. */
  const visible = (n: Element) => { const c = n.cloneNode(true) as Element; c.querySelectorAll('.sr-only, .pill').forEach((x) => x.remove()); return c.textContent!.trim(); };
  const cellsOf = () => [...el.querySelectorAll('#gamesRows tr')].map((tr) => [...tr.children].map((c) => c.textContent!.trim()));
  const names = () => cellsOf().map((r) => r[0]);
  const headOf = (i: number) => el.querySelectorAll('#gamesHead th')[i];
  const cardsOf = () => [...el.querySelectorAll('#gamesList > section')];
  const nameOf = (c: Element) => visible(c.querySelector('h3')!);
  const badgeOf = (c: Element) => c.querySelector('h3 .pill')!;
  // What a card shows: each fact is "label | value | note". The formulas live in its "Cómo se calcula" (app-help), read apart.
  const joinRow = (m: Element) => [...m.children].map((e) => e.textContent!.trim()).join(' | ');
  const factsOf = (c: Element) => [...c.querySelectorAll(':scope > app-stats dl > div')].map(joinRow);
  const howLinesOf = (c: Element) => [...c.querySelectorAll(':scope > app-help .help-body > p')].map((p) => p.textContent!.trim());
  const howFactsOf = (c: Element) => [...c.querySelectorAll(':scope > app-help app-stats dl > div')].map(joinRow);
  const shownText = (c: Element) => { const k = c.cloneNode(true) as Element; k.querySelectorAll('app-help').forEach((x) => x.remove()); return k.textContent!; };
  /** A card that could not be read: what follows its title. */
  const linesOf = (c: Element) => [...c.children].slice(1).map((x) => x.textContent!.trim());
  const click = async (sel: string) => { el.querySelector<HTMLElement>(sel)!.click(); await tick(); };
  const setRange = (r: string) => click('#gr-' + r);
  const sortBy = (k: string) => click('#gth-' + k + ' button');

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  describe('games tab: a stale manual log is not a zero streak', () => {
    it('shouldSayNoRecordSinceInsteadOfZeroDaysWhenTheLogIsStale', async () => {
      await open({ zip: game({ beatStreak: { current: 0, max: 8 } }) }, undefined, { playStreak: { current: 0, max: 122 } });
      expect(factsOf(cardsOf()[0])).toContain('Días seguidos mejor que la media | — | tu récord: 8 días · sin racha activa');
      expect(cellsOf()[0][5]).toBe('—');
      expect(el.querySelector('#gamesRows tr')!.children[5].getAttribute('title')).toBe('Sin registro desde 3 nov 2026');
      expect(cellsOf()[0]).not.toContain('0 días');
    });

    it('shouldKeepAnObservedZeroWhenTheLogIsCurrent', async () => {
      await open({ zip: game({ beatStreak: { current: 0, max: 8 } }) });
      expect(factsOf(cardsOf()[0])).toContain('Días seguidos mejor que la media | 0 días | tu récord: 8 días');
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

    it('shouldRenderTheHeroAndThePlainFactsOfEachCard', async () => {
      await open({ zip: game({ beatAvgRate: 0.84 }), tango: game() });
      const cards = cardsOf();
      expect(cards.map(nameOf).sort()).toEqual(['Tango', 'Zip']);
      expect(cards[0].querySelectorAll('.gcap')[0].textContent).toContain('Cifras de las últimas 4 semanas');
      expect(factsOf(cards[0])).toEqual([
        'Velocidad frente a la media | un poco más rápido',
        'Le ganas a la media | 18 de 28 días',
        'Tiempo normal | 0:52 | suele estar entre 0:43 y 1:04',
        'Mejor marca | 0:32 | 30 sep 2026',
        'Días seguidos mejor que la media | 1 día | tu récord: 8 días',
      ]);
      expect(el.querySelector('#gamesHeroDist')).toBeNull(); // no pooled "beats the average" across games
      expect(text('gamesHeroStreak')).toBe('48 días seguidos');
      expect(text('gamesHeroMeta')).toBe('Tu récord: 122 días');
      expect(text('gamesHeroDays')).toBe('170 días registrados · 17 may 2026 → 3 nov 2026');
      expect(el.querySelector('#gamesTab')!.classList.contains('tab-panel')).toBe(false);
      expect(el.querySelector('#gamesTab')!.hasAttribute('hidden')).toBe(false);
    });

    it('shouldKeepFormulasOutOfWhatACardShowsAndBackThemUpInComoSeCalcula', async () => {
      await open({ zip: game(), tango: game() });
      const card = cardsOf()[0];
      expect(shownText(card)).not.toMatch(/×\d|P25|\bn=|Δ|ρ|\d %/);
      const help = card.querySelector<HTMLDetailsElement>(':scope > app-help details')!;
      expect(help.open).toBe(false);
      expect(help.querySelector('summary')!.textContent).toBe('Cómo se calcula');
      expect(howFactsOf(card)).toContain('Eficiencia | ×1,13 | n=28 · −13 % vs periodo previo (n=28/27)');
      expect(howFactsOf(card)).toContain('Gana a la media | 65 % | n=28');
      expect(howFactsOf(card)).toContain('Tiempo mediano | 0:52 | P25–P75 0:43–1:04 · n=30');
    });

    it('shouldSayLastRecordInTheHeroWhenThePlayStreakIsZero', async () => {
      await open({ zip: game() }, undefined, { playStreak: { current: 0, max: 122 } });
      expect(text('gamesHeroStreakLabel')).toBe('LinkedIn Games · último registro');
      expect(text('gamesHeroStreak')).toBe('Sin registro desde 3 nov 2026');
      expect(text('gamesHeroMeta')).toBe('Tu récord: 122 días · registro manual');
    });

    it('shouldMarkTodaysRecordedGamesInTheHeroChips', async () => {
      await open({ zip: game() }, { ok: true, day: { games: { zip: { score: '0:08' } } } });
      const chips = [...el.querySelectorAll('#gamesToday button')];
      expect(chips).toHaveLength(6);
      expect(chips.find((c) => c.textContent!.includes('Zip'))!.className).toContain('pill-win');
      expect(chips.find((c) => c.textContent!.includes('Zip'))!.textContent).toBe('✓ Zip');
      expect(chips.find((c) => c.textContent!.includes('Tango'))!.className).not.toContain('pill-win');
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
      expect(cellsOf()).toHaveLength(1);
    });

    it('shouldShowTheTableAsUnavailableWhenAWindowIsMissing', async () => {
      await open({ zip: game({ windows: {} }), tango: game() });
      expect(text('gamesRows')).toBe('No disponible');
      expect(text('gamesHeroStreak')).toBe('48 días seguidos');
    });

    it('shouldShowOnlyTheMalformedCardAsUnavailable', async () => {
      await open({ zip: game({ best: null }), tango: game() });
      const cards = cardsOf();
      expect(cards).toHaveLength(2);
      const zip = cards.find((c) => nameOf(c) === 'Zip')!, tango = cards.find((c) => nameOf(c) === 'Tango')!;
      expect(linesOf(zip)).toEqual(['No disponible']);
      expect(factsOf(tango)).toContain('Mejor marca | 0:32 | 30 sep 2026');
    });

    it('shouldKeepTheChipsWhenTheDayBodyIsMalformed', async () => {
      await open({ zip: game() }, { ok: true, day: { games: 'x' } });
      expect([...el.querySelectorAll('#gamesToday button')].map((b) => b.className)).toEqual(Array(6).fill('pill pill-scope'));
    });
  });

  describe('games comparison table', () => {
    const two = () => ({ zip: game({ n: 170, windows: { ...game().windows, '28': win({ eff: { median: 2.08, nEff: 28 }, beat: { rate: 0.84, k: 24, nBeat: 28 } }) } }), tango: game() });

    it('shouldShowOneRowPerGameInPlainWords', async () => {
      await open(two());
      const rows = cellsOf();
      expect(rows).toHaveLength(2);
      expect(rows.find((r) => r[0] === 'Tango')).toEqual(['Tango', 'Sin señales de cambio', 'un poco más rápido', '18 de 28 días', '0:52', '1 día']);
      expect(rows.find((r) => r[0] === 'Zip')![2]).toBe('el doble de rápido');
      expect(rows.find((r) => r[0] === 'Zip')![3]).toBe('24 de 28 días');
    });

    it('shouldNeverShowAFormulaInATableCell', async () => {
      await open(two());
      for (const r of cellsOf()) for (const c of r) expect(c).not.toMatch(/×|%|\bn=|Δ|P25|[↑↓→]/);
    });

    it('shouldGiveTheNormalTimeRangeAsATitleNotInTheCell', async () => {
      await open({ zip: game() });
      expect(el.querySelector('#gamesRows tr')!.children[4].getAttribute('title')).toBe('suele estar entre 0:43 y 1:04');
    });

    it('shouldExplainThatTheVerdictIsAlwaysFourWeeksWhenAnotherRangeIsSelected', async () => {
      await open({ zip: game() });
      expect(el.querySelector('#gamesRangeNote')).toBeNull();
      await setRange('7');
      expect(text('gamesRangeNote')).toContain('siempre las últimas 4 semanas');
    });

    it('shouldExplainInTheCaptionAndTheHelpWhereTheStreakDashIsRead', async () => {
      await open({ zip: game() });
      const caption = el.querySelector('#gamesTable caption')!.textContent!;
      expect(caption).toContain('«Cómo vas» mira siempre las últimas 4 semanas');
      expect(caption).toContain('Días seguidos con un guion: sin racha activa');
      expect(el.querySelector('#cg-games-cmp app-help')!.textContent).toContain('«—» significa sin racha activa');
    });

    it('shouldSortByTheClickedColumnAndFlipTheDirectionOnASecondClick', async () => {
      await open(two());
      expect(names()).toEqual(['Zip', 'Tango']); // default: speed, descending
      await sortBy('name');
      expect(names()).toEqual(['Tango', 'Zip']);
      expect(headOf(0).getAttribute('aria-sort')).toBe('ascending');
      await sortBy('name');
      expect(names()).toEqual(['Zip', 'Tango']);
      expect(headOf(0).getAttribute('aria-sort')).toBe('descending');
      expect(headOf(1).getAttribute('aria-sort')).toBe('none');
    });

    it('shouldSortRowsWithoutAValueLastWhicheverTheDirection', async () => {
      const empty = game({ windows: { ...game().windows, '28': win({ eff: { median: null, nEff: 0 } }) } });
      await open({ a_null: empty, zip: game() });
      expect(names().at(-1)).toBe('a_null');
      await sortBy('speed'); // flips to ascending
      expect(names().at(-1)).toBe('a_null');
    });

    it('shouldRecomputeTheTableWhenThePeriodChangesWithoutAskingTheServerAgain', async () => {
      await open({ zip: game({ windows: { ...game().windows, '7': win({ eff: { median: 3, nEff: 5 } }) } }) });
      await setRange('7');
      expect(cellsOf()[0][2]).toBe('mucho más rápido');
      http.verify();
      expect(el.querySelector('#gr-7')!.getAttribute('aria-pressed')).toBe('true');
      expect(el.querySelector('#gr-28')!.getAttribute('aria-pressed')).toBe('false');
    });

    it('shouldGiveTheReasonInTheDetailsWhenThePreviousPeriodIsNotComparable', async () => {
      await open({ zip: game() });
      await setRange('90');
      expect(howFactsOf(cardsOf()[0]).find((r) => r.startsWith('Cambio frente al periodo anterior'))).toMatch(/— \| Periodo anterior incompleto/);
      await setRange('all');
      expect(howFactsOf(cardsOf()[0]).find((r) => r.startsWith('Cambio frente al periodo anterior'))).toMatch(/todo el histórico/);
    });

    it('shouldShowADashInsteadOfACountOfDaysWhenThereAreNoDays', async () => {
      const none = game({ windows: { ...game().windows, '28': win({ eff: { median: null, nEff: 0 }, beat: { rate: null, k: 0, nBeat: 0 }, time: { median: null, p25: null, p75: null, nTime: 0 }, prev: null, delta: null }) } });
      await open({ zip: none });
      expect(cellsOf()[0]).toEqual(['Zip', 'Sin señales de cambio', '—', '—', '—', '1 día']);
    });

    it('shouldKeepTheSortAndThePeriodWhenTheSummaryIsReloaded', async () => {
      await open(two());
      await sortBy('name');
      await setRange('7');
      (fixture.componentInstance as any).data.reload();
      await tick();
      await answer(summaryOf(two()));
      expect(names()).toEqual(['Tango', 'Zip']);
      expect(el.querySelector('#gr-7')!.getAttribute('aria-pressed')).toBe('true');
    });
  });

  describe('games page markup', () => {
    it('shouldExposeAccessibleControlsForPeriodTableAndChart', async () => {
      await open({ zip: game() });
      expect(el.querySelector('[role="group"][aria-label="Periodo de análisis"]')).not.toBeNull();
      for (const k of ['7', '28', '90', 'all']) expect(el.querySelector(`#gr-${k}[aria-pressed]`)).not.toBeNull();
      expect(el.querySelector('#gamesTable caption.sr-only')!.textContent).toMatch(/^Comparativa de juegos/);
      expect(el.querySelector('label.muted[for="gamesTrajGame"]')).not.toBeNull();
      expect(el.textContent).not.toMatch(/Todos \(agregado\)/);
      expect([...el.querySelectorAll('#gamesHead th')].every((th) => th.getAttribute('scope') === 'col')).toBe(true);
    });
  });

  describe('games interpretation', () => {
    const all = () => ({
      zip: game({ interpretation: interp() }),
      tango: game({ interpretation: interp({ label: 'deterioro', reason: 'reciente', candidate: 'deterioro', previousCandidate: 'deterioro' }) }),
      wend: game({ interpretation: interp({ label: 'mejora_sostenida', candidate: 'mejora_sostenida', previousCandidate: 'mejora_sostenida' }) }),
      patches: game({ interpretation: interp({ label: 'datos_insuficientes', reason: 'cobertura_insuficiente', candidate: 'datos_insuficientes', previousCandidate: 'datos_insuficientes', bands: null, calibratedThrough: null }) }),
    });

    it('shouldSortTheCardsByVerdictPriorityAndStyleOnlyTheConfirmedDrop', async () => {
      await open(all());
      const cards = cardsOf();
      expect(cards.map(nameOf)).toEqual(['Tango', 'Wend', 'Zip', 'Patches']);
      expect(cards.map((c) => c.classList.contains('det'))).toEqual([true, false, false, false]);
    });

    it('shouldShowTheVerdictAsAPillInPlainWordsOnEveryCard', async () => {
      await open(all());
      const byName = Object.fromEntries(cardsOf().map((c) => [nameOf(c), badgeOf(c)]));
      expect(byName['Tango'].textContent).toBe('A la baja');
      expect(byName['Wend'].textContent).toBe('Al alza');
      expect(byName['Zip'].textContent).toBe('Sin señales de cambio');
      expect(byName['Patches'].textContent).toBe('Aún pocos datos');
      expect(byName['Tango'].className).toContain('pill-warn');
      expect(byName['Wend'].className).toContain('pill-win');
    });

    it('shouldSayInOneSentenceWhatEachVerdictMeans', async () => {
      await open(all());
      const byName = Object.fromEntries(cardsOf().map((c) => [nameOf(c), c.querySelector('.ginterp')!.textContent]));
      expect(byName['Tango']).toBe('Vas más lento que antes, y se ha repetido dos semanas seguidas.');
      expect(byName['Wend']).toBe('Vas más rápido que antes, y se ha repetido dos semanas seguidas.');
      expect(byName['Zip']).toBe('No se ve ningún cambio claro en las últimas 4 semanas.');
      expect(byName['Patches']).toBe('Todavía no hay historial suficiente para juzgar este juego.');
    });

    it('shouldKeepTheEnginesOwnExplanationOfEachLabelInComoSeCalcula', async () => {
      await open(all());
      const byName = Object.fromEntries(cardsOf().map((c) => [nameOf(c), howLinesOf(c)]));
      expect(byName['Tango'][0]).toBe('Los últimos 28 días están un −31 % frente a los 56 anteriores; el límite de ruido de este juego es −23 % (n=27/54). Se repite dos semanas seguidas.');
      expect(byName['Wend'][0]).toBe('Tendencia al alza en los últimos 112 días: ρ de Spearman +0,28 (límite +0,18) y pendiente +3,3 % cada 28 días (n=110). Se repite dos semanas seguidas.');
      expect(byName['Zip'][0]).toBe('Ninguna señal supera el ruido de este juego: a 28 días solo se detecta un cambio por debajo de −26 % o por encima de +34 %.');
      expect(byName['Patches'][0]).toBe('Faltan observaciones con media: hacen falta al menos 68 de los últimos 112 días, 17 de los últimos 28 y 34 de los 56 anteriores.');
      expect(byName['Zip']).toContain('Límites calibrados con datos hasta 3 nov 2026.');
      expect(byName['Patches'].some((l: string) => l.startsWith('Límites calibrados'))).toBe(false);
    });

    it('shouldExplainASustainedDropWithItsTrendAndAnUncalibratedGameInComoSeCalcula', async () => {
      const down = game({ trend112: { rho: -0.3, slopePctPer28d: -4.1, n: 100, days: 112 }, interpretation: interp({ label: 'deterioro', reason: 'sostenido', candidate: 'deterioro', previousCandidate: 'deterioro' }) });
      const none = game({ interpretation: interp({ label: 'datos_insuficientes', reason: 'sin_calibracion', candidate: 'datos_insuficientes', previousCandidate: 'datos_insuficientes', bands: null, calibratedThrough: null }) });
      await open({ zip: down, tango: none });
      const byName = Object.fromEntries(cardsOf().map((c) => [nameOf(c), howLinesOf(c)]));
      expect(byName['Zip'][0]).toBe('Tendencia a la baja en los últimos 112 días: ρ de Spearman −0,3 (límite −0,19) y pendiente −4,1 % cada 28 días (n=100). Se repite dos semanas seguidas.');
      expect(byName['Tango'][0]).toBe('Este juego aún no tiene límites calibrados (57 de 112 días de historia observados; requiere el periodo completo sin validez parcial).');
    });

    it('shouldCallAnUnconfirmedSignalPossibleWhileTheEnginesLabelStaysStable', async () => {
      await open({ zip: game({ interpretation: interp({ candidate: 'mejora_sostenida', pending: 'mejora_sostenida' }) }) });
      const card = cardsOf()[0];
      expect(badgeOf(card).textContent).toBe('Posible subida');
      expect(card.querySelector('.ginterp')!.textContent).toBe('Puede que vayas algo más rápido. Si se repite la semana que viene, lo confirmamos.');
      expect(howLinesOf(card)).toContain('Señal sin confirmar: mejora sostenida. Se publicará si se repite la semana próxima.');
    });

    it('shouldIgnoreTheObsoleteRegressionFlag', async () => {
      await open({ zip: game({ regression: true }) });
      const card = cardsOf()[0];
      expect(card.classList.contains('det')).toBe(false);
      expect(badgeOf(card).textContent).toBe('Sin señales de cambio');
      expect(card.textContent).not.toMatch(/regresi/i);
    });

    it('shouldDrawTheRollingMedianSparkOnEachCard', async () => {
      await open({ zip: game() });
      expect(cardsOf()[0].querySelector('svg.spark polyline')!.getAttribute('points')).toBe('0.0,2.0 100.0,22.0');
      expect([...cardsOf()[0].querySelectorAll('.gcap')].map((x) => x.textContent).at(-1)).toBe('Tendencia de 28 días');
    });
  });

  describe('games change against the previous period', () => {
    const withArrow = (arrow: string | null, value: number) => game({ windows: { ...game().windows, '28': win28(arrow, value) } });
    const changeOf = () => howFactsOf(cardsOf()[0]).find((r) => r.startsWith('Cambio frente al periodo anterior'));

    it.each([['up', 0.4, '+40 %'], ['down', -0.4, '−40 %']])('shouldSayInTheDetailsWhenTheChangeIsBeyondTheNoiseGoing %s', async (arrow, value, t) => {
      await open({ zip: withArrow(arrow as string, value as number) });
      expect(changeOf()).toBe(`Cambio frente al periodo anterior | ${t} | Supera el ruido de este juego (fuera de −26 % a +34 %).`);
    });

    it('shouldSayInsideTheNoiseWhenTheChangeIsSmall', async () => {
      await open({ zip: withArrow('flat', 0.1) });
      expect(changeOf()).toBe('Cambio frente al periodo anterior | +10 % | Dentro del ruido de este juego (−26 % a +34 %).');
    });

    it('shouldShowTheNumberWithoutAReadingWhenThereIsNoCalibrationOrCoverage', async () => {
      await open({ zip: withArrow(null, 0.4) });
      expect(changeOf()).toMatch(/^Cambio frente al periodo anterior \| \+40 % \| Sin calibración/);
    });

    it.each(['7', '28', '90', 'all'])('shouldNeverDrawAnArrowOnThePageInThe%sPeriod', async (range) => {
      await open({ zip: game({ windows: { '7': win(), '28': win28('up', 0.4), '90': win(), all: win() } }) });
      await setRange(range);
      expect(el.querySelector('#gamesRows')!.textContent! + el.querySelector('#gamesList')!.textContent!).not.toMatch(/[↑↓→]/); // the hero's date range has its own arrow
    });
  });

  describe('games interpretation markup', () => {
    it('shouldExplainWhatNoSignalMeansAndNeverMentionRegression', async () => {
      await open({ zip: game() });
      expect(text('gamesInterpNote')).toContain('«Sin señales de cambio» significa que no se ve un cambio claro, no que no lo haya habido');
      expect(el.textContent).not.toMatch(/regresión/i);
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
      expect(cellsOf()).toHaveLength(2);
      expect(cardsOf()).toHaveLength(2);
      expect(factsOf(cardsOf()[0])).toContain('Mejor marca | 0:32 | 30 sep 2026');
    });

    it('shouldShowTheTrajectoryAsUnavailableWhenItIsMalformedWhileTheTableStillRenders', async () => {
      await open({ zip: game({ trajectory: { '28': 'x' } }) });
      expect(text('gamesChart')).toBe('No disponible');
      expect(el.querySelectorAll('#gamesDataRows tr')).toHaveLength(0);
      expect(cellsOf()).toHaveLength(1);
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

  describe('games entry modal', () => {
    const DAY_URL = '/api/me/linkedin-games';
    const gets = () => pending().filter((r) => r.request.method === 'GET' && r.request.url === DAY_URL);
    const puts = () => pending().filter((r) => r.request.method === 'PUT');
    const val = (id: string) => el.querySelector<HTMLInputElement>('#' + id)!.value;
    const type = async (id: string, v: string, ev = 'input') => {
      const i = el.querySelector<HTMLInputElement>('#' + id)!; i.value = v; i.dispatchEvent(new Event(ev)); await tick();
    };
    const dayLines = () => [...el.querySelectorAll('#lgDay li')].map((li) => li.textContent);
    /** Dispatches a keydown on the document; resolves true when a handler cancelled it (preventDefault). */
    const key = async (k: string, shiftKey = false) => {
      const prevented = !document.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }));
      await tick();
      return prevented;
    };
    /** Opens from the hero button and answers the day request. */
    const openEntry = async (day: Body = { ok: true, day: { games: {} } }) => {
      await open({ zip: game() });
      el.querySelector<HTMLElement>('#gamesEntryOpen')!.focus();
      await click('#gamesEntryOpen');
      const r = gets();
      expect(r).toHaveLength(1);
      reply(r[0], day);
      await tick();
    };
    const fill = async () => {
      await type('lgDate', '2026-10-12', 'change');
      reply(gets()[0], { ok: true, day: { games: {} } }); await tick();
      await type('lgScore', ' 0:08 '); await type('lgAvg', ''); await type('lgNumber', '449');
    };

    it('shouldOpenThePrefilledModalWhenATodayChipIsTapped', async () => {
      await open({ zip: game() });
      await click('#gamesToday [data-game="tango"]');
      expect(el.querySelectorAll('#lgModal')).toHaveLength(1);
      expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
      expect(val('lgGame')).toBe('tango');
      expect(val('lgDate')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const r = gets();
      expect(r).toHaveLength(1);
      expect(r[0].request.urlWithParams).toBe(DAY_URL + '?date=' + val('lgDate'));
      reply(r[0], { ok: true, day: { games: {} } }); await tick();
      expect(document.activeElement!.id).toBe('lgScore');
      expect(dayLines()).toEqual(['Nada todavía.']);
      http.verify();
    });

    it('shouldPutTheResultAndRefreshTheSummaryWhenSaved', async () => {
      await openEntry();
      await type('lgGame', 'zip', 'change');
      await fill();
      await click('#lgSave');
      const p = puts();
      expect(p).toHaveLength(1);
      expect(p[0].request.url).toBe(DAY_URL);
      expect(p[0].request.body).toMatchObject({ date: '2026-10-12', game: 'zip', score: '0:08', avg: null, number: 449 });
      expect(typeof p[0].request.body.tz).toBe('string');
      expect(text('lgStatus')).toBe('Guardando…');
      p[0].flush({ ok: true, day: { games: { zip: { score: '0:08' } } } });
      await tick();
      expect(text('lgStatus')).toBe('Guardado.');
      expect(val('lgScore')).toBe('');
      expect(val('lgNumber')).toBe('');
      const refresh = pending();
      expect(refresh.filter((r) => r.request.url.endsWith('/summary'))).toHaveLength(1);
      await answer(summaryOf({ zip: game() }), undefined, refresh);
      http.verify();
    });

    it('shouldSaveResultThenRefreshDay', async () => {
      await openEntry();
      await type('lgScore', '0:08');
      await click('#lgSave');
      puts()[0].flush({ ok: true, day: { games: { zip: { score: '0:08', avg: '0:17', number: 449 } } } });
      await tick();
      expect(dayLines()).toEqual(['Zip: 0:08  (media 0:17)  #449']); // painted from the PUT answer, not asked again
      await answer(summaryOf({ zip: game() }), { ok: true, day: { games: { zip: { score: '0:08' } } } });
      expect(el.querySelector('#gamesToday [data-game="zip"]')!.className).toContain('pill-win');
      expect(el.querySelectorAll('#lgModal')).toHaveLength(1); // stays open for the next result
      http.verify();
    });

    it('shouldNotPaintTheSavedDayOverADateChosenWhileSaving', async () => {
      await openEntry();
      await click('#lgSave');
      await type('lgDate', '2026-10-03', 'change');
      const inFlight = pending(); // match() takes them off the queue: keep both
      const dayReq = inFlight.find((r) => r.request.urlWithParams === DAY_URL + '?date=2026-10-03')!;
      inFlight.find((r) => r.request.method === 'PUT')!.flush({ ok: true, day: { games: { zip: { score: '0:08' } } } });
      await tick();
      expect(dayLines()).toEqual([]); // the saved day is not the one on screen any more
      reply(dayReq, { ok: true, day: { games: { wend: { score: '2:00' } } } });
      await answer(summaryOf({ zip: game() })); // the page refresh after the save
      expect(dayLines()).toEqual(['Wend: 2:00']);
      http.verify();
    });

    it('shouldShowTheServerErrorWhenTheSaveIsRefused', async () => {
      await openEntry();
      await type('lgScore', 'fast');
      await click('#lgSave');
      puts()[0].flush({ ok: false, error: 'fast is not a time as M:SS' }, { status: 400, statusText: 'Bad Request' });
      await tick();
      expect(text('lgStatus')).toMatch(/No se pudo guardar: .*not a time/);
      expect(val('lgScore')).toBe('fast'); // the typed value is kept
      expect(el.querySelectorAll('#lgModal')).toHaveLength(1);
      http.verify(); // no refresh after a refused save
    });

    it('shouldSayTheSaveFailedWhenTheServerAnswersWithoutOk', async () => {
      await openEntry();
      await click('#lgSave');
      puts()[0].flush({ ok: false });
      await tick();
      expect(text('lgStatus')).toBe('No se pudo guardar: 200');
    });

    it('shouldSayTheSaveFailedWhenTheNetworkFails', async () => {
      await openEntry();
      await type('lgScore', '0:08');
      await click('#lgSave');
      puts()[0].error(new ProgressEvent('error'));
      await tick();
      expect(text('lgStatus')).toBe('No se pudo guardar.');
      expect(val('lgScore')).toBe('0:08');
    });

    it('shouldNotSubmitTwiceWhileASaveIsInFlight', async () => {
      await openEntry();
      await click('#lgSave');
      expect(el.querySelector<HTMLButtonElement>('#lgSave')!.disabled).toBe(true);
      el.querySelector<HTMLButtonElement>('#lgSave')!.click();
      await tick();
      const p = puts();
      expect(p).toHaveLength(1);
      p[0].flush({ ok: false, error: 'x' }, { status: 400, statusText: 'x' });
      await tick();
      expect(el.querySelector<HTMLButtonElement>('#lgSave')!.disabled).toBe(false);
    });

    it('shouldNotPaintALateDayOverTheNewerOne', async () => {
      await openEntry();
      await type('lgDate', '2026-10-01', 'change');
      const first = gets()[0];
      await type('lgDate', '2026-10-02', 'change');
      expect(first.cancelled).toBe(true);
      const second = gets();
      expect(second.map((r) => r.request.urlWithParams)).toEqual([DAY_URL + '?date=2026-10-02']);
      reply(second[0], { ok: true, day: { games: { tango: { score: '1:02' } } } }); await tick();
      expect(dayLines()).toEqual(['Tango: 1:02']);
    });

    it('shouldSayTheDayCouldNotBeLoadedWithoutClaimingNothingWasRecorded', async () => {
      await openEntry(FAIL);
      expect(text('lgStatus')).toBe('No se pudo cargar el día.');
      expect(dayLines()).toEqual([]);
    });

    it('shouldShowTheDayAsUnavailableWhenItsBodyIsMalformed', async () => {
      await openEntry({ ok: true, day: { games: 'x' } });
      expect(dayLines()).toEqual(['No disponible']);
      expect(el.querySelector('#lgSave')).not.toBeNull();
    });

    it('shouldCloseTheModalWhenCloseIsCalled', async () => {
      await openEntry();
      await click('#lgModal [aria-label="Cerrar"]');
      expect(el.querySelector('#lgModal')).toBeNull();
      expect(document.activeElement!.id).toBe('gamesEntryOpen'); // focus goes back to the opener
    });

    it('shouldCloseOnEscapeAndOnTheBackdropAndRestoreFocus', async () => {
      await openEntry();
      await key('Escape');
      expect(el.querySelector('#lgModal')).toBeNull();
      expect(document.activeElement!.id).toBe('gamesEntryOpen');
      el.querySelector<HTMLElement>('#gamesToday [data-game="queens"]')!.focus(); // a click focuses the button in a browser
      await click('#gamesToday [data-game="queens"]');
      reply(gets()[0], { ok: true, day: { games: {} } }); await tick();
      await click('#lgModal');
      expect(el.querySelector('#lgModal')).toBeNull();
      expect(document.activeElement!.getAttribute('data-game')).toBe('queens');
    });

    it('shouldMountOneDialogAndAskTheDayOncePerOpening', async () => {
      await openEntry();
      await type('lgDate', '2026-10-05', 'change');
      reply(gets()[0], { ok: true, day: { games: {} } }); await tick();
      await key('Escape');
      await click('#gamesEntryOpen');
      expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
      expect(val('lgDate')).toBe('2026-10-05'); // the chosen date stays, as in legacy
      expect(gets().map((r) => r.request.urlWithParams)).toEqual([DAY_URL + '?date=2026-10-05']);
    });

    it('shouldOfferOnlyTheSixGames', async () => {
      await openEntry();
      const opts = [...el.querySelectorAll('#lgGame option')];
      expect(opts).toHaveLength(6);
      expect(opts.map((o) => o.textContent).join(' ')).not.toMatch(/pinpoint|crossclimb/i);
    });

    describe('focus trap', () => {
      const controls = () => [...el.querySelectorAll<HTMLElement>('#lgModal button:not([disabled]), #lgModal select, #lgModal input')];
      /**
       * Index of the focused control after one Tab (-1 = the last control) and whether the Tab was cancelled. jsdom never
       * moves focus on Tab, so `prevented` is what proves the browser will not move it a second time (legacy asserted it too).
       */
      const trap = async (active: number | null, shift: boolean) => {
        const f = controls();
        if (active === null) el.querySelector<HTMLElement>('#gamesEntryOpen')!.focus(); else f[active === -1 ? f.length - 1 : active].focus();
        const prevented = await key('Tab', shift);
        const i = f.indexOf(document.activeElement as HTMLElement);
        return { focused: i === f.length - 1 ? -1 : i, prevented };
      };
      beforeEach(async () => { await openEntry(); });

      it('shouldWrapToTheFirstControlWhenTabbingFromTheLast', async () => {
        expect(await trap(-1, false)).toEqual({ focused: 0, prevented: true });
      });

      it('shouldWrapToTheLastControlWhenShiftTabbingFromTheFirst', async () => {
        expect(await trap(0, true)).toEqual({ focused: -1, prevented: true });
      });

      it('shouldMoveToTheNextControlWhenTabbingInTheMiddle', async () => {
        expect(await trap(0, false)).toEqual({ focused: 1, prevented: true }); // legacy trapGamesFocus cancels every Tab inside the dialog
      });

      it('shouldEnterTheDialogWhenFocusIsOutsideIt', async () => {
        expect(await trap(null, false)).toEqual({ focused: 0, prevented: true });
        expect(await trap(null, true)).toEqual({ focused: -1, prevented: true });
      });
    });
  });
});
