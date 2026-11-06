import { DOCUMENT, inject, Injectable, InjectionToken } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, timeout } from 'rxjs';

/** The browser location (read for the login `next`, assigned to leave the app, reloaded after a sync). Replaced in specs. */
export const BROWSER_LOCATION = new InjectionToken<Pick<Location, 'pathname' | 'search' | 'href' | 'reload'>>('BROWSER_LOCATION', {
  factory: () => inject(DOCUMENT).location,
});

// Same ceiling as the legacy dashboard (src/dashboard.client.js REQUEST_TIMEOUT_MS): a request that never answers
// errors with TimeoutError instead of leaving a view stuck on "Cargando".
const REQUEST_TIMEOUT_MS = 10_000;

type Params = Record<string, string | number>;

/** The one place the app talks to the Worker API. An HTTP error is an error, never data. */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);

  get<T>(path: string, params?: Params): Observable<T> {
    return this.http.get<T>(path, { params }).pipe(timeout(REQUEST_TIMEOUT_MS));
  }

  post<T>(path: string, body: unknown = null, params?: Params): Observable<T> {
    return this.http.post<T>(path, body, { params }).pipe(timeout(REQUEST_TIMEOUT_MS));
  }

  put<T>(path: string, body: unknown = null, params?: Params): Observable<T> {
    return this.http.put<T>(path, body, { params }).pipe(timeout(REQUEST_TIMEOUT_MS));
  }
}
