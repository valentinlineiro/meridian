import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { routes } from '../app.routes';
import { BROWSER_LOCATION } from '../core/api-client';
import { Shell } from './shell';

const tick = () => new Promise<void>((f) => setTimeout(f, 20)); // lets afterNextRender and the router settle; HTTP stays pending on purpose

describe('Shell navigation basics', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting(), { provide: BROWSER_LOCATION, useValue: { pathname: '/', search: '', href: '', reload: () => {} } }],
    });
  });
  const open = async (url = '/overview') => {
    const fixture = TestBed.createComponent(Shell);
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    fixture.detectChanges();
    await tick();
    return { el: fixture.nativeElement as HTMLElement, router, fixture };
  };
  const go = async (r: Awaited<ReturnType<typeof open>>, url: string) => { await r.router.navigateByUrl(url); r.fixture.detectChanges(); await tick(); };

  it('shouldMakeTheBrandALinkToOverview', async () => {
    const { el } = await open('/chess');
    expect(el.querySelector('.brand a')!.getAttribute('href')).toBe('/overview');
  });

  it('shouldOfferAFirstSkipLinkThatMovesFocusToMainWithoutChangingTheUrl', async () => {
    const { el, router } = await open('/chess');
    const skip = el.querySelector<HTMLAnchorElement>('a.skip')!;
    expect(skip.textContent!.trim()).toBe('Saltar al contenido');
    expect(el.querySelector('header')!.compareDocumentPosition(skip) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy(); // before the header and both navs
    skip.click();
    expect(document.activeElement).toBe(el.querySelector('main#main'));
    expect(router.url).toBe('/chess');
  });

  it('shouldNotStealFocusOnTheFirstNavigation', async () => {
    await open('/chess');
    expect(document.activeElement === document.body || document.activeElement === null).toBe(true);
  });

  it('shouldMoveFocusToTheHeadingOfThePageWeArriveAt', async () => {
    const r = await open('/chess');
    await go(r, '/overview');
    expect(document.activeElement!.tagName).toBe('H1');
    expect(document.activeElement!.textContent).toBe('Hoy');
  });

  it('shouldLeaveFocusAloneWhenAFormControlHasIt', async () => {
    const r = await open('/chess');
    const select = document.createElement('select');
    r.el.appendChild(select);
    select.focus();
    await go(r, '/languages/DUOLINGO_ES');
    expect(document.activeElement).toBe(select);
  });
});
