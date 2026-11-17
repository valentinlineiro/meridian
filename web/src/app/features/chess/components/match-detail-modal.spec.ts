import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { MatchesService } from '../services/matches.service';
import { MatchDetailModal } from './match-detail-modal';
import { ChessBoard } from './chess-board';

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
    expect(text('gPos')).toBe('Posición inicial');
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
    expect(text('gPos')).toBe('Posición inicial');
    next.click(); await tick();
    expect(text('gPos')).toBe('Jugada 1 de 7: e4');
    expect(el.querySelector('#gBoard .sq:nth-child(37)')!.textContent).toBe('♙'); // e4 after the first move
    expect(el.querySelector('#gMoves .gm.on')!.textContent).toBe('e4');
    for (let i = 0; i < 9; i++) await key('ArrowRight');
    expect(text('gPos')).toBe('Jugada 7 de 7: Qxf7#');
    expect(next.disabled).toBe(true);
    await key('ArrowLeft');
    expect(text('gPos')).toBe('Jugada 6 de 7: Nf6');
    el.querySelectorAll<HTMLElement>('#gMoves .gm')[2].click(); await tick();
    expect(text('gPos')).toBe('Jugada 3 de 7: Bc4');
  });

  it('shouldTrapFocusAndRestoreItInGameModal', async () => {
    await open();
    const close = el.querySelector<HTMLButtonElement>('#gClose')!;
    expect(document.activeElement).toBe(close);
    const focusables = [...el.querySelectorAll<HTMLElement>('#gameModal button:not([disabled]), #gameModal a[href]')];
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

  it('shouldFocusMoveButtonsDuringTabNavigationAndStepWhenOneIsActivated', async () => {
    await open();
    const close = el.querySelector<HTMLButtonElement>('#gClose')!;
    expect(document.activeElement).toBe(close);
    await key('Tab');
    const firstMove = el.querySelector<HTMLButtonElement>('#gMoves .gm')!;
    expect(document.activeElement).toBe(firstMove);
    expect(firstMove.textContent?.trim()).toBe('e4');

    firstMove.click(); // Enter and Space click a native button
    await tick();
    expect(text('gPos')).toBe('Jugada 1 de 7: e4');

    await key('Tab');
    const secondMove = el.querySelectorAll<HTMLButtonElement>('#gMoves .gm')[1];
    expect(document.activeElement).toBe(secondMove);
    expect(secondMove.textContent?.trim()).toBe('e5');
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
    expect(t).toContain('Según el motor: 2 errores graves en 4 jugadas tuyas · pérdida media 1,6 peones por jugada');
    expect(t).toContain('Jugada 5 (Qh5): pierdes 6,4 peones; el motor prefería Nf3');
    expect(t).toContain('Jugada 3 (Bc4): pierdes 3,1 peones; el motor prefería d2d4'); // no SAN available: the UCI move
  });

  it('shouldJumpToThePositionBeforeTheErrorWhenClickingAWorstMove', async () => {
    await open();
    el.querySelector<HTMLElement>('#gErrors button.linkbtn')!.click(); await tick();
    expect(text('gPos')).toBe('Jugada 4 de 7: Nc6');
  });

  it('shouldHideTheErrorListWhenThereIsNoAnalysis', async () => {
    await open('m1', { ...GAME, engineWorst: [], engineSummary: null });
    expect(text('gErrors')).toBe('');
  });

  it('shouldListEachMissedPlyAndJumpToThePositionBeforeIt', async () => {
    await open();
    expect(text('gMissed')).toBe('Jugada 6 (Nf6): el rival tenía mate en 1 y lo jugó');
    el.querySelector<HTMLElement>('#gMissed button.linkbtn')!.click(); await tick();
    expect(text('gPos')).toBe('Jugada 5 de 7: Qh5');
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
    expect(text('gErr')).toBe('Esta partida no tiene jugadas guardadas.');
    expect(el.querySelector('#gBody')).toBeNull();
  });

  it('shouldNameEachMoveAsAButtonAndMarkTheCurrentOneForAssistiveTechnology', async () => {
    await open();
    const moves = [...el.querySelectorAll<HTMLButtonElement>('#gMoves button.gm')];
    expect(moves[0].getAttribute('aria-label')).toBe('Jugada 1, e4');
    expect(moves.every((b) => b.getAttribute('aria-current') === null)).toBe(true); // at the start none is current
    moves[2].click(); await tick();
    expect(el.querySelector('#gMoves [aria-current="step"]')!.getAttribute('aria-label')).toBe('Jugada 3, Bc4');
    expect(el.querySelector('#gPos')!.getAttribute('aria-live')).toBe('polite');
  });

  it('shouldDescribeThePositionInWordsAndHideTheSquares', async () => {
    await open();
    const board = el.querySelector('#gBoard')!;
    expect(board.getAttribute('role')).toBe('img');
    expect(board.getAttribute('aria-label')).toBe('Posición inicial. Blancas: rey e1, dama d1, torres a1 y h1, alfiles c1 y f1, caballos b1 y g1, peones a2, b2, c2, d2, e2, f2, g2 y h2. Negras: rey e8, dama d8, torres a8 y h8, alfiles c8 y f8, caballos b8 y g8, peones a7, b7, c7, d7, e7, f7, g7 y h7.');
    expect(board.querySelectorAll('.sq:not([aria-hidden="true"])')).toHaveLength(0);
    el.querySelectorAll<HTMLElement>('#gMoves .gm')[0].click(); await tick();
    expect(board.getAttribute('aria-label')).toContain('Posición tras la jugada 1, e4.');
  });

  it('shouldSayWhyTheGameCannotBeShown', async () => {
    await open('m1', 404);
    expect(text('gTitle')).toBe('Partida');
    expect(text('gErr')).toBe('Esta partida no tiene jugadas guardadas.');
    expect(el.querySelector('#gBody')).toBeNull();
    await open('m2', 422);
    expect(text('gErr')).toBe('Las jugadas guardadas no son una partida válida.');
    await open('m3', { ok: false, code: 'ILLEGAL_GAME' });
    expect(text('gErr')).toBe('Las jugadas guardadas no son una partida válida.');
  });

  it('shouldSayTheGameCouldNotBeLoadedAndNotThatItDoesNotExistWhenTheServerFails', async () => {
    await open('m1', 503);
    expect(text('gTitle')).toBe('Partida');
    expect(text('gErr')).toContain('No pudimos cargar la partida.');
    expect(text('gErr')).not.toContain('no tiene jugadas guardadas');
    expect(el.querySelector('#gErr')!.getAttribute('role')).toBe('status');
  });

  it('shouldAskForTheSameGameAgainWhenReintentarIsPressedAndShowItWhenItLoads', async () => {
    await open('m1', 503);
    el.querySelector<HTMLButtonElement>('#gErr button')!.click();
    await tick();
    const again = gameReq()!;
    expect(again.request.url).toContain('/api/me/matches/m1/game');
    expect(el.querySelector<HTMLButtonElement>('#gErr button')!.disabled).toBe(true); // one request at a time
    again.flush(GAME);
    await tick();
    expect(el.querySelector('#gBody')).not.toBeNull();
    expect(el.querySelector('#gErr button')).toBeNull();
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
