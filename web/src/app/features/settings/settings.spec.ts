import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Settings } from './settings';

// Ports of tests/settingsPage.test.ts ("settings page: daily goal"); the "where the goal is edited" cases assert
// the legacy dashboard HTML and stay with the root tests.
const URL = '/api/me/settings';
const LOAD_ERR = 'No se pudo cargar la configuración.';

describe('Settings', () => {
  let http: HttpTestingController;
  const setup = (loadBody: object | string | null = { ok: true, dailyGoalXp: 80 }) => {
    const f = TestBed.createComponent(Settings);
    f.detectChanges();
    http.expectOne(URL).flush(loadBody);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    return {
      f, el,
      input: el.querySelector<HTMLInputElement>('#goalInput')!,
      save: el.querySelector<HTMLButtonElement>('#goalSave')!,
      status: () => el.querySelector('#goalStatus')!.textContent!.trim(),
      type: (v: string) => { const i = el.querySelector<HTMLInputElement>('#goalInput')!; i.value = v; i.dispatchEvent(new Event('input')); },
    };
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('shouldShowTheStoredGoalWhenThePageLoads', async () => {
    const s = setup();
    await s.f.whenStable();
    expect(s.input.value).toBe('80');
  });

  it('shouldLeaveTheFieldEmptyWhenNoGoalIsConfigured', async () => {
    const s = setup({ ok: true, dailyGoalXp: null });
    await s.f.whenStable();
    expect(s.input.value).toBe('');
  });

  it('shouldKeepTheLegacyMarkup', () => {
    const s = setup();
    expect(s.el.querySelector('h2')!.textContent).toBe('Objetivo diario');
    expect(s.input.type).toBe('number');
    expect(s.input.placeholder).toBe('sin objetivo');
    expect(s.input.min + s.input.max + s.input.step).toBe('1100001');
    expect(s.el.querySelector('#goalStatus')!.getAttribute('role')).toBe('status');
  });

  it('shouldSaveDailyGoalViaApi', () => {
    const s = setup();
    s.type('90');
    s.save.click(); s.f.detectChanges();
    expect(s.status()).toBe('Guardando…');
    const r = http.expectOne(URL);
    expect(r.request.method).toBe('PUT');
    expect(r.request.body).toEqual({ dailyGoalXp: 90 });
    r.flush({ ok: true, dailyGoalXp: 90 });
    s.f.detectChanges();
    expect(s.status()).toBe('Guardado.');
  });

  it('shouldSendNullWhenTheFieldIsEmptied', async () => {
    const s = setup({ ok: true, dailyGoalXp: null });
    s.type('');
    s.save.click(); s.f.detectChanges();
    const r = http.expectOne(URL);
    expect(r.request.body).toEqual({ dailyGoalXp: null });
    r.flush({ ok: true, dailyGoalXp: null });
    s.f.detectChanges();
    expect(s.status()).toBe('Objetivo eliminado.');
  });

  it('shouldShowTheServersValueAfterSaving', async () => {
    const s = setup();
    s.type('70');
    s.save.click(); s.f.detectChanges();
    http.expectOne(URL).flush({ ok: true, dailyGoalXp: 75 });
    s.f.detectChanges();
    await s.f.whenStable();
    expect(s.input.value).toBe('75');
  });

  it.each([['0'], ['-3'], ['2.5'], ['10001']])('shouldNotSendRequestWhenGoalIsOutOfRange %s', (raw) => {
    const s = setup();
    s.type(raw);
    s.save.click(); s.f.detectChanges();
    s.f.detectChanges();
    http.expectNone(URL);
    expect(s.status()).toBe('Introduce un entero entre 1 y 10000, o déjalo vacío.');
  });

  it('shouldNotTreatUnparsableTextAsNoGoal', () => {
    const s = setup();
    Object.defineProperty(s.input, 'validity', { value: { badInput: true } });
    s.type('');
    s.save.click(); s.f.detectChanges();
    http.expectNone(URL);
    expect(s.status()).toBe('Introduce un entero entre 1 y 10000, o déjalo vacío.');
  });

  it('shouldShowErrorWhenSaveFails', () => {
    const s = setup();
    s.type('60');
    s.save.click(); s.f.detectChanges();
    http.expectOne(URL).flush({ ok: false, error: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    s.f.detectChanges();
    expect(s.status()).toBe('No se pudo guardar: unauthorized');
    expect(s.input.value).toBe('60'); // the typed value stays
  });

  it('shouldShowTheStatusWhenTheServerAnswersWithoutOk', () => {
    const s = setup();
    s.type('60');
    s.save.click(); s.f.detectChanges();
    http.expectOne(URL).flush({ ok: false, error: 'bad' });
    s.f.detectChanges();
    expect(s.status()).toBe('No se pudo guardar: bad');
  });

  it('shouldSayCouldNotSaveWhenTheNetworkFails', () => {
    const s = setup();
    s.type('60');
    s.save.click(); s.f.detectChanges();
    http.expectOne(URL).error(new ProgressEvent('error'));
    s.f.detectChanges();
    expect(s.status()).toBe('No se pudo guardar.');
  });

  it('shouldNotSubmitTwiceWhileSaving', () => {
    const s = setup();
    s.type('60');
    s.save.click(); s.f.detectChanges();
    s.save.click(); s.f.detectChanges();
    s.f.detectChanges();
    expect(s.save.disabled).toBe(true);
    http.expectOne(URL).flush({ ok: true, dailyGoalXp: 60 }); // expectOne fails on a second PUT
  });

  it('shouldShowLoadErrorWhenSettingsRequestFails', () => {
    const f = TestBed.createComponent(Settings);
    f.detectChanges();
    http.expectOne(URL).flush('x', { status: 500, statusText: 'err' });
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('#goalStatus')!.textContent).toBe(LOAD_ERR);
    // the stored goal is unknown: an empty Save would silently delete it, so Save stays off
    expect(el.querySelector<HTMLButtonElement>('#goalSave')!.disabled).toBe(true);
  });

  it.each([[null], ['oops'], [{ dailyGoalXp: 'abc' }], [[]], [{ dailyGoalXp: {} }]])('shouldAcceptNonNumericBodyWithoutBreaking %j', async (body) => {
    const s = setup(body);
    await s.f.whenStable();
    expect(s.input.value).toBe('');
    expect(s.status()).toBe('');
  });

  it('shouldNotClobberWhatTheUserTypedWhenTheLoadAnswersLate', async () => {
    const f = TestBed.createComponent(Settings);
    f.detectChanges();
    const input = (f.nativeElement as HTMLElement).querySelector<HTMLInputElement>('#goalInput')!;
    input.value = '33';
    input.dispatchEvent(new Event('input'));
    http.expectOne(URL).flush({ ok: true, dailyGoalXp: 80 });
    f.detectChanges();
    await f.whenStable();
    expect(input.value).toBe('33');
  });
});
