import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GamesRegister } from './games-register';
import { localToday } from './games.model';

const URL = '/api/me/linkedin-games/import';
const answer = (o: Record<string, unknown>) => ({ ok: true, applied: true, errors: [], days: [{ date: localToday(), games: [{ game: 'zip', score: '0:48', avg: null, status: 'new' }] }], ...o });

describe('GamesRegister', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<GamesRegister>;
  let el: HTMLElement;
  let saved: number;
  const tick = async () => { TestBed.tick(); await new Promise((r) => setTimeout(r)); TestBed.tick(); };
  const input = (game: string, field: 'score' | 'avg') => el.querySelector<HTMLInputElement>(`#lgReg-${game}-${field}`)!;
  const fill = async (game: string, field: 'score' | 'avg', v: string) => { input(game, field).value = v; input(game, field).dispatchEvent(new Event('input')); await tick(); };
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
    saved = 0;
    fixture.componentInstance.saved.subscribe(() => saved++);
    el = fixture.nativeElement;
    await tick();
  });
  afterEach(() => http.verify());

  it('shouldListTheSixGamesWithYourTimeAndTheLinkedinAverageEach', async () => {
    await open();
    const rows = [...el.querySelectorAll('#lgRegRows [data-game]')];
    expect(rows.map((r) => r.getAttribute('data-game'))).toEqual(['zip', 'tango', 'queens', 'mini_sudoku', 'patches', 'wend']);
    for (const r of rows) expect(r.querySelectorAll('input')).toHaveLength(2);
    expect(el.querySelector('#lgReg-zip-score')!.getAttribute('aria-label')).toBe('Zip: tu tiempo');
    expect(el.querySelector('#lgReg-zip-avg')!.getAttribute('aria-label')).toBe('Zip: media de LinkedIn');
  });

  it('shouldOpenTheDialogAndFillTheFieldsFromTodaysRecord', async () => {
    await open({ zip: { score: '0:48', avg: '0:53' }, queens: { score: '1:12', avg: null } });
    expect(el.querySelector('dialog')!.hasAttribute('open')).toBe(true);
    expect([input('zip', 'score').value, input('zip', 'avg').value, input('queens', 'score').value, input('queens', 'avg').value]).toEqual(['0:48', '0:53', '1:12', '']);
    expect(input('tango', 'score').value).toBe('');
  });

  it('shouldNotSaveWhileNothingIsFilled', async () => {
    await open();
    expect(save().disabled).toBe(true);
  });

  it('shouldSendOneLinePerFilledGameWithItsAverageWhenSaving', async () => {
    await open();
    await fill('queens', 'score', '1:12'); await fill('queens', 'avg', '1:05'); await fill('zip', 'score', '48');
    submit();
    const r = http.expectOne(URL);
    expect(r.request.body).toMatchObject({ text: 'zip, 48\nqueens, 1:12, 1:05', apply: true, today: localToday() });
    r.flush(answer({}));
    await tick();
  });

  it('shouldOmitTheAverageWhenItIsEmptyAndSkipTheEmptyRows', async () => {
    await open();
    await fill('tango', 'score', '0:52');
    submit();
    const r = http.expectOne(URL);
    expect(r.request.body.text).toBe('tango, 0:52');
    r.flush(answer({}));
    await tick();
  });

  it('shouldCloseTheDialogAndSayTheDayWasSavedWhenTheServerApplied', async () => {
    await open();
    await fill('zip', 'score', '0:48');
    submit();
    http.expectOne(URL).flush(answer({}));
    await tick();
    expect(saved).toBe(1);
    expect(el.querySelector('dialog')!.hasAttribute('open')).toBe(false);
  });

  it('shouldShowTheServersReasonOnTheRowThatFailedAndKeepTheDialogOpen', async () => {
    await open();
    await fill('zip', 'score', '0:48'); await fill('queens', 'score', 'abc');
    submit();
    http.expectOne(URL).flush(answer({ ok: false, applied: false, errors: [{ line: 2, text: 'Q, abc', reason: 'mis segundos no válidos («abc»)' }] }));
    await tick();
    expect(el.querySelector('[data-game="queens"] .lgreg-err')!.textContent).toContain('mis segundos no válidos');
    expect(el.querySelector('[data-game="zip"] .lgreg-err')).toBeNull();
    expect(saved).toBe(0);
    expect(el.querySelector('dialog')!.hasAttribute('open')).toBe(true);
  });

  it('shouldSayNothingChangedWhenEveryRowIsAlreadyStored', async () => {
    await open({ zip: { score: '0:48', avg: null } });
    await fill('zip', 'score', '0:48');
    submit();
    http.expectOne(URL).flush(answer({ days: [{ date: localToday(), games: [{ game: 'zip', score: '0:48', avg: null, status: 'same' }] }] }));
    await tick();
    expect(el.querySelector('#lgRegMsg')!.textContent).toContain('Sin cambios');
    expect(saved).toBe(0);
  });

  it('shouldSayItCouldNotSaveWhenTheRequestFails', async () => {
    await open();
    await fill('zip', 'score', '0:48');
    submit();
    http.expectOne(URL).flush({ ok: false }, { status: 500, statusText: 'x' });
    await tick();
    expect(el.querySelector('#lgRegMsg')!.textContent).toContain('No se pudo guardar');
    expect(save().disabled).toBe(false); // can try again
  });

  it('shouldKeepThePasteOfTextAndTablesFoldedUnderMoreOptions', async () => {
    await open();
    const more = el.querySelector<HTMLDetailsElement>('#lgRegMore')!;
    expect(more.open).toBe(false);
    expect(more.querySelector('app-games-quick-entry')).not.toBeNull();
  });
});
