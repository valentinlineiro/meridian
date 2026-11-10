import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { routes } from '../app.routes';
import { BROWSER_LOCATION } from '../core/api-client';
import { TabBar } from './tab-bar';

describe('TabBar', () => {
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
    const fixture = TestBed.createComponent(TabBar);
    await TestBed.inject(Router).navigateByUrl(url);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };
  const settle = async () => { TestBed.tick(); await new Promise((r) => setTimeout(r)); TestBed.tick(); };
  const tabs = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('.tabbar .tab')];
  const more = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('.tabbar button.tab')!;
  const label = (e: HTMLElement) => e.textContent!.trim();
  const press = async (el: HTMLElement) => { more(el).click(); await settle(); };

  it('shouldShowTheFourSectionsAndMoreWhenRendered', async () => {
    const el = await render('/overview');
    expect(tabs(el).map(label)).toEqual(['Hoy', 'Ajedrez', 'Idiomas', 'Games', 'Más']);
    expect(tabs(el).slice(0, 4).map((t) => t.getAttribute('href'))).toEqual(['/overview', '/chess', '/languages', '/games']);
    expect(el.querySelector('nav')!.getAttribute('aria-label')).toBe('Secciones');
    expect(more(el).getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('.sheet')).toBeNull();
  });

  it.each([['/chess', 'Ajedrez'], ['/profile', 'Ajedrez'], ['/languages/DUOLINGO_ES', 'Idiomas'], ['/games/queens', 'Games'], ['/overview', 'Hoy']])(
    'shouldMarkTheCurrentSectionAsThePageWhen %s', async (url, name) => {
      const el = await render(url);
      const current = tabs(el).filter((t) => t.getAttribute('aria-current') === 'page');
      expect(current.map(label)).toEqual([name]);
      expect(tabs(el).filter((t) => t.classList.contains('active')).map(label)).toEqual([name]);
    });

  it.each(['/changes', '/trajectory', '/settings'])('shouldHighlightMoreWhenTheSectionIsSecondary %s', async (url) => {
    const el = await render(url);
    expect(tabs(el).filter((t) => t.classList.contains('active')).map(label)).toEqual(['Más']);
    expect(tabs(el).filter((t) => t.getAttribute('aria-current') === 'page')).toHaveLength(0);
  });

  it('shouldOpenTheSheetWithTheSecondaryItemsWhenMoreIsPressed', async () => {
    const el = await render('/chess');
    await press(el);
    expect(more(el).getAttribute('aria-expanded')).toBe('true');
    const sheet = el.querySelector('.sheet')!;
    expect(sheet.getAttribute('role')).toBe('dialog');
    const links = [...sheet.querySelectorAll('a')];
    expect(links.map((a) => [label(a), a.getAttribute('href')])).toEqual([['Qué cambió', '/changes'], ['Trayectoria', '/trajectory'], ['Configuración', '/settings']]);
    expect(sheet.querySelector('form[method="post"][action="/logout"] button[type="submit"]')!.textContent!.trim()).toBe('Salir');
    expect(sheet.querySelector('#tabSyncBtn')!.textContent!.trim()).toBe('Sincronizar');
  });

  it('shouldHighlightOnlyMoreWhileTheSheetIsOpenButKeepTheCurrentPageForAssistiveTechnology', async () => {
    const el = await render('/chess');
    await press(el);
    expect(tabs(el).filter((t) => t.classList.contains('active')).map(label)).toEqual(['Más']);
    expect(tabs(el).find((t) => label(t) === 'Ajedrez')!.getAttribute('aria-current')).toBe('page');
  });

  it('shouldCloseTheSheetWhenEscapeIsPressedAndReturnFocusToMore', async () => {
    const el = await render('/chess');
    await press(el);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(el.querySelector('.sheet')).toBeNull();
    expect(more(el).getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(more(el));
  });

  it('shouldCloseTheSheetWhenTheScrimIsPressed', async () => {
    const el = await render('/chess');
    await press(el);
    el.querySelector<HTMLButtonElement>('.scrim')!.click();
    await settle();
    expect(el.querySelector('.sheet')).toBeNull();
  });

  it('shouldCloseTheSheetWhenAnItemNavigates', async () => {
    const el = await render('/chess');
    await press(el);
    await TestBed.inject(Router).navigateByUrl('/trajectory');
    await settle();
    expect(el.querySelector('.sheet')).toBeNull();
    expect(tabs(el).filter((t) => t.classList.contains('active')).map(label)).toEqual(['Más']); // Trayectoria lives under Más
  });

  it('shouldFocusTheFirstItemWhenTheSheetOpens', async () => {
    const el = await render('/overview');
    await press(el);
    await settle();
    expect(document.activeElement).toBe(el.querySelector('.sheet a'));
  });

  it('shouldKeepTheSyncStateAndScopeInTheSheet', async () => {
    const el = await render('/overview');
    await press(el);
    const btn = el.querySelector<HTMLButtonElement>('#tabSyncBtn')!;
    expect(btn.getAttribute('aria-describedby')).toBe('tabSyncHint');
    expect(el.querySelector('#tabSyncHint')!.textContent).toMatch(/Duolingo[\s\S]*manual/);
    expect(btn.disabled).toBe(false);
    btn.click();
    TestBed.tick();
    TestBed.inject(HttpTestingController).expectOne('/api/me/sync');
    expect(btn.disabled).toBe(true);
    expect(btn.textContent!.trim()).toBe('Iniciando…');
  });
});
