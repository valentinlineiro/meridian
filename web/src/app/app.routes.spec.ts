import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';

describe('App routes', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter(routes)] }));

  it.each(['/', '/nope', '/a/b'])('shouldNavigateToOverviewWhenPathIsUnknown %s', async (url) => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    expect(TestBed.inject(Router).url).toBe('/overview');
    expect(harness.routeNativeElement?.querySelector('h2')?.textContent).toBe('Hoy');
  });

  it('shouldKeepTheCourseIdWhenOpeningALanguagesDeepLink', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/languages/DUOLINGO_ES');
    expect(TestBed.inject(Router).url).toBe('/languages/DUOLINGO_ES');
    expect(harness.routeNativeElement?.querySelector('h2')?.textContent).toBe('Idiomas');
  });
});
