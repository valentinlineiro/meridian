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

  describe('the back button with the sheet open', () => {
    // The History API is the browser boundary: its calls are what the system "back" is built on.
    afterEach(() => vi.restoreAllMocks());
    const entries = () => { const push = vi.spyOn(history, 'pushState'), back = vi.spyOn(history, 'back').mockImplementation(() => {}), replace = vi.spyOn(history, 'replaceState'); return { push, back, replace }; };

    it('shouldCloseTheSheetAndStayOnThePageWhenBackIsPressed', async () => {
      const el = await render('/chess');
      const h = entries();
      await press(el);
      expect(h.push).toHaveBeenCalledWith({ moreSheet: true }, '');
      window.dispatchEvent(new PopStateEvent('popstate'));
      await settle();
      expect(el.querySelector('.sheet')).toBeNull();
      expect(TestBed.inject(Router).url).toBe('/chess');
      expect(h.back).not.toHaveBeenCalled(); // the entry already went away: nothing more to drop
    });

    it('shouldDropItsHistoryEntryWhenTheSheetIsClosedWithEscape', async () => {
      const el = await render('/chess');
      const h = entries();
      await press(el);
      history.replaceState({ moreSheet: true }, ''); // the entry is on top, as pushState leaves it
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await settle();
      expect(el.querySelector('.sheet')).toBeNull();
      expect(h.back).toHaveBeenCalledTimes(1);
    });

    it('shouldReplaceTheSheetEntryInsteadOfAddingOneWhenALinkInItIsFollowed', async () => {
      const el = await render('/chess');
      const go = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
      await press(el);
      el.querySelector<HTMLAnchorElement>('.sheet a[href="/changes"]')!.click();
      await new Promise((r) => setTimeout(r, 30)); await settle();
      expect(go).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ replaceUrl: true }));
      expect(TestBed.inject(Router).url).toBe('/changes');
      expect(el.querySelector('.sheet')).toBeNull();
    });

    it('shouldReplaceTheSheetEntryWhenAnotherTabIsPressedWithTheSheetOpenButNotOtherwise', async () => {
      const el = await render('/chess');
      const go = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
      tabs(el)[0]!.click(); // sheet closed: a plain push
      await new Promise((r) => setTimeout(r, 30)); await settle();
      expect(go).toHaveBeenLastCalledWith(expect.anything(), expect.not.objectContaining({ replaceUrl: true }));
      await press(el);
      tabs(el)[1]!.click(); // sheet open: it replaces the sheet's entry
      await new Promise((r) => setTimeout(r, 30)); await settle();
      expect(go).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ replaceUrl: true }));
    });
  });
  describe('la hoja Más es un diálogo modal', () => {
    const sheetEl = (el: HTMLElement) => el.querySelector<HTMLElement>('#moreSheet')!;
    const key = (el: HTMLElement, k: string, shift = false) => sheetEl(el).dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey: shift, bubbles: true, cancelable: true }));
    const focusables = (el: HTMLElement) => [...sheetEl(el).querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];

    it('shouldDeclareItselfModal', async () => {
      const el = await render('/overview');
      await press(el);
      expect(sheetEl(el).getAttribute('aria-modal')).toBe('true');
      expect(sheetEl(el).getAttribute('role')).toBe('dialog');
    });
    it('shouldKeepTabInsideTheSheetWrappingFromLastToFirst', async () => {
      const el = await render('/overview');
      await press(el);
      const f = focusables(el);
      f[f.length - 1]!.focus();
      key(el, 'Tab');
      expect(document.activeElement).toBe(f[0]);
    });
    it('shouldKeepShiftTabInsideTheSheetWrappingFromFirstToLast', async () => {
      const el = await render('/overview');
      await press(el);
      const f = focusables(el);
      f[0]!.focus();
      key(el, 'Tab', true);
      expect(document.activeElement).toBe(f[f.length - 1]);
    });
    it('shouldListTheSecondaryPagesAsAListOfLinks', async () => {
      const el = await render('/overview');
      await press(el);
      const links = [...sheetEl(el).querySelectorAll('ul[aria-label="Resumen"] > li > a')];
      expect(links.map((a) => a.textContent!.trim())).toEqual(['Qué cambió', 'Trayectoria']);
    });
  });
});
