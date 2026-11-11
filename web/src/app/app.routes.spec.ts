import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';

describe('App routes', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()] }));

  it('shouldNavigateToOverviewWhenPathIsTheRoot', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/');
    expect(TestBed.inject(Router).url).toBe('/overview');
    expect(harness.routeNativeElement?.querySelector('#overviewTab')).not.toBeNull();
  });

  it.each(['/nope', '/a/b'])('shouldShowNotFoundWithALinkHomeWhenPathIsUnknown %s', async (url) => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    expect(TestBed.inject(Router).url).toBe(url); // the address is kept, it is not silently replaced
    const nf = harness.routeNativeElement!.querySelector('#notFound')!;
    expect(nf.querySelector('h1')!.textContent).toBe('Página no encontrada');
    expect(nf.querySelector('a')!.getAttribute('href')).toBe('/overview');
  });

  it('shouldKeepTheCourseIdWhenOpeningALanguagesDeepLink', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/languages/DUOLINGO_ES');
    expect(TestBed.inject(Router).url).toBe('/languages/DUOLINGO_ES');
    expect(harness.routeNativeElement?.querySelector('#langTab')).not.toBeNull();
  });

  it('shouldKeepTheGameKeyWhenOpeningAGamesDeepLink', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/games/queens');
    expect(TestBed.inject(Router).url).toBe('/games/queens');
    expect(harness.routeNativeElement?.querySelector('#gamesTab')).not.toBeNull();
  });

  it('shouldRedirectToGamesWhenTheGameKeyIsUnknown', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/overview'); // the first navigation belongs to the legacy-URL guard; this one exercises the route itself
    await harness.navigateByUrl('/games/nope');
    expect(TestBed.inject(Router).url).toBe('/games');
  });

  it('shouldReuseTheGamesViewWhenMovingFromTheListToAReport', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/games');
    const before = harness.routeNativeElement;
    await harness.navigateByUrl('/games/queens');
    expect(harness.routeNativeElement).toBe(before); // the same component instance: the summary is not read again
  });

  it('shouldTitleTheRouteWithTheGameName', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/games/queens');
    expect(document.title).toBe('Queens · LinkedIn Games · Meridian');
    await harness.navigateByUrl('/games');
    expect(document.title).toBe('LinkedIn Games · Meridian');
  });

  // tests/dashboardRoutes shouldServeDashboardWhenRequestingTabPath /profile (client side): the path stays, the chess view opens.
  it('shouldKeepTheProfilePathAndOpenTheChessView', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/profile');
    expect(TestBed.inject(Router).url).toBe('/profile');
    expect(harness.routeNativeElement?.querySelector('#chessTab')).not.toBeNull();
    expect(harness.routeNativeElement?.querySelector('#chessEngineProfileDetails')).not.toBeNull();
  });
});
