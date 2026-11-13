import { describe, expect, it } from 'vitest';
import { GamesChange, GameState, GameChangeRow, gamesChangeView } from './games-change.model';

const up: GameState = { kind: 'mejorando' }, down: GameState = { kind: 'bajando' }, flat: GameState = { kind: 'estable' };
const sigUp: GameState = { kind: 'senal', dir: 'mejorando' }, sigDown: GameState = { kind: 'senal', dir: 'bajando' };
const few: GameState = { kind: 'pocos_datos', reason: 'cobertura_insuficiente' }, uncal: GameState = { kind: 'pocos_datos', reason: 'sin_calibracion' };
const row = (game: string, from: GameState, to: GameState, outcome: GameChangeRow['outcome']): GameChangeRow => ({ game, from, to, outcome });
const change = (games: GameChangeRow[], extra: Partial<GamesChange> = {}): GamesChange =>
  ({ mode: 'compare', since: '2026-10-08', until: '2026-11-13', elapsedDays: 36, playedDaysInWindow: 20, games, ...extra });
const textOf = (c: GamesChange) => gamesChangeView(c).rows.map((r) => r.text);

describe('gamesChangeView', () => {
  it('shouldWriteAConfirmedChangeWithItsDatesAndEvidence', () => {
    const c = change([row('zip', flat, down, { kind: 'cambio_confirmado', from: flat, to: down })]);
    expect(textOf(c)).toEqual(['Zip: de Estable a Bajando (8 oct → 13 nov). Vas más lento que antes y se mantiene desde hace una semana.']);
  });
  it('shouldSaySeEstabilizaWhenATrendEndsInEstable', () => {
    const c = change([row('zip', down, flat, { kind: 'cambio_confirmado', from: down, to: flat })]);
    expect(textOf(c)[0]).toBe('Zip: de Bajando a Estable (8 oct → 13 nov). Ya no se aprecia la tendencia.');
  });
  it('shouldWriteASenalAsPendingNeverAsAChange', () => {
    const c = change([row('queens', flat, sigUp, { kind: 'senal', to: sigUp })]);
    expect(textOf(c)).toEqual(['Queens: posible mejora. Se confirma si se repite la semana que viene.']);
    expect(textOf(change([row('queens', flat, sigDown, { kind: 'senal', to: sigDown })]))[0]).toBe('Queens: posible empeoramiento. Se confirma si se repite la semana que viene.');
  });
  it('shouldSaySigueEstableIgualQueElOct8', () => {
    const c = change([row('wend', flat, flat, { kind: 'sin_cambios', state: flat })]);
    expect(textOf(c)).toEqual(['Wend: sigue Estable, igual que el 8 oct.']);
  });
  it('shouldSayAhoraHayDatosSuficientesForEvidenciaGanada', () => {
    const c = change([row('patches', few, flat, { kind: 'evidencia', sub: 'ganada', from: few, to: flat })]);
    expect(textOf(c)).toEqual(['Patches: ahora hay datos suficientes. Está Estable. El 8 oct no había base para compararlo.']);
  });
  it('shouldSayYaNoHayDatosForEvidenciaPerdida', () => {
    const c = change([row('patches', up, few, { kind: 'evidencia', sub: 'perdida', from: up, to: few })]);
    expect(textOf(c)).toEqual(['Patches: ya no hay datos suficientes para valorarlo.']);
  });
  it('shouldSayPocosDatosForEvidenciaAusente', () => {
    const c = change([row('queens', few, few, { kind: 'evidencia', sub: 'ausente', from: few, to: few })]);
    expect(textOf(c)).toEqual(['Queens: pocos datos para comparar.']);
  });
  it('shouldSaySinCalibracionWhenTheReasonIsSinCalibracion', () => {
    const c = change([row('tango', uncal, uncal, { kind: 'evidencia', sub: 'ausente', from: uncal, to: uncal })]);
    expect(textOf(c)).toEqual(['Tango: sin calibración todavía, no se puede valorar su tendencia.']);
  });
  it('shouldSayNoSePuedeConcluirForNoConcluyente', () => {
    const c = change([row('mini_sudoku', down, sigDown, { kind: 'no_concluyente', from: down, to: sigDown })]);
    expect(textOf(c)).toEqual(['Mini Sudoku: no se puede concluir. Su tendencia estaba confirmada y dejó de estarlo.']);
  });

  it('shouldNeverCallAChangeAnyTransitionToOrFromPocosDatos', () => {
    const v = gamesChangeView(change([row('zip', few, down, { kind: 'evidencia', sub: 'ganada', from: few, to: down })]));
    expect(v.rows[0]!.text).not.toMatch(/de Pocos datos a|cambió/);
    expect(v.summary).toBe('1 con pocos datos');
  });

  it('shouldShow36DaysForOct8ToNov13', () => {
    expect(gamesChangeView(change([row('zip', flat, flat, { kind: 'sin_cambios', state: flat })])).heading).toBe('Games · 8 oct → 13 nov (36 días)');
  });
  it('shouldCountTheOutcomesInTheSummaryLine', () => {
    const rows = [
      row('zip', flat, down, { kind: 'cambio_confirmado', from: flat, to: down }),
      row('queens', flat, sigUp, { kind: 'senal', to: sigUp }),
      row('patches', flat, flat, { kind: 'sin_cambios', state: flat }), row('mini_sudoku', flat, flat, { kind: 'sin_cambios', state: flat }), row('wend', flat, flat, { kind: 'sin_cambios', state: flat }),
      row('tango', few, few, { kind: 'evidencia', sub: 'ausente', from: few, to: few }),
    ];
    expect(gamesChangeView(change(rows)).summary).toBe('1 cambió, 1 señal, 3 sin cambios, 1 con pocos datos');
  });
  it('shouldOrderRowsByOutcomeThenName', () => {
    const rows = [
      row('wend', flat, flat, { kind: 'sin_cambios', state: flat }),
      row('tango', few, few, { kind: 'evidencia', sub: 'ausente', from: few, to: few }),
      row('queens', flat, sigUp, { kind: 'senal', to: sigUp }),
      row('zip', flat, down, { kind: 'cambio_confirmado', from: flat, to: down }),
    ];
    expect(gamesChangeView(change(rows)).rows.map((r) => r.game)).toEqual(['zip', 'queens', 'wend', 'tango']);
  });

  it('shouldShowTheNoticeWhenNothingWasRecordedInTheWindow', () => {
    const v = gamesChangeView(change([row('zip', flat, flat, { kind: 'sin_cambios', state: flat })], { playedDaysInWindow: 0 }));
    expect(v.notice).toBe('No registraste Games en este periodo.');
  });
  it('shouldShowTheShortWindowNotice', () => {
    const v = gamesChangeView(change([], { mode: 'invalid-window', elapsedDays: null, playedDaysInWindow: null }));
    expect(v.notice).toBe('Esta ventana es demasiado corta para comparar.');
    expect(v.rows).toEqual([]);
  });
  it('shouldShowAnEmptyHistoryLine', () => {
    expect(gamesChangeView(change([], { playedDaysInWindow: 0 })).notice).toBe('Aún no hay partidas de Games.');
  });
  it('shouldDescribeTheCurrentStateWithoutAnyComparison', () => {
    const c: GamesChange = { mode: 'current-only', since: null, until: '2026-11-13', elapsedDays: null, playedDaysInWindow: null,
      games: [row('zip', null as unknown as GameState, down, null), row('tango', null as unknown as GameState, uncal, null)] };
    const v = gamesChangeView(c);
    expect(v.heading).toBe('Games · estado actual');
    expect(v.rows.map((r) => r.text)).toEqual(['Zip: Bajando. Vas más lento que antes, y se ha repetido dos semanas seguidas.', 'Tango: sin calibración todavía, no se puede valorar su tendencia.']);
  });
});
