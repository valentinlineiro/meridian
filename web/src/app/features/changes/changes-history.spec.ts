import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { routes } from '../../app.routes';
import { Changes } from './changes';

// Trayectoria is the "Todo el historial" period of Qué cambió: one view, one selector, the period in the URL.
const quiet = { interval: { since: '2026-10-01T00:00:00.000Z', until: '2026-10-08T00:00:00.000Z' }, chess: { gamesCount: 0 }, languages: { xpGained: 0, sessionsCount: 0 }, streak: {}, findings: [], evaluations: [] };
const history = { findings: [], evaluations: [], temporalSpan: null };

describe('Changes: the whole history is a period', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<Changes>;
  let el: HTMLElement;
  let asked: string[];

  const tick = async () => { TestBed.tick(); await new Promise((r) => setTimeout(r)); TestBed.tick(); };
  const pending = (): TestRequest[] => http.match(() => true).filter((r) => !r.cancelled);
  const serve = async () => {
    await tick();
    for (let i = 0; i < 10; i++) {
      const p = pending();
      if (!p.length) return;
      for (const r of p) {
        asked.push(r.request.url);
        r.flush(r.request.url === '/api/trajectory' ? history : r.request.url === '/api/what-changed' ? quiet : r.request.url === '/api/languages' ? { courses: [] } : { ok: true, seenThrough: null });
      }
      await tick();
    }
  };
  const open = async (w?: string) => {
    fixture = TestBed.createComponent(Changes);
    if (w) fixture.componentRef.setInput('w', w);
    el = fixture.nativeElement;
    await serve();
  };
  const buttons = () => [...el.querySelectorAll<HTMLButtonElement>('#changesHeader app-segmented button')];
  const pick = async (label: string) => { asked = []; buttons().find((b) => b.textContent!.trim() === label)!.click(); await serve(); };
  const pressed = () => buttons().filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent!.trim());

  beforeEach(() => {
    asked = [];
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('shouldOfferTheWholeHistoryNextToTheOtherPeriods', async () => {
    await open();
    expect(buttons().map((b) => b.textContent!.trim())).toEqual(['Últimos 7 días', 'Últimos 30 días', 'Desde última visita', 'Todo el historial']);
  });

  it('shouldShowTheTrajectoryAndNotAskWhatChangedWhenTheHistoryIsPicked', async () => {
    await open();
    await pick('Todo el historial');
    expect(asked).toEqual(['/api/trajectory']);
    expect(pressed()).toEqual(['Todo el historial']);
    expect(el.querySelector('#trajectoryTab')).not.toBeNull();
    expect(el.querySelector('#changesFindings')).toBeNull();
    expect(el.querySelector('#btnMarkSeen')).toBeNull(); // what the history shows is not "unseen changes"
    expect(el.querySelector('#changesHeader')!.textContent).toContain('Patrones estables a lo largo de todo tu historial');
  });

  it('shouldHaveASingleH1WhateverThePeriod', async () => {
    await open('historial');
    expect(el.querySelectorAll('h1')).toHaveLength(1);
    await pick('Últimos 7 días');
    expect(el.querySelectorAll('h1')).toHaveLength(1);
  });

  it('shouldOpenOnTheHistoryWhenTheUrlSaysSoWithoutReadingTheVisitAnchor', async () => {
    await open('historial');
    expect(asked).toEqual(['/api/trajectory']);
    expect(pressed()).toEqual(['Todo el historial']);
  });

  it('shouldOpenOnTheChosenWindowWhenTheUrlNamesIt', async () => {
    await open('30');
    expect(pressed()).toEqual(['Últimos 30 días']);
    expect(asked).not.toContain('/api/trajectory');
  });

  it('shouldGoBackToAWindowAndAskWhatChangedAgain', async () => {
    await open('historial');
    await pick('Últimos 7 días');
    expect(asked).toContain('/api/what-changed');
    expect(el.querySelector('#trajectoryTab')).toBeNull();
  });

  it('shouldPutThePeriodInTheUrlAndDropItForTheDefaultVisitWindow', async () => {
    await open();
    const url = () => TestBed.inject(Router).url;
    await pick('Últimos 7 días'); await new Promise((r) => setTimeout(r));
    expect(url()).toContain('w=7');
    await pick('Todo el historial'); await new Promise((r) => setTimeout(r));
    expect(url()).toContain('w=historial');
    await pick('Desde última visita'); await new Promise((r) => setTimeout(r));
    expect(url()).not.toContain('w=');
  });

  it('shouldKeepOldTrajectoryLinksWorkingByOpeningTheHistory', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/trajectory');
    expect(router.url).toBe('/changes?w=historial');
  });
});
