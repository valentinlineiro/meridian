import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { StatsService } from '../../core/stats.service';
import { ChessPeriods } from './chess-periods';
import { Tally, Weekly } from './weekly.model';

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
});
