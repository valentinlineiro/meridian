import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApiClient, BROWSER_LOCATION } from './api-client';
import { unauthorizedInterceptor } from './unauthorized-interceptor';

describe('unauthorizedInterceptor', () => {
  it('shouldRedirectToLoginWithCurrentRouteWhenApiReturns401', () => {
    const location = { pathname: '/languages/DUOLINGO_ES', search: '?from=a&b=c d', href: '' };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([unauthorizedInterceptor])),
        provideHttpClientTesting(),
        { provide: BROWSER_LOCATION, useValue: location },
      ],
    });
    let failed = false;
    TestBed.inject(ApiClient).get('/api/me/languages').subscribe({ error: () => (failed = true) });

    TestBed.inject(HttpTestingController).expectOne('/api/me/languages').flush(null, { status: 401, statusText: 'Unauthorized' });

    // Same encoding as src/dashboard.client.js:53: encodeURIComponent(location.pathname + location.search).
    expect(location.href).toBe('/login?next=%2Flanguages%2FDUOLINGO_ES%3Ffrom%3Da%26b%3Dc%20d');
    expect(failed).toBe(true);
  });
});
