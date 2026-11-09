import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { MatchesService } from '../services/matches.service';
import { MatchesTable } from './matches-table';

// Ports of loadM/renderRows/setChip/onSearch/clearF (src/dashboard.client.js:1180–1196, 1366–1395, 1626–1663) and their tests:
// frontendNetwork (late matches page), frontendErrorIsNotZero (matches failure), frontendEscaping (matches table),
// chessDashboard (subtitle), chessDashboardThreats (missed filter), uxPhase2 (chip query params).
const row = (o: object = {}) => ({ match_id: 'm1', ply_count: 40, played_at: null, first_seen_at: '2026-10-05T00:00:00Z', opponent_name: 'Bot 8', opponent_type: 'bot',
  opponent_segment: 'neural', opponent_elo: null, user_color: 'white', result: 'win', end_condition: 'checkmate', mate_type_label: 'Mate del pasillo',
  opening_family: 'ruy_lopez', opening_family_label: 'Española', phase_key: 'endgame', reviewed: 1, ...o });

describe('MatchesTable', () => {
  let http: HttpTestingController;
  let el: HTMLElement;
  let svc: MatchesService;
  let fixture: ReturnType<typeof TestBed.createComponent<MatchesTable>>;

  const tick = async () => { TestBed.tick(); await new Promise((r) => setTimeout(r)); TestBed.tick(); };
  const pending = (): TestRequest[] => http.match((r) => r.url === '/api/matches').filter((r) => !r.cancelled);
  const params = (r: TestRequest): { [k: string]: string | null | undefined; offset?: string | null } => Object.fromEntries(r.request.params.keys().map((k) => [k, r.request.params.get(k)]));
  const answer = async (body: unknown = { rows: [row()], total: 1 }) => {
    const [r] = pending();
    if (body === 500) r.flush({ ok: false }, { status: 500, statusText: 'Internal Server Error' }); else r.flush(body as object);
    await tick();
    return r;
  };
  const text = (id: string) => el.querySelector('#' + id)!.textContent!.trim();
  const click = async (sel: string) => { el.querySelector<HTMLElement>(sel)!.click(); await tick(); };

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [MatchesService, provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    svc = TestBed.inject(MatchesService);
    fixture = TestBed.createComponent(MatchesTable);
    fixture.componentRef.setInput('openings', { white: [{ key: 'ruy_lopez', name: 'Española (Ruy López)' }], black: [{ key: 'sicilian', label: 'Siciliana' }] });
    el = fixture.nativeElement;
    await tick();
  });
  afterEach(() => vi.useRealTimers());

  it('shouldAskForTheTenMostRecentWhenCompact', async () => {
    expect(params(await answer())).toEqual({ limit: '10', offset: '0' });
    expect(el.querySelector('#matchFilters')).toBeNull();
    expect(el.querySelector('#matchPager')).toBeNull();
    expect(text('chessMatchesSubtitle')).toBe('Partidas recientes (1 mostradas)');
  });

  it('shouldRenderEachColumnAndEscapeThirdPartyStrings', async () => {
    const hostile = '<img src=x onerror=alert(1)>';
    await answer({ rows: [row({ opponent_name: hostile }), row({ match_id: null, ply_count: null, opponent_type: 'pvp', opponent_segment: 'unknown', user_color: 'black', result: 'loss', end_condition: 'disconnection', opening_family: 'unclassified', phase_key: 'unknown', reviewed: 0, opponent_elo: 1210 })], total: 2 });
    const [a, b] = [...el.querySelectorAll('#mb tr')];
    expect(el.querySelector('#mb img')).toBeNull();
    expect([...a.querySelectorAll('td')].map((td) => td.textContent!.trim())).toEqual([
      new Date('2026-10-05T00:00:00Z').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }), hostile + ' Neural', 'BotEspañolaFinal', '—', 'Blancas', 'Victoria', 'Mate · pasillo', '✓']);
    expect(a.className).toBe('gamerow');
    expect(a.getAttribute('role')).toBeNull();
    expect(a.querySelector('button.rowbtn')!.getAttribute('aria-label')).toContain('Ver partida vs ' + hostile);
    expect([...b.querySelectorAll('td')].map((td) => td.textContent!.trim())).toEqual([
      new Date('2026-10-05T00:00:00Z').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }), 'Bot 8', 'PvP', '1210', 'Negras', 'Derrota', 'Desconexión', '']);
    expect(b.className).toBe(''); // no stored moves: not a game the viewer can open
    expect(b.querySelector('button')).toBeNull();
    expect(b.querySelector('td[data-l="Resultado"] .pill-loss')).not.toBeNull();
  });

  it('shouldOpenTheGameWhenARowOrItsButtonIsClicked', async () => {
    await answer();
    await click('#mb tr.gamerow');
    expect(svc.openId()).toBe('m1');
    svc.openId.set(null);
    await click('#mb tr.gamerow button.rowbtn');
    expect(svc.openId()).toBe('m1');
  });

  it('shouldFilterMatchesByChipAndResetPage', async () => {
    await answer();
    await click('#btnAllMatches');
    await answer({ rows: [row()], total: 120 });
    await click('#next');
    expect(params(await answer({ rows: [row()], total: 120 })).offset).toBe('50');
    await click('[data-chip="color:white"]');
    expect(params(await answer())).toEqual({ limit: '50', offset: '0', color: 'white' });
    expect(svc.offset()).toBe(0);
    expect(el.querySelector('[data-chip="color:white"]')!.className).toBe('btn btn-p');
    expect(el.querySelector('[data-chip="color:"]')!.className).toBe('btn btn-g');
    await click('[data-chip="type:pvp"]');
    await click('[data-chip="result:loss"]');
    expect(params(await answer())).toEqual({ limit: '50', offset: '0', color: 'white', opponentType: 'pvp', result: 'loss' });
  });

  it('shouldFilterTheCompactListWhenAChipIsPressedBeforeExpanding', async () => {
    await answer();
    svc.setFilter('color', 'black');
    await tick();
    expect(params(await answer())).toEqual({ limit: '10', offset: '0', color: 'black' });
  });

  it('shouldPageBy50WhenNotCompact', async () => {
    await answer({ rows: [row()], total: 120 });
    await click('#btnAllMatches');
    expect(text('chessMatchesSubtitle')).toBe('Todas las partidas (50 por página)');
    expect(el.querySelector('#btnAllMatches')).toBeNull();
    expect(params(await answer({ rows: Array.from({ length: 50 }, (_, i) => row({ match_id: 'm' + i })), total: 120 }))).toEqual({ limit: '50', offset: '0' });
    expect(text('mc')).toBe('1–50 de 120');
    expect(el.querySelector<HTMLButtonElement>('#prev')!.disabled).toBe(true);
    await click('#next');
    expect(params(await answer({ rows: Array.from({ length: 50 }, (_, i) => row({ match_id: 'n' + i })), total: 120 })).offset).toBe('50');
    await click('#next');
    expect(params(await answer({ rows: Array.from({ length: 20 }, (_, i) => row({ match_id: 'p' + i })), total: 120 })).offset).toBe('100');
    expect(text('mc')).toBe('101–120 de 120');
    expect(el.querySelector<HTMLButtonElement>('#next')!.disabled).toBe(true);
    await click('#prev');
    expect(params(await answer({ rows: [row()], total: 120 })).offset).toBe('50');
  });

  it('shouldDebounceSearchBy300ms', async () => {
    await answer();
    await click('#btnAllMatches');
    await answer();
    vi.useFakeTimers();
    const q = el.querySelector<HTMLInputElement>('#q')!;
    for (const v of ['k', 'ka', 'kas ']) { q.value = v; q.dispatchEvent(new Event('input')); vi.advanceTimersByTime(100); }
    TestBed.tick();
    expect(pending()).toHaveLength(0);
    vi.advanceTimersByTime(199);
    TestBed.tick();
    expect(pending()).toHaveLength(0);
    vi.advanceTimersByTime(1);
    TestBed.tick();
    const reqs = pending();
    expect(reqs).toHaveLength(1);
    expect(params(reqs[0])).toEqual({ limit: '50', offset: '0', q: 'kas' });
  });

  it('shouldDropLateResponseWhenFilterChanged', async () => {
    await answer();
    await click('#btnAllMatches');
    const early = pending()[0];
    await click('[data-chip="result:win"]');
    expect(early.cancelled).toBe(true); // the earlier page can no longer answer into the table
    await answer({ rows: [row()], total: 3 });
    expect(text('mc')).toBe('1–1 de 3');
  });

  it('shouldSayTheMatchesCouldNotBeLoadedInsteadOfSinPartidasWhenTheRequestFails', async () => {
    await answer(500);
    expect(text('empty')).toBe('No se pudieron cargar las partidas.');
    await click('#btnAllMatches');
    await answer(500);
    expect(text('mc')).toBe('—');
    expect(el.querySelector<HTMLButtonElement>('#prev')!.disabled).toBe(true);
    expect(el.querySelector<HTMLButtonElement>('#next')!.disabled).toBe(true);
  });

  it('shouldSayThereAreNoGamesYetOrNoneWithThoseFilters', async () => {
    await answer({ rows: [], total: 0 });
    expect(text('empty')).toBe('Sin partidas todavía');
    expect(text('chessMatchesSubtitle')).toBe('Partidas recientes');
    await click('#btnAllMatches');
    await answer({ rows: [], total: 0 });
    expect(text('empty')).toBe('Sin partidas con esos filtros');
    expect(text('mc')).toBe('0 partidas');
  });

  it('shouldSendEverySelectAndTheTypedEloWithTheNextLoad', async () => {
    await answer();
    await click('#btnAllMatches');
    await answer();
    const set = (id: string, v: string, ev: string) => { const x = el.querySelector<HTMLInputElement | HTMLSelectElement>('#' + id)!; x.value = v; x.dispatchEvent(new Event(ev)); };
    set('fMin', '800', 'input');
    set('fMax', '1200', 'input');
    await tick();
    expect(pending()).toHaveLength(0); // typing a bound does not load
    set('fOpp', 'seg:stockfish', 'change');
    await tick();
    expect(params(await answer())).toEqual({ limit: '50', offset: '0', opponentSegment: 'stockfish', minOpponentElo: '800', maxOpponentElo: '1200' });
    set('fEnd', 'checkmate', 'change'); await tick(); await answer();
    set('fPhase', 'endgame', 'change'); await tick(); await answer();
    set('fOpening', 'sicilian', 'change'); await tick();
    expect(params(await answer())).toMatchObject({ endCondition: 'checkmate', phase: 'endgame', opening: 'sicilian' });
    await click('[data-chip="type:bot"]'); // the type chip replaces the rival select
    expect(params(await answer())).toMatchObject({ opponentType: 'bot' });
    expect(el.querySelector<HTMLSelectElement>('#fOpp')!.value).toBe('');
    await click('#matchFilters .btn-g'); // Limpiar
    expect(params(await answer())).toEqual({ limit: '50', offset: '0' });
    expect(el.querySelector<HTMLInputElement>('#fMin')!.value).toBe('');
  });

  it('shouldOfferTheOpeningsGroupedByColour', async () => {
    await answer();
    await click('#btnAllMatches');
    const groups = [...el.querySelectorAll('#fOpening optgroup')];
    expect(groups.map((g) => g.getAttribute('label'))).toEqual(['Blancas', 'Negras']);
    expect(groups.map((g) => [...g.querySelectorAll('option')].map((o) => [o.value, o.textContent]))).toEqual([[['ruy_lopez', 'Española (Ruy López)']], [['sicilian', 'Siciliana']]]);
  });

  it('shouldFilterToMissedThreatsAndDropItWhenClearing', async () => {
    await answer();
    svc.toggleMissed();
    await tick();
    expect(svc.compact()).toBe(false);
    expect(params(await answer())).toEqual({ limit: '50', offset: '0', missedThreat: '1' });
    svc.toggleMissed();
    await tick();
    expect(params(await answer())).toEqual({ limit: '50', offset: '0' });
    svc.toggleMissed();
    await tick();
    await answer();
    await click('#matchFilters .btn-g');
    expect(params(await answer())).toEqual({ limit: '50', offset: '0' });
    expect(svc.missedOnly()).toBe(false);
  });

  // Residual cases of tests/matchesTable.test.ts (legacy script) not covered above.
  it('shouldKeepNextDisabledWhenExpandingAListThatFitsInOnePage', async () => {
    await answer({ rows: [row()], total: 25 });
    await click('#btnAllMatches');
    await answer({ rows: [row()], total: 25 });
    expect(el.querySelector<HTMLButtonElement>('#next')!.disabled).toBe(true);
    expect(el.querySelector<HTMLButtonElement>('#prev')!.disabled).toBe(true);
  });

  it('shouldSendTheQueryToTheServerFromTheFirstPageWhenTyping', async () => {
    await answer();
    await click('#btnAllMatches');
    await answer({ rows: [row()], total: 120 });
    await click('#next');
    await answer({ rows: [row()], total: 120 });
    vi.useFakeTimers();
    const q = el.querySelector<HTMLInputElement>('#q')!;
    q.value = 'magnus';
    q.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(300);
    TestBed.tick();
    expect(params(pending()[0])).toEqual({ limit: '50', offset: '0', q: 'magnus' });
  });

  it('shouldShowEveryRowTheServerReturnsWithoutFilteringOnTheClient', async () => {
    await answer();
    await click('#btnAllMatches');
    await answer();
    vi.useFakeTimers();
    const q = el.querySelector<HTMLInputElement>('#q')!;
    q.value = 'zzz-matches-nobody-loaded';
    q.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(300);
    vi.useRealTimers();
    TestBed.tick();
    await answer({ rows: [row({ opponent_name: 'rival1' }), row({ match_id: 'm2', opponent_name: 'rival2' })], total: 2 });
    expect(el.querySelector('#mb')!.textContent).toContain('rival1');
    expect(el.querySelector('#mb')!.textContent).toContain('rival2');
  });

  it('shouldFilterByOpponentTypeWhenTheRivalOptionIsNotASegment', async () => {
    await answer();
    await click('#btnAllMatches');
    await answer();
    const opp = el.querySelector<HTMLSelectElement>('#fOpp')!;
    opp.value = 'bot';
    opp.dispatchEvent(new Event('change'));
    await tick();
    expect(params(await answer())).toEqual({ limit: '50', offset: '0', opponentType: 'bot' });
  });

  it('shouldClearEveryFilterWithASingleRequest', async () => {
    await answer();
    await click('#btnAllMatches');
    await answer();
    await click('[data-chip="result:win"]'); await answer();
    await click('[data-chip="color:black"]'); await answer();
    await click('#matchFilters .btn-g');
    const reqs = pending(); // match() hands the requests over: read them once
    expect(reqs).toHaveLength(1);
    expect(params(reqs[0])).toEqual({ limit: '50', offset: '0' });
  });

  it('shouldShowPlainMateWhenTheKindIsUnknownAndTheFullDateOnHover', async () => {
    const played = 1790000000;
    await answer({ rows: [row({ mate_type_label: null, played_at: played })], total: 1 });
    expect(el.querySelector('#mb td[data-l="Fin"]')!.textContent!.trim()).toBe('Mate');
    expect(el.querySelector('#mb td[data-l="Fecha"]')!.getAttribute('title')).toBe(new Date(played * 1000).toLocaleString('es-ES'));
  });
});
