import { inject, Injectable, signal } from '@angular/core';
import { catchError, map, Observable, of, shareReplay, switchMap, throwError, TimeoutError } from 'rxjs';
import { ApiClient } from './api-client';

/** The keys of /api/stats/bundle, each also served by its own route. */
export type StatKey = 'summary' | 'results' | 'color' | 'opponents' | 'opponentElo' | 'timeline' | 'recent';
type Params = Record<string, string | number>;

// Port of statsBundle/stat (src/dashboard.client.js:1101–1107).
@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly api = inject(ApiClient);

  /** Header freshness line ("Ajedrez · actualizado …"): written by the view that owns the chess data while it is open. */
  readonly chessUpdated = signal('');

  /**
   * One load: the bundle is asked once and serves every stat. If it fails (or carries no summary) each stat falls back to
   * its own route; if it timed out the backend is slow and more reads would not help, so each stat errors instead.
   * A new session asks again: a retry never re-reads a failure.
   */
  session(): <T>(key: StatKey, route: string, params?: Params) => Observable<T | null> {
    const bundle = this.api.get<Partial<Record<StatKey, unknown>> | null>('/api/stats/bundle').pipe(
      map((b) => { if (!b?.summary) throw new Error('bundle'); return { b, timedOut: false }; }),
      catchError((e) => of({ b: null, timedOut: e instanceof TimeoutError })),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    return <T>(key: StatKey, route: string, params?: Params) => bundle.pipe(switchMap(({ b, timedOut }) =>
      b ? of((b[key] ?? null) as T | null) : timedOut ? throwError(() => new TimeoutError()) : this.api.get<T>(route, params)));
  }
}
