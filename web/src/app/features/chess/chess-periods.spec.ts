import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { StatsService } from '../../core/stats.service';
import { ChessPeriods } from './chess-periods';
import { Tally, WeekBucket, Weekly } from './weekly.model';

const T = (w = 0, d = 0, l = 0): Tally => ({ w, d, l, u: 0, disconnections: 0 });
const monday = (back: number) => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - back * 7); return d.toISOString().slice(0, 10); };
const week = (back: number, w: number, l: number, eloEnd: number | null) => ({
  week: monday(back), games: w + l, total: T(w, 0, l), byColor: { white: T(w, 0, l) }, byFamily: { Italiana: T(w, 0, l) }, byPhase: {}, eloEnd,
});

async function mount(body: Weekly | 'fail') {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  const f = TestBed.createComponent(ChessPeriods);
  f.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  const req = http.expectOne((r) => r.url.includes('/api/stats/weekly'));
  if (body === 'fail') req.flush('x', { status: 500, statusText: 'err' }); else req.flush(body);
  await f.whenStable();
  f.detectChanges();
  return f.nativeElement as HTMLElement;
}

describe('ChessPeriods', () => {
  it('shouldShowASkeletonAndALoadingStatusWhileTheWeeksLoad', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const f = TestBed.createComponent(ChessPeriods);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[role=status].sr-only')!.textContent).toContain('Cargando tus periodos');
    expect(el.querySelector('.sk')).not.toBeNull();
    expect(el.querySelector('#chessPeriodElo')).toBeNull(); // no dash that reads as a value
  });

  it('shouldRenderTheEmptyStateWhenThereAreNoWeeks', async () => {
    const el = await mount({ weeks: [], undated: { games: 0, ...T() } });
    expect(el.textContent).toContain('Aún no hay partidas con fecha');
    expect(el.textContent).not.toContain('NaN');
  });

  it('shouldShowTheCurrentEloAndItsChangeWhenWeeksHaveElo', async () => {
    const el = await mount({ weeks: [week(2, 5, 5, 900), week(0, 8, 2, 925)], undated: { games: 0, ...T() } });
    expect(el.querySelector('#chessPeriodElo')!.textContent).toContain('925');
    expect(el.querySelector('#chessPeriodDelta')!.textContent).toContain('+25');
  });

  it('shouldNotRepeatTheEloWhenThereIsASingleReading', async () => {
    const el = await mount({ weeks: [week(0, 8, 2, 925)], undated: { games: 0, ...T() } });
    expect(el.textContent!.match(/925/g)).toHaveLength(1);
    expect(el.textContent).toContain('Una sola lectura de ELO');
  });

  it('shouldListEveryWeekWithEloInTheTableWhenRendering', async () => {
    const el = await mount({ weeks: [week(2, 5, 5, 900), week(1, 5, 5, null), week(0, 8, 2, 925)], undated: { games: 0, ...T() } });
    const rows = [...el.querySelectorAll('#chessEloTable tbody tr')].map((r) => r.textContent!.replace(/\s+/g, ' ').trim());
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain('925');
  });

  it('shouldKeepARowAtThePeriodAverageInPorColorWhenItsDeltaIsZero', async () => {
    const w = { week: monday(0), games: 20, total: T(10, 0, 10), byColor: { white: T(5, 0, 5), black: T(5, 0, 5) }, byFamily: { Italiana: T(10, 0, 10) }, byPhase: {}, eloEnd: null };
    const el = await mount({ weeks: [w], undated: { games: 0, ...T() } });
    const rows = [...el.querySelectorAll('#chessColorOpenings li')].map((r) => r.textContent!.replace(/\s+/g, ' '));
    expect(rows.some((r) => r.includes('Con blancas'))).toBe(true);
    expect(rows.some((r) => r.includes('Con negras'))).toBe(true);
    expect(rows.some((r) => r.includes('Italiana'))).toBe(true); // the only family played always equals the average
  });

  const families = (k: number) => Object.fromEntries(Array.from({ length: k }, (_, i) => [`Ap${i + 1}`, T(10 + i * 2, 0, 5)])); // higher index = more played
  const wide = (byFamily: Record<string, Tally>, endgame?: Tally): WeekBucket => ({ week: monday(0), games: 300, total: T(150, 0, 150), byColor: { white: T(75, 0, 75), black: T(75, 0, 75) }, byFamily, byPhase: endgame ? { endgame } : {}, eloEnd: null });

  it('shouldShowTheEightMostPlayedOpeningsAndFoldTheRestWhenThereAreMoreThanEight', async () => {
    const el = await mount({ weeks: [wide(families(12))], undated: { games: 0, ...T() } });
    const top = [...el.querySelectorAll('#chessOpeningsTop li .rate-label')].map((l) => l.textContent!.trim());
    expect(top).toHaveLength(8);
    expect(top).not.toContain('Ap1'); // the four least played go to the fold
    expect(top).toContain('Ap12');
    expect(el.querySelectorAll('#chessOpeningsRest li')).toHaveLength(4);
    expect(el.querySelector('#chessOpeningsRest summary')!.textContent).toContain('4');
  });

  it('shouldNotFoldAnythingWhenThereAreEightOrFewerOpenings', async () => {
    const el = await mount({ weeks: [wide(families(8))], undated: { games: 0, ...T() } });
    expect(el.querySelectorAll('#chessOpeningsTop li')).toHaveLength(8);
    expect(el.querySelector('#chessOpeningsRest')).toBeNull();
  });

  it('shouldLabelTheLongGamesRowWithTheDefinitionNotWithTheBlockTitleWhenShowingIt', async () => {
    const el = await mount({ weeks: [wide(families(2), T(20, 0, 5))], undated: { games: 0, ...T() } });
    const row = el.querySelector('#chessLong li')!;
    expect(row.querySelector('.rate-label')!.textContent!.trim()).toBe('Más de 80 jugadas');
    expect(el.querySelector('#chessLong h3')!.textContent!.trim()).toBe('Partidas largas');
  });

  it('shouldSayNoClearDifferenceWhenNothingStandsOutFromTheAverage', async () => {
    const w = { week: monday(0), games: 40, total: T(20, 0, 20), byColor: { white: T(10, 0, 10), black: T(10, 0, 10) }, byFamily: { Italiana: T(10, 0, 10), Siciliana: T(10, 0, 10) }, byPhase: {}, eloEnd: null };
    const el = await mount({ weeks: [w], undated: { games: 0, ...T() } });
    expect(el.querySelector('#chessStrengths')!.textContent).toContain('Ninguna diferencia clara');
  });

  it('shouldSayWhereTheEloReadingsStartWhenTheyDoNotCoverThePeriod', async () => {
    const el = await mount({ weeks: [week(8, 5, 5, null), week(2, 5, 5, 900), week(0, 8, 2, 925)], undated: { games: 0, ...T() } });
    expect(el.querySelector('#chessEloSince')!.textContent).toContain('desde la semana del');
  });

  it('shouldNotSayWhereTheEloStartsWhenTheReadingsCoverThePeriod', async () => {
    const el = await mount({ weeks: [week(2, 5, 5, 900), week(0, 8, 2, 925)], undated: { games: 0, ...T() } });
    expect(el.querySelector('#chessEloSince')).toBeNull();
  });

  it('shouldPublishTheSyncTimeInTheHeaderWhenWeeklyCarriesIt', async () => {
    await mount({ weeks: [week(0, 8, 2, 925)], undated: { games: 0, ...T() }, syncedAt: '2026-11-19T10:00:00Z' });
    expect(TestBed.inject(StatsService).chessUpdated()).toBe('Ajedrez · actualizado 2026-11-19');
  });

  it('shouldLeaveTheHeaderAloneWhenWeeklyHasNoSyncTime', async () => {
    await mount({ weeks: [week(0, 8, 2, 925)], undated: { games: 0, ...T() }, syncedAt: null });
    expect(TestBed.inject(StatsService).chessUpdated()).toBe('');
  });

  it('shouldMentionTheGamesWithoutADateWhenAnyExist', async () => {
    const el = await mount({ weeks: [week(0, 8, 2, 925)], undated: { games: 40, ...T(20, 0, 20) } });
    expect(el.textContent).toContain('40 partidas sin fecha');
  });

  it('shouldNotMentionUndatedGamesWhenThereAreNone', async () => {
    const el = await mount({ weeks: [week(0, 8, 2, 925)], undated: { games: 0, ...T() } });
    expect(el.textContent).not.toContain('sin fecha');
  });

  it('shouldSayNoPeriodDataWhenThePeriodHasNoGamesButOlderWeeksExist', async () => {
    const el = await mount({ weeks: [week(60, 5, 5, 900)], undated: { games: 0, ...T() } });
    expect(el.textContent).toContain('Sin partidas en este periodo');
  });

  it('shouldOfferARetryWhenTheRequestFails', async () => {
    const el = await mount('fail');
    expect(el.textContent).toContain('No pudimos cargar');
    expect(el.querySelector('button')).toBeTruthy();
  });

  it('shouldSummariseThePeriodInOneLineWithTheChangeAgainstThePreviousOne', async () => {
    const el = await mount({ weeks: [week(15, 5, 5, null), week(0, 8, 2, 925)], undated: { games: 0, ...T() } });
    const t = el.querySelector('#chessSummary')!.textContent!.replace(/\s+/g, ' ');
    expect(t).toContain('80 % de victorias');
    expect(t).toContain('+30 pts frente al periodo anterior');
  });

  it('shouldKeepTheSummaryWithoutAChangeWhenThereIsNoPreviousPeriod', async () => {
    const el = await mount({ weeks: [week(0, 8, 2, 925)], undated: { games: 0, ...T() } });
    const t = el.querySelector('#chessSummary')!.textContent!;
    expect(t).toContain('80 % de victorias');
    expect(t).not.toContain('frente al periodo anterior');
  });

  it('shouldFoldColourOpeningsAndLongGamesIntoOneClosedDetailWhenShowingTheStrengths', async () => {
    const el = await mount({ weeks: [week(0, 8, 2, 925)], undated: { games: 0, ...T() } });
    const d = el.querySelector('details#chessDetail') as HTMLDetailsElement;
    expect(d.open).toBe(false);
    expect(d.querySelector('#chessColorOpenings')).not.toBeNull();
    expect(el.querySelector('#chessStrengths')!.closest('details')).toBeNull(); // the summary stays in view
  });

  it('shouldShowAtMostThreeWeaknessesAndFoldTheRestWhenThereAreMore', async () => {
    const fam = Object.fromEntries(['A', 'B', 'C', 'D', 'E'].map((k) => [k, T(10, 0, 90)]));
    const w = { week: monday(0), games: 600, total: T(300, 0, 300), byColor: { white: T(150, 0, 150), black: T(150, 0, 150) }, byFamily: { ...fam, Z: T(200, 0, 0) }, byPhase: {}, eloEnd: null };
    const el = await mount({ weeks: [w], undated: { games: 0, ...T() } });
    const weak = el.querySelectorAll('#chessWeakTop li');
    expect(weak).toHaveLength(3);
    expect(el.querySelectorAll('#chessWeakRest li')).toHaveLength(2);
    expect(el.querySelector('#chessWeakRest summary')!.textContent).toContain('2');
  });

  it('shouldExplainTheClearDifferenceRuleInPlainWordsAndKeepTheStatisticsFolded', async () => {
    const el = await mount({ weeks: [week(0, 8, 2, 925)], undated: { games: 0, ...T() } });
    const head = el.querySelector('#chessStrengths > p')!.textContent!;
    expect(head).not.toContain('intervalo de confianza');
    expect(el.querySelector('#chessStrengthsHelp')!.textContent).toContain('intervalo de confianza');
  });

  it('shouldSaySameAsThePreviousPeriodWhenTheChangeRoundsToZero', async () => {
    const el = await mount({ weeks: [week(15, 8, 2, null), week(0, 8, 2, 925)], undated: { games: 0, ...T() } });
    const t = el.querySelector('#chessSummary')!.textContent!.replace(/\s+/g, ' ');
    expect(t).toContain('igual que el periodo anterior');
    expect(t).not.toContain('0 pts');
  });
});
