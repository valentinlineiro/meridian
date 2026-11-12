import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { routes } from '../app.routes';
import { BROWSER_LOCATION } from '../core/api-client';
import { SideNav } from './side-nav';

describe('SideNav', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: BROWSER_LOCATION, useValue: { pathname: '/', search: '', href: '', reload: () => {} } },
      ],
    });
  });

  const render = async (url: string) => {
    const fixture = TestBed.createComponent(SideNav);
    await TestBed.inject(Router).navigateByUrl(url);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };
  const item = (el: HTMLElement, text: string) =>
    [...el.querySelectorAll<HTMLElement>('.side-item')].find((e) => e.textContent?.trim() === text)!;

  it('shouldMarkActiveSideItemWhenRouteMatches', async () => {
    const el = await render('/chess');
    expect(item(el, 'Ajedrez').classList).toContain('active');
    expect(item(el, 'Ajedrez').getAttribute('aria-current')).toBe('page');
    expect(item(el, 'Hoy').classList).not.toContain('active');
    expect([...el.querySelectorAll('.side-group')].map((g) => g.textContent)).toEqual(['Resumen', 'Dominios', 'Cuenta']);
    expect(item(el, 'Configuración').getAttribute('href')).toBe('/settings');
    expect(el.querySelector('form[method="post"][action="/logout"] button[type="submit"]')?.textContent).toBe('Salir');
  });

  it('shouldClarifySyncScopeAccessiblyAndKeepTheExportOutOfTheMenu', async () => { // tests/uxPhase0.test.ts
    const el = await render('/overview');
    const btn = el.querySelector('button[aria-describedby="syncScopeHint"]')!;
    expect(btn.getAttribute('title')).toMatch(/Duolingo[\s\S]*manual/);
    expect(el.querySelector('#syncScopeHint')!.textContent).toMatch(/Duolingo[\s\S]*manual/);
    expect(el.querySelector('a[href="/api/export/matches.csv"]')).toBeNull();
  });

  // tests/frontendWhatChanged.test.ts: shouldIncludeWhatChangedButtonInDashboardTabsWhenRendered + shouldActivateChangesTabWhenShowTabIsInvokedWithChanges
  it('shouldMarkQueCambioActiveWhenTheRouteIsChanges', async () => {
    const el = await render('/changes');
    expect(item(el, 'Qué cambió').getAttribute('href')).toBe('/changes');
    expect(item(el, 'Qué cambió').classList).toContain('active');
    expect(item(el, 'Hoy').classList).not.toContain('active');
  });

  // tests/navigation.test.ts shouldMarkTheCurrentViewForAssistiveTechnology + shouldKeepTheLegacyPathsOpeningTheSameViews,
  // uxPhase2 shouldPreserveProfileRouteNavigation…, uxPhase4 shouldKeepTheProfileRouteOpeningTheChessView…: /profile has no entry of its own.
  it('shouldMarkAjedrezActiveWhenTheRouteIsProfile', async () => {
    const el = await render('/profile');
    expect(item(el, 'Ajedrez').classList).toContain('active');
    expect(item(el, 'Ajedrez').getAttribute('aria-current')).toBe('page');
    expect(item(el, 'Hoy').classList).not.toContain('active');
    expect(item(el, 'Hoy').getAttribute('aria-current')).toBeNull();
    expect(el.querySelectorAll('.side-item.active')).toHaveLength(1);
  });

  it('shouldDisableSyncButtonWhileSyncing', async () => {
    const el = await render('/overview');
    const button = el.querySelector<HTMLButtonElement>('#syncBtn')!;
    expect(button.disabled).toBe(false);

    button.click();
    TestBed.tick();
    TestBed.inject(HttpTestingController).expectOne('/api/me/sync');
    expect(button.disabled).toBe(true);
    expect(button.textContent?.trim()).toBe('Iniciando…');
  });

  it('shouldNotHaveTheMobileDropdownAnymoreBecauseTheTabBarReplacesIt', async () => {
    const el = await render('/overview');
    expect(el.querySelector('.side-toggle')).toBeNull();
    expect(el.querySelector('.side-menu')).not.toBeNull(); // the desktop sidebar keeps its items
    expect(item(el, 'Hoy').getAttribute('href')).toBe('/overview');
  });
  it('shouldExposeEachGroupAsALabelledListSoAssistiveTechSaysItsNameAndCount', async () => {
    const el = await render('/chess');
    const lists = [...el.querySelectorAll('ul[aria-labelledby]')];
    expect(lists.map((u) => el.querySelector('#' + u.getAttribute('aria-labelledby'))!.textContent)).toEqual(['Resumen', 'Dominios']);
    expect(lists.map((u) => [...u.querySelectorAll(':scope > li > a')].map((a) => a.textContent!.trim()))).toEqual([['Hoy', 'Qué cambió'], ['Ajedrez', 'Idiomas', 'LinkedIn Games']]);
  });
});
