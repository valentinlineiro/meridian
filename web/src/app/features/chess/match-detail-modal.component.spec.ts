import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { MatchesService } from './matches.service';
import { MatchDetailModal } from './match-detail-modal.component';
import { ChessBoard } from './chess-board.component';

// Ports of the game viewer (src/dashboard.client.js:1396–1446) and its tests: chessDashboardEngine "game viewer: engine errors",
// chessDashboardThreats "game viewer: missed threats".
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const GAME = {
  ok: true, matchId: 'm1', userColor: 'white', opponent: 'Bot', result: 'loss', startFen: START, pgn: '', missedPlies: [6],
  plies: ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'].map((san, i) => ({ san, fen: i === 0 ? AFTER_E4 : START, t: null })),
  engineWorst: [{ ply: 5, loss: 640, best: 'g1f3', bestSan: 'Nf3' }, { ply: 3, loss: 310, best: 'd2d4', bestSan: null }], engineSummary: { moves: 4, serious: 2, acpl: 162.5 },
};

describe('MatchDetailModal', () => {
  let http: HttpTestingController;
  let svc: MatchesService;
  let el: HTMLElement;
  let opener: HTMLButtonElement;

  const tick = async () => { TestBed.tick(); await new Promise((r) => setTimeout(r)); TestBed.tick(); };
  const gameReq = (): TestRequest | undefined => http.match((r) => r.url.startsWith('/api/me/matches/')).filter((r) => !r.cancelled)[0];
  const open = async (id = 'm1', body: unknown = GAME) => {
    opener.focus();
    svc.open(id);
    await tick();
    const r = gameReq()!;
    if (typeof body === 'number') r.flush({ ok: false, ...(body === 422 ? { code: 'ILLEGAL_GAME' } : {}) }, { status: body, statusText: 'x' }); else r.flush(body as object);
    await tick();
    return r;
  };
  const text = (id: string) => el.querySelector('#' + id)!.textContent!.trim();
  const key = async (k: string, shift = false) => { document.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey: shift, bubbles: true })); await tick(); };

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [MatchesService, provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    svc = TestBed.inject(MatchesService);
    const f = TestBed.createComponent(MatchDetailModal);
    el = f.nativeElement;
    opener = document.body.appendChild(document.createElement('button'));
    await tick();
  });
  afterEach(() => opener.remove());

  it('shouldStayClosedUntilAGameIsOpened', () => {
    expect(el.querySelector('#gameModal')).toBeNull();
  });

  it('shouldShowTheTitleTheBoardAndTheMovesWhenTheGameLoads', async () => {
    const r = await open('a b/c');
    expect(r.request.url).toBe('/api/me/matches/a%20b%2Fc/game');
    expect(text('gTitle')).toBe('vs Bot · blancas');
    expect(text('gPos')).toBe('0 / 7');
    expect(el.querySelector('#gPgn')!.getAttribute('href')).toBe('/api/me/matches/a%20b%2Fc/game.pgn');
    const squares = [...el.querySelectorAll('#gBoard .sq')];
    expect(squares).toHaveLength(64);
    expect(squares.slice(0, 8).map((s) => s.textContent).join('')).toBe('♜♞♝♛♚♝♞♜');
    expect(squares[0].className).toBe('sq lt');
    expect(squares[1].className).toBe('sq dk');
    expect(text('gMoves')).toBe('1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6 4. Qxf7#');
  });

  it('shouldDrawTheBoardFromTheOwnersSideWhenPlayingBlack', async () => {
    await open('m1', { ...GAME, userColor: 'black' });
    expect(text('gTitle')).toBe('vs Bot · negras');
    expect([...el.querySelectorAll('#gBoard .sq')].slice(0, 8).map((s) => s.textContent).join('')).toBe('♖♘♗♔♕♗♘♖');
  });

  it('shouldStepPliesWithinBounds', async () => {
    await open();
    const prev = el.querySelector<HTMLButtonElement>('#gPrev')!, next = el.querySelector<HTMLButtonElement>('#gNext')!;
    expect(prev.disabled).toBe(true);
    await key('ArrowLeft');
    expect(text('gPos')).toBe('0 / 7');
    next.click(); await tick();
    expect(text('gPos')).toBe('1 / 7');
    expect(el.querySelector('#gBoard .sq:nth-child(37)')!.textContent).toBe('♙'); // e4 after the first move
    expect(el.querySelector('#gMoves .gm.on')!.textContent).toBe('e4');
    for (let i = 0; i < 9; i++) await key('ArrowRight');
    expect(text('gPos')).toBe('7 / 7');
    expect(next.disabled).toBe(true);
    await key('ArrowLeft');
    expect(text('gPos')).toBe('6 / 7');
    el.querySelectorAll<HTMLElement>('#gMoves .gm')[2].click(); await tick();
    expect(text('gPos')).toBe('3 / 7');
  });

  it('shouldTrapFocusAndRestoreItInGameModal', async () => {
    await open();
    const close = el.querySelector<HTMLButtonElement>('#gClose')!;
    expect(document.activeElement).toBe(close);
    const focusables = [...el.querySelectorAll<HTMLElement>('#gameModal button:not([disabled]), #gameModal a[href]:not(.gm)')];
    const last = focusables[focusables.length - 1];
    expect(last.id).toBe('gPgn');
    await key('Tab', true); // from the first, backwards: the last
    expect(document.activeElement).toBe(last);
    await key('Tab'); // from the last, forwards: the first
    expect(document.activeElement).toBe(close);
    await key('Escape');
    expect(el.querySelector('#gameModal')).toBeNull();
    expect(svc.openId()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('shouldCloseWhenTheBackdropOrTheCloseButtonIsClicked', async () => {
    await open();
    el.querySelector<HTMLElement>('#gameModal .gamecard')!.click(); await tick();
    expect(svc.openId()).toBe('m1'); // a click inside the card is not the backdrop
    el.querySelector<HTMLElement>('#gameModal')!.click(); await tick();
    expect(svc.openId()).toBeNull();
    await open();
    el.querySelector<HTMLElement>('#gClose')!.click(); await tick();
    expect(svc.openId()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('shouldListWorstMovesWithLossAndTheEnginesPreferredMove', async () => {
    await open();
    const t = text('gErrors');
    expect(t).toContain('Según el motor: 2 errores graves en 4 jugadas tuyas · pérdida media 163 cp');
    expect(t).toContain('Jugada 5 (Qh5): pierdes 640 cp; el motor prefería Nf3');
    expect(t).toContain('Jugada 3 (Bc4): pierdes 310 cp; el motor prefería d2d4'); // no SAN available: the UCI move
  });

  it('shouldJumpToThePositionBeforeTheErrorWhenClickingAWorstMove', async () => {
    await open();
    el.querySelector<HTMLElement>('#gErrors a')!.click(); await tick();
    expect(text('gPos')).toBe('4 / 7');
  });

  it('shouldHideTheErrorListWhenThereIsNoAnalysis', async () => {
    await open('m1', { ...GAME, engineWorst: [], engineSummary: null });
    expect(text('gErrors')).toBe('');
  });

  it('shouldListEachMissedPlyAndJumpToThePositionBeforeIt', async () => {
    await open();
    expect(text('gMissed')).toBe('Jugada 6 (Nf6): el rival tenía mate en 1 y lo jugó');
    el.querySelector<HTMLElement>('#gMissed a')!.click(); await tick();
    expect(text('gPos')).toBe('5 / 7');
  });

  it('shouldShowNoMissedListWhenTheGameHasNone', async () => {
    await open('m1', { ...GAME, missedPlies: [] });
    expect(text('gMissed')).toBe('');
  });

  it('shouldCleanTheListAndDropTheEarlierGameWhenAnotherGameIsOpening', async () => {
    await open();
    svc.open('m2');
    await tick();
    expect(text('gTitle')).toBe('Cargando partida…');
    expect(el.querySelector('#gErrors')).toBeNull();
    expect(el.querySelector('#gBody')).toBeNull();
    const m2 = gameReq()!;
    svc.open('m3');
    await tick();
    expect(m2.cancelled).toBe(true);
  });

  it('shouldSayTheGameCannotBeShownWhenAPlyHasNoFen', async () => {
    await open('m1', { ...GAME, plies: [{ san: 'e4' }, ...GAME.plies.slice(1)] });
    expect(text('gTitle')).toBe('Partida');
    expect(text('gErr')).toBe('No hay partida completa guardada para esta partida.');
    expect(el.querySelector('#gBody')).toBeNull();
  });

  it('shouldSayWhyTheGameCannotBeShown', async () => {
    await open('m1', 404);
    expect(text('gTitle')).toBe('Partida');
    expect(text('gErr')).toBe('No hay partida completa guardada para esta partida.');
    expect(el.querySelector('#gBody')).toBeNull();
    await open('m2', 422);
    expect(text('gErr')).toBe('Las jugadas guardadas no son una partida válida.');
    await open('m3', { ok: false, code: 'ILLEGAL_GAME' });
    expect(text('gErr')).toBe('Las jugadas guardadas no son una partida válida.');
  });
});

describe('m-chess-board', () => {
  const render = async (fen: string, flip = false) => {
    const f = TestBed.createComponent(ChessBoard);
    f.componentRef.setInput('fen', fen);
    f.componentRef.setInput('flip', flip);
    await f.whenStable();
    return [...(f.nativeElement as HTMLElement).querySelectorAll('.sq')].map((s) => s.textContent).join('');
  };
  it('shouldPlaceEveryPieceAndExpandEmptySquares', async () => {
    const b = await render(START);
    expect(b).toBe('♜♞♝♛♚♝♞♜♟♟♟♟♟♟♟♟♙♙♙♙♙♙♙♙♖♘♗♕♔♗♘♖');
  });
  it('shouldDrawAnEmptyBoardWhenTheFenIsNotAString', async () => {
    const f = TestBed.createComponent(ChessBoard);
    f.componentRef.setInput('fen', undefined as unknown as string);
    await f.whenStable();
    expect((f.nativeElement as HTMLElement).querySelectorAll('.sq')).toHaveLength(64);
  });
  it('shouldMirrorTheBoardWhenFlipped', async () => {
    expect(await render('k7/8/8/8/8/8/8/7K w - - 0 1', true)).toBe('♔♚');
  });
});
