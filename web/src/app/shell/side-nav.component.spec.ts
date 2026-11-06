import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { routes } from '../app.routes';
import { BROWSER_LOCATION } from '../core/api-client';
import { SideNav } from './side-nav.component';

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
    expect(el.querySelector('.side-toggle')?.textContent).toContain('Ajedrez');
    expect([...el.querySelectorAll('.side-group')].map((g) => g.textContent)).toEqual(['Resumen', 'Dominios', 'Cuenta']);
    expect(item(el, 'Configuración').getAttribute('href')).toBe('/settings');
    expect(el.querySelector('form[method="post"][action="/logout"] button[type="submit"]')?.textContent).toBe('Salir');
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
    expect(el.querySelector('.side-toggle')?.textContent).toContain('Ajedrez');
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

  it('shouldToggleTheMobileMenuWhenToggleIsPressed', async () => {
    const el = await render('/overview');
    const toggle = el.querySelector<HTMLButtonElement>('.side-toggle')!;
    toggle.click();
    TestBed.tick();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('.side-menu')?.classList).toContain('open');

    await TestBed.inject(Router).navigateByUrl('/games');
    TestBed.tick();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('.side-menu')?.classList).not.toContain('open');
  });
});
