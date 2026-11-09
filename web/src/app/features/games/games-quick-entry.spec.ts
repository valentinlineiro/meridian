import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GamesQuickEntry } from './games-quick-entry';
import { localToday } from './games.model';

const URL = '/api/me/linkedin-games/import';
const day = (games: { game: string; score: string; avg: string | null; status: string }[]) => ({ ok: true, applied: false, errors: [], days: [{ date: localToday(), games }] });
const zipNew = { game: 'zip', score: '0:06', avg: '0:12', status: 'new' };

describe('GamesQuickEntry', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<GamesQuickEntry>;
  let el: HTMLElement;
  let saved: number;
  const tick = async (ms = 0) => { TestBed.tick(); await new Promise((r) => setTimeout(r, ms)); TestBed.tick(); };
  const box = () => el.querySelector<HTMLTextAreaElement>('#lgQuickText')!;
  const save = () => el.querySelector<HTMLButtonElement>('#lgQuickSave')!;
  const preview = () => el.querySelector('#lgQuickPreview')!.textContent!.replace(/\s+/g, ' ').trim();
  const type = async (t: string) => { box().value = t; box().dispatchEvent(new Event('input')); await tick(300); };
  const key = (k: string, shiftKey = false) => { const e = new KeyboardEvent('keydown', { key: k, shiftKey, cancelable: true, bubbles: true }); box().dispatchEvent(e); return e; };

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(GamesQuickEntry);
    saved = 0;
    fixture.componentInstance.saved.subscribe(() => saved++);
    el = fixture.nativeElement;
    await tick();
  });
  afterEach(() => http.verify());

  it('shouldAskNothingWhileTheBoxIsEmpty', async () => {
    await tick(300);
    expect(save().disabled).toBe(true);
  });

  it('shouldPreviewEveryGameWithItsStatusAfterAShortPause', async () => {
    await type('Z, 6, 12');
    const r = http.expectOne(URL);
    expect(r.request.body).toMatchObject({ text: 'Z, 6, 12', today: localToday(), apply: false });
    r.flush(day([zipNew, { game: 'tango', score: '0:43', avg: null, status: 'same' }]));
    await tick();
    expect(preview()).toBe('Hoy: Zip 0:06 (media 0:12) · nuevo · Tango 0:43 · igual');
    expect(save().disabled).toBe(false);
  });

  it('shouldSaveOnEnterClearTheBoxAndTellThePageToRefresh', async () => {
    await type('Z, 6, 12');
    http.expectOne(URL).flush(day([zipNew]));
    await tick();
    const e = key('Enter');
    expect(e.defaultPrevented).toBe(true);
    const r = http.expectOne(URL);
    expect(r.request.body).toMatchObject({ text: 'Z, 6, 12', apply: true });
    r.flush({ ...day([zipNew]), applied: true });
    await tick();
    expect(box().value).toBe('');
    expect(preview()).toBe('Guardado: 1 juego.');
    expect(saved).toBe(1);
  });

  it('shouldShowThePreviewAgainWhenTypingTheNextGameAfterSaving', async () => {
    await type('Z, 6, 12');
    http.expectOne(URL).flush(day([zipNew]));
    await tick();
    key('Enter');
    http.expectOne(URL).flush({ ...day([zipNew]), applied: true });
    await tick();
    expect(preview()).toBe('Guardado: 1 juego.');
    await type('T, 43, 51');
    http.expectOne(URL).flush(day([{ game: 'tango', score: '0:43', avg: '0:51', status: 'new' }]));
    await tick();
    expect(preview()).toBe('Hoy: Tango 0:43 (media 0:51) · nuevo');
  });

  it('shouldAddALineInsteadOfSavingOnShiftEnter', async () => {
    await type('Z, 6, 12');
    http.expectOne(URL).flush(day([zipNew]));
    await tick();
    expect(key('Enter', true).defaultPrevented).toBe(false);
    expect(saved).toBe(0);
  });

  it('shouldListTheLineErrorsAndNotAllowSavingWhileThereIsOne', async () => {
    await type('Z, 6, 12\nhola');
    http.expectOne(URL).flush({ ok: true, applied: false, days: [], errors: [{ line: 2, text: 'hola', reason: 'no se entiende la línea' }] });
    await tick();
    expect(preview()).toBe('Línea 2: no se entiende la línea («hola»)');
    expect(save().disabled).toBe(true);
    key('Enter');
    http.expectNone(URL);
  });

  it('shouldNotAllowSavingWhenEverythingTheTextSaysIsAlreadyStored', async () => {
    await type('Z, 6, 12');
    http.expectOne(URL).flush(day([{ ...zipNew, status: 'same' }]));
    await tick();
    expect(preview()).toContain('igual');
    expect(save().disabled).toBe(true);
  });

  it('shouldSayItCouldNotCheckTheTextWhenThePreviewFails', async () => {
    await type('Z, 6, 12');
    http.expectOne(URL).flush('x', { status: 500, statusText: 'err' });
    await tick();
    expect(preview()).toContain('No se pudo comprobar el texto.');
    expect(save().disabled).toBe(true);
  });

  it('shouldKeepTheTextAndSayItCouldNotSaveWhenSavingFails', async () => {
    await type('Z, 6, 12');
    http.expectOne(URL).flush(day([zipNew]));
    await tick();
    save().click();
    http.expectOne(URL).flush('x', { status: 500, statusText: 'err' });
    await tick();
    expect(box().value).toBe('Z, 6, 12');
    expect(preview()).toBe('No se pudo guardar.');
    expect(saved).toBe(0);
  });
});
