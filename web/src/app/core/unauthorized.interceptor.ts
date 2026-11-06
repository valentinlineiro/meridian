import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { BROWSER_LOCATION } from './api-client';

/** A 401 means the session ended: go to login and come back to the same page (src/dashboard.client.js:53). */
export const unauthorizedInterceptor: HttpInterceptorFn = (req, next) => {
  const location = inject(BROWSER_LOCATION);
  return next(req).pipe(
    tap({
      error: (e: unknown) => {
        if (e instanceof HttpErrorResponse && e.status === 401)
          location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search);
      },
    }),
  );
};
