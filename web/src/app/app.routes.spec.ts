import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';

describe('App routes', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()] }));

  it.each(['/', '/nope', '/a/b'])('shouldNavigateToOverviewWhenPathIsUnknown %s', async (url) => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    expect(TestBed.inject(Router).url).toBe('/overview');
    expect(harness.routeNativeElement?.querySelector('#overviewTab')).not.toBeNull();
  });

  it('shouldKeepTheCourseIdWhenOpeningALanguagesDeepLink', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/languages/DUOLINGO_ES');
    expect(TestBed.inject(Router).url).toBe('/languages/DUOLINGO_ES');
    expect(harness.routeNativeElement?.querySelector('#langTab')).not.toBeNull();
  });
});
