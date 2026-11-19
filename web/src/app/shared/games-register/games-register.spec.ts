import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GamesRegister } from './games-register';
import { localToday } from '../../core/format';

const URL = '/api/me/linkedin-games/day';
const answer = (o: Record<string, unknown> = {}) => ({ ok: true, games: [{ game: 'zip', score: '0:48', avg: null, status: 'new' }], removed: [], ...o });

describe('GamesRegister', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<GamesRegister>;
  let el: HTMLElement;
  let saved: string[];
  const tick = async () => { TestBed.tick(); await new Promise((r) => setTimeout(r)); TestBed.tick(); };
  const input = (game: string, field: 'score' | 'avg') => el.querySelector<HTMLInputElement>(`#lgReg-${game}-${field}`)!;
  const fill = async (game: string, field: 'score' | 'avg', v: string) => { if (field === 'avg' && !input(game, field)) { el.querySelector<HTMLElement>(`#lgReg-${game}-addavg`)!.click(); await tick(); } input(game, field).value = v; input(game, field).dispatchEvent(new Event('input')); await tick(); };
  const save = () => el.querySelector<HTMLButtonElement>('#lgRegSave')!;
  /** What the submit button (or Enter in a field) does in a browser; jsdom does not submit on click. */
  const submit = () => el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  const open = async (day: Record<string, { score?: string | null; avg?: string | null }> | null = {}) => {
    fixture.componentRef.setInput('day', day);
    fixture.componentInstance.open();
    await tick();
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(GamesRegister);
    saved = [];
    fixture.componentInstance.saved.subscribe((n) => saved.push(n));
    sessionStorage.clear();
    el = fixture.nativeElement;
    await tick();
  });
  afterEach(() => http.verify());
  const isOpen = () => el.querySelector('dialog')!.hasAttribute('open');
  const click = async (sel: string) => { el.querySelector<HTMLElement>(sel)!.click(); await tick(); };

  it('shouldListTheSixGamesWithYourTimeAndTheLinkedinAverageEach', async () => {
    await open();
    const rows = [...el.querySelectorAll('#lgRegRows [data-game]')];
    expect(rows.map((r) => r.getAttribute('data-game'))).toEqual(['zip', 'tango', 'queens', 'mini_sudoku', 'patches', 'wend']);
    for (const r of rows) { expect(r.querySelectorAll('input')).toHaveLength(1); expect(r.querySelector('.lgreg-addavg')).not.toBeNull(); } // the average is asked for, not shown six times
    expect(el.querySelector('#lgReg-zip-score')!.getAttribute('aria-label')).toBe('Zip: tu tiempo');
    expect(el.querySelector('#lgReg-zip-addavg')!.getAttribute('aria-label')).toBe('Añadir la media de LinkedIn de Zip');
    el.querySelector<HTMLElement>('#lgReg-zip-addavg')!.click();
    await tick();
    expect(el.querySelector('#lgReg-zip-avg')!.getAttribute('aria-label')).toBe('Zip: media de LinkedIn');
    expect(input('zip', 'score').getAttribute('aria-describedby')).toBe('lgRegHelp');
  });

  it('shouldOpenTheDialogAndFillTheFieldsFromTodaysRecord', async () => {
    await open({ zip: { score: '0:48', avg: '0:53' }, queens: { score: '1:12', avg: null } });
    expect(isOpen()).toBe(true);
    expect([input('zip', 'score').value, input('zip', 'avg').value, input('queens', 'score').value]).toEqual(['0:48', '0:53', '1:12']);
    expect(input('queens', 'avg')).toBeNull(); // no stored average: asked for with "+ Media"
    expect(input('tango', 'score').value).toBe('');
  });

  it('shouldFocusTheFirstEmptyTimeWhenOpening', async () => {
    await open({ zip: { score: '0:48', avg: null } });
    expect(document.activeElement).toBe(input('tango', 'score'));
  });

  it('shouldShowWhatWillBeStoredWhileTyping', async () => {
    await open();
    await fill('zip', 'score', '106');
    expect(input('zip', 'score').value).toBe('1:06');
    await fill('zip', 'score', '1:06');
    expect(input('zip', 'score').value).toBe('1:06');
  });

  it('shouldNotSaveWhileNothingIsFilledAndSayWhy', async () => {
    await open();
    expect(save().disabled).toBe(true);
    expect(el.querySelector('#lgRegSaveHint')!.textContent).toContain('Escribe al menos un tiempo.');
  });

  it('shouldSendOnlyTheFilledGamesWithTheirAverageToTheDaySave', async () => {
    await open();
    await fill('queens', 'score', '112'); await fill('queens', 'avg', '105'); await fill('zip', 'score', '48');
    submit();
    const r = http.expectOne(URL);
    expect(r.request.method).toBe('PUT');
    expect(r.request.body).toMatchObject({ date: localToday(), set: [{ game: 'zip', score: '0:48' }, { game: 'queens', score: '1:12', avg: '1:05' }], remove: [] });
    r.flush(answer());
    await tick();
  });

  it('shouldCloseAndReportWhatWasSavedAndRemoved', async () => {
    await open({ tango: { score: '1:02', avg: null } });
    await fill('zip', 'score', '48'); await fill('tango', 'score', '');
    expect(el.querySelector('[data-game="tango"]')!.textContent).toContain('Se quitará al guardar');
    submit();
    const r = http.expectOne(URL);
    expect(r.request.body).toMatchObject({ set: [{ game: 'zip', score: '0:48' }], remove: ['tango'] });
    r.flush(answer({ removed: ['tango'] }));
    await tick();
    expect(saved).toEqual(['Guardado: Zip 0:48. Quitado: Tango.']);
    expect(isOpen()).toBe(false);
  });

  it('shouldUndoARemovalBeforeSavingAndKeepTheStoredValues', async () => {
    await open({ tango: { score: '1:02', avg: '1:30' } });
    await fill('tango', 'score', '');
    await click('[data-game="tango"] button');
    expect([input('tango', 'score').value, input('tango', 'avg').value]).toEqual(['1:02', '1:30']);
    expect(el.querySelector('#lgRegMsg')!.textContent).toBe('Tango: se mantiene');
    expect(el.querySelector('[data-game="tango"] button')).toBeNull();
  });

  it('shouldClearAStoredAverageWhenItsFieldIsEmptied', async () => {
    await open({ zip: { score: '0:48', avg: '0:53' } });
    await fill('zip', 'avg', '');
    submit();
    const r = http.expectOne(URL);
    expect(r.request.body.set).toEqual([{ game: 'zip', score: '0:48', avg: null }]);
    r.flush(answer());
    await tick();
  });

  it('shouldPutAnErrorOnTheFieldAndNameTheGamesWhenAnAverageHasNoTime', async () => {
    await open();
    await fill('queens', 'avg', '105'); await fill('zip', 'score', '75');
    submit();
    await tick();
    expect(el.querySelector('[data-game="queens"] .lgreg-err')!.textContent).toBe('Falta tu tiempo. La media sola no se guarda.');
    expect(el.querySelector('[data-game="zip"] .lgreg-err')!.textContent).toContain('«0:75» no es un tiempo');
    expect(el.querySelector('#lgRegMsg')!.textContent).toBe('Revisa: Zip y Queens.');
    expect(input('zip', 'score').getAttribute('aria-invalid')).toBe('true');
    expect(input('zip', 'score').getAttribute('aria-describedby')).toBe('lgReg-zip-err lgRegHelp');
    expect(isOpen()).toBe(true);
  });

  it('shouldUseTheSheetsOwnSentenceForTheFieldTheServerRejects', async () => {
    await open();
    await fill('zip', 'score', '48');
    submit();
    http.expectOne(URL).flush({ ok: false, errors: [{ game: 'zip', field: 'score', reason: 'x' }] }, { status: 422, statusText: 'x' });
    await tick();
    expect(el.querySelector('[data-game="zip"] .lgreg-err')!.textContent).toContain('«0:48» no es un tiempo');
    expect(saved).toEqual([]);
    expect(isOpen()).toBe(true);
  });

  it('shouldSayNothingChangedWhenEveryRowIsAlreadyStored', async () => {
    await open({ zip: { score: '0:48', avg: null } });
    submit();
    http.expectOne(URL).flush(answer({ games: [{ game: 'zip', score: '0:48', avg: null, status: 'same' }] }));
    await tick();
    expect(el.querySelector('#lgRegMsg')!.textContent).toContain('Sin cambios');
    expect(saved).toEqual([]);
  });

  it.each([
    ['no answer', { status: 0 }, true, 'No sabemos si se guardó'],
    ['a server error', { status: 500 }, true, 'No pudimos guardar'],
    ['no connection', { status: 0 }, false, 'Sin conexión'],
  ])('shouldKeepTheTimesAndSayWhatHappenedWhen%s', async (_n, res, online, text) => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
    await open();
    await fill('zip', 'score', '48');
    submit();
    const r = http.expectOne(URL);
    if (res.status === 0) r.error(new ProgressEvent('error')); else r.flush({ ok: false }, { status: res.status, statusText: 'x' });
    await tick();
    expect(el.querySelector('#lgRegMsg')!.textContent).toContain(text);
    expect(input('zip', 'score').value).toBe('0:48');
    expect(save().disabled).toBe(false); // can try again
    vi.restoreAllMocks();
  });

  it('shouldAskBeforeDiscardingEditsAndNameTheGames', async () => {
    await open();
    await fill('zip', 'score', '48'); await fill('queens', 'score', '112');
    await click('.lgreg-head button');
    expect(isOpen()).toBe(true);
    expect(el.querySelector('#lgRegDiscard')!.textContent).toContain('Tienes cambios sin guardar: Zip y Queens.');
    await click('#lgRegKeep');
    expect(el.querySelector('#lgRegDiscard')).toBeNull();
    expect(input('zip', 'score').value).toBe('0:48');
  });

  it('shouldCloseWithoutAskingWhenNothingWasEdited', async () => {
    await open({ zip: { score: '0:48', avg: null } });
    await click('.lgreg-head button');
    expect(isOpen()).toBe(false);
  });

  it('shouldKeepTheDraftWhenTheSheetIsLostAndRestoreItOnTheNextOpen', async () => {
    await open();
    await fill('zip', 'score', '48');
    expect(sessionStorage.getItem('meridian.gamesRegisterDraft')).toContain('0:48');
    expect(GamesRegister.hasDraft()).toBe(true);
    await open(); // a reload: the sheet is built again and opened
    expect(input('zip', 'score').value).toBe('0:48');
    expect(el.querySelector('#lgRegRestored')!.textContent).toContain('Recuperamos');
    await fill('zip', 'score', '49');
    expect(el.querySelector('#lgRegRestored')).toBeNull();
  });

  it('shouldFlagAnImpossibleTimeWhenTheFieldIsLeftNotOnlyOnSave', async () => {
    await open();
    await fill('zip', 'score', '999');
    expect(el.querySelector('#lgReg-zip-err')).toBeNull();
    input('zip', 'score').dispatchEvent(new Event('blur'));
    await tick();
    expect(el.querySelector('#lgReg-zip-err')!.textContent).toContain('no es un tiempo');
    expect(input('zip', 'score').getAttribute('aria-invalid')).toBe('true');
  });

  it('shouldDisableGuardarAndSayWhatToDoWhileAFieldIsMarkedInvalid', async () => {
    await open();
    await fill('zip', 'score', '999');
    input('zip', 'score').dispatchEvent(new Event('blur'));
    await tick();
    expect(save().disabled).toBe(true);
    expect(save().textContent).toContain('Corrige Zip');
    await fill('zip', 'score', '48');
    expect(save().disabled).toBe(false);
    expect(save().textContent).toContain('Guardar');
  });

  it('shouldNameAndMarkTheGameWhenTheSheetIsOpenedOnARow', async () => {
    fixture.componentRef.setInput('day', {});
    fixture.componentInstance.open('zip');
    await tick();
    expect(el.querySelector('#lgRegTitle')!.textContent).toContain('Zip · hoy');
    expect(el.querySelector('[data-game="zip"]')!.classList.contains('lgreg-focus')).toBe(true);
    expect(el.querySelector('[data-game="tango"]')!.classList.contains('lgreg-focus')).toBe(false);
  });

  it('shouldClearTheDraftOnDiscardAndOnSave', async () => {
    await open();
    await fill('zip', 'score', '48');
    await click('.lgreg-head button');
    await click('#lgRegDrop');
    expect(GamesRegister.hasDraft()).toBe(false);
    expect(isOpen()).toBe(false);
  });

  it('shouldAskWhichDayWhenMidnightPassedWhileTheSheetWasOpen', async () => {
    await open();
    await fill('zip', 'score', '48');
    const opened = localToday();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${opened}T12:00:00`).getTime() + 86_400_000);
    submit();
    vi.useRealTimers();
    await tick();
    expect(el.querySelector('#lgRegMidnight')!.textContent).toMatch(/^Ya es .*\.Guardar en .*Guardar en /);
    expect(http.match(URL)).toHaveLength(0);
    await click('#lgRegMidnight .btn-g'); // keep the day it was opened on
    const r = http.expectOne(URL);
    expect(r.request.body.date).toBe(opened);
    r.flush(answer());
    await tick();
  });

  it('shouldOfferToReadAgainWhenTheStoredDayCouldNotBeRead', async () => {
    await open(null);
    expect(el.querySelector('#lgRegUnread')!.textContent).toContain('No pudimos leer lo guardado de hoy');
  });

  it('shouldFillTheEmptyRowsWhenTheStoredDayIsReadAgainWhileOpenWithoutTouchingWhatWasTyped', async () => {
    await open(null);
    await fill('queens', 'score', '112');
    fixture.componentRef.setInput('day', { zip: { score: '0:48', avg: '0:53' }, queens: { score: '2:00', avg: null } });
    await tick();
    expect([input('zip', 'score').value, input('zip', 'avg').value, input('queens', 'score').value]).toEqual(['0:48', '0:53', '1:12']);
    expect(el.querySelector('#lgRegUnread')).toBeNull();
  });

  it('shouldKeepThePasteOfTextAndTablesFoldedUnderMoreOptions', async () => {
    await open();
    const more = el.querySelector<HTMLDetailsElement>('#lgRegMore')!;
    expect(more.open).toBe(false);
    expect(more.querySelector('app-games-quick-entry')).not.toBeNull();
  });
});
