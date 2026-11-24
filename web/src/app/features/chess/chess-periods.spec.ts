import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
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
