import { TestBed } from '@angular/core/testing';
import { firstValueFrom, forkJoin, Observable, of, throwError, TimeoutError } from 'rxjs';
import { ApiClient } from './api-client';
import { StatsService } from './stats.service';

// Port of statsBundle/stat (src/dashboard.client.js:1101–1107) and tests/frontendNetwork + chessDashboard "stats bundle".
describe('StatsService', () => {
  let asked: string[];
  const setup = (answer: (path: string) => Observable<unknown>) => {
    asked = [];
    TestBed.configureTestingModule({
      providers: [{ provide: ApiClient, useValue: { get: (path: string) => { asked.push(path); return answer(path); } } }],
    });
    return TestBed.inject(StatsService);
  };

  it('shouldAskForTheBundleOnceAndNotForTheRoutesWhenItAnswers', async () => {
    const stats = setup(() => of({ summary: { games: 3 }, color: { groups: [] } }));
    const stat = stats.session();
    const r = await firstValueFrom(forkJoin([stat('summary', '/api/stats/summary'), stat('color', '/api/stats/color'), stat('recent', '/api/stats/recent')]));
    expect(r).toEqual([{ games: 3 }, { groups: [] }, null]); // a key the bundle did not carry is unknown, not asked again
    expect(asked).toEqual(['/api/stats/bundle']);
  });

  it('shouldFallBackToEachRouteOnceWhenTheBundleFails', async () => {
    const stats = setup((p) => p === '/api/stats/bundle' ? throwError(() => new Error('500')) : of({ from: p }));
    const stat = stats.session();
    const r = await firstValueFrom(forkJoin([stat('summary', '/api/stats/summary'), stat('color', '/api/stats/color')]));
    expect(r).toEqual([{ from: '/api/stats/summary' }, { from: '/api/stats/color' }]);
    expect(asked).toEqual(['/api/stats/bundle', '/api/stats/summary', '/api/stats/color']);
  });

  it('shouldFallBackWhenTheBundleCarriesNoSummary', async () => {
    const stats = setup((p) => p === '/api/stats/bundle' ? of({ ok: false }) : of({ from: p }));
    expect(await firstValueFrom(stats.session()('summary', '/api/stats/summary'))).toEqual({ from: '/api/stats/summary' });
  });

  it('shouldNotAskEachRouteAgainWhenTheBundleTimedOut', async () => {
    const stats = setup(() => throwError(() => new TimeoutError()));
    const stat = stats.session();
    await expect(firstValueFrom(stat('summary', '/api/stats/summary'))).rejects.toThrow();
    expect(asked).toEqual(['/api/stats/bundle']);
  });

  it('shouldAskTheBundleAgainWhenANewSessionStarts', async () => {
    const stats = setup(() => of({ summary: {} }));
    await firstValueFrom(stats.session()('summary', '/api/stats/summary'));
    await firstValueFrom(stats.session()('summary', '/api/stats/summary'));
    expect(asked).toEqual(['/api/stats/bundle', '/api/stats/bundle']); // a retry never re-reads a cached failure
  });
});
