import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../app.routes';
import { BROWSER_LOCATION } from './api-client';
import { legacyRedirect } from './legacy-url';

describe('legacyRedirect', () => {
  it.each([
    ['/', '#/languages/DUOLINGO_ES', '', '/languages/DUOLINGO_ES'],
    ['/', '#/chess', '', '/chess'],
    ['/', '#games', '', '/games'],
    ['/', '#languages', '?course=DUOLINGO_XC_ES', '/languages/DUOLINGO_XC_ES'],
    ['/', '#/unknown/route', '', '/overview'],
    ['/DUOLINGO_ES', '', '', '/languages/DUOLINGO_ES'],
    ['/languages/A B', '#', '', '/languages/A%20B'],
    // the rest of tests/canonicalRouting.test.ts (legacy parseCanonicalRoute)
    ['/', '#', '', '/overview'],
    ['/', '#/overview', '', '/overview'],
    ['/', '#overview', '', '/overview'],
    ['/', '#/languages', '', '/languages'],
    ['/', '#languages', '', '/languages'],
    ['/', '#languages/DUOLINGO_XA_ES', '', '/languages/DUOLINGO_XA_ES'],
    ['/', '#/languages/DUOLINGO_XB_EN', '', '/languages/DUOLINGO_XB_EN'],
    ['/', '#chess', '', '/chess'],
    ['/', '#/games', '', '/games'],
    ['/', '#/games/queens', '', '/games/queens'],
    ['/', '#games/mini_sudoku', '', '/games/mini_sudoku'],
    ['/games/nope', '', '', '/games'],
    ['/games/queens/extra', '', '', '/games'],
  ])('shouldRedirectHashRouteToCanonicalPath %s %s %s', (path, hash, search, expected) => {
    expect(legacyRedirect(path, hash, search)).toBe(expected);
  });

  it('shouldRedirectCourseQueryToPath', () => {
    expect(legacyRedirect('/languages', '', '?course=X')).toBe('/languages/X');
    expect(legacyRedirect('/', '', '?course=X')).toBe('/overview');
  });

  it.each([['/'], ['/overview'], ['/languages'], ['/languages/DUOLINGO_ES'], ['/trajectory'], ['/settings'], ['/games'], ['/games/queens'], ['/games/mini_sudoku']])(
    'shouldNotRedirectWhenAlreadyCanonical %s',
    (path) => expect(legacyRedirect(path, '', '')).toBeNull(),
  );
});

describe('legacy URL at app start', () => {
  const start = async (hash: string, search: string, url: string) => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: BROWSER_LOCATION, useValue: { pathname: url, search, hash, href: '', reload: () => {} } }],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    return TestBed.inject(Router).url;
  };

  it('shouldRedirectHashUrlThroughTheRouterOnFirstNavigation', async () => {
    expect(await start('#/languages/DUOLINGO_ES', '', '/')).toBe('/languages/DUOLINGO_ES');
  });
  it('shouldRedirectCourseQueryThroughTheRouter', async () => {
    expect(await start('', '?course=DUOLINGO_ES', '/languages')).toBe('/languages/DUOLINGO_ES');
  });
  it('shouldLeaveCanonicalUrlAloneWhenThereIsNoLegacyPart', async () => {
    expect(await start('', '', '/chess')).toBe('/chess');
  });
  it('shouldKeepTheGameKeyOnAPageLoadOfAGameReport', async () => {
    expect(await start('', '', '/games/queens')).toBe('/games/queens');
  });
  it('shouldRedirectOnlyTheFirstNavigation', async () => {
    await start('#/chess', '', '/');
    await TestBed.inject(Router).navigateByUrl('/games');
    expect(TestBed.inject(Router).url).toBe('/games');
  });
});
