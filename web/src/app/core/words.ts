// The plain words of the product: how a number is said to a player. Formulas stay in the data and in each view's "Cómo se calcula";
// what is shown first is a phrase, a time (m:ss) or a count of days. Every screen takes its words from here, so they stay the same.
import { fmtClock } from './format';

/** How much faster than the day's average a result was (average time / own time), in words; always shown next to "frente a la media". The tiers are an interpretation, kept in one table. */
const SPEED_TIERS: [upTo: number, phrase: string][] = [
  [0.9, 'más lento'],
  [1.1, 'a la par'],
  [1.4, 'un poco más rápido'],
  [1.8, 'bastante más rápido'],
  [2.5, 'el doble de rápido'],
];
export const speedWords = (ratio: number | null): string =>
  ratio == null ? '—' : (SPEED_TIERS.find(([upTo]) => ratio < upTo)?.[1] ?? 'mucho más rápido');

/** "20 de 23 días": the count of days that beat the average, with its total always next to it. */
export const beatDays = (k: number | null, n: number): string => k == null || n <= 0 ? '—' : `${k} de ${n} ${n === 1 ? 'día' : 'días'}`;

export const typicalTime = (median: number | null, p25: number | null, p75: number | null): { main: string; range: string } => ({
  main: median == null ? '—' : fmtClock(Math.round(median)),
  range: median == null || p25 == null || p75 == null ? '' : `suele estar entre ${fmtClock(Math.round(p25))} y ${fmtClock(Math.round(p75))}`,
});

export type PeriodKey = '7' | '28' | '90' | 'all';
/** l: the button; phrase: how it reads inside a sentence. */
export const PERIODS: { k: PeriodKey; l: string; phrase: string }[] = [
  { k: '7', l: 'Semana', phrase: 'la última semana' },
  { k: '28', l: '4 semanas', phrase: 'las últimas 4 semanas' },
  { k: '90', l: '3 meses', phrase: 'los últimos 3 meses' },
  { k: 'all', l: 'Todo', phrase: 'todo el histórico' },
];

// One vocabulary for every "how am I doing" verdict (games today; the evaluation cards follow). "No signal" is never worded as "nothing
// changed": not seeing a change is not proof that there was none.
export type VerdictState = 'confirmed' | 'possible' | 'few-data' | 'no-signal';
export interface Verdict { state: VerdictState; dir: 'up' | 'down' | null; label: string; pill: string; sentence: string }
type Engine = { label: string; pending: string | null };
const dirOf = (label: string | null): 'up' | 'down' | null => label === 'mejora_sostenida' ? 'up' : label === 'deterioro' ? 'down' : null;

export function verdictFor(e: Engine): Verdict {
  const pending = dirOf(e.pending);
  if (pending) {
    return pending === 'down'
      ? { state: 'possible', dir: 'down', label: 'Posible bajada', pill: 'pill pill-selected', sentence: 'Puede que vayas algo más lento. Si se repite la semana que viene, lo confirmamos.' }
      : { state: 'possible', dir: 'up', label: 'Posible mejora', pill: 'pill pill-selected', sentence: 'Puede que vayas algo más rápido. Si se repite la semana que viene, lo confirmamos.' };
  }
  switch (e.label) {
    case 'deterioro': return { state: 'confirmed', dir: 'down', label: 'Bajando', pill: 'pill pill-warn', sentence: 'Vas más lento que antes, y se ha repetido dos semanas seguidas.' };
    case 'mejora_sostenida': return { state: 'confirmed', dir: 'up', label: 'Mejorando', pill: 'pill pill-win', sentence: 'Vas más rápido que antes, y se ha repetido dos semanas seguidas.' };
    case 'estable': return { state: 'no-signal', dir: null, label: 'Estable', pill: 'pill', sentence: `No se ve ningún cambio claro en ${PERIODS[1].phrase}.` };
    default: return { state: 'few-data', dir: null, label: 'Pocos datos', pill: 'pill pill-draw', sentence: 'Todavía no hay historial suficiente para juzgar este juego.' };
  }
}

/** The four epistemic states of an evaluation card, said with the same words and pills as the games verdicts. */
export const EVAL_VERDICTS: Record<'AFIRMADO' | 'INDICIO' | 'INSUFICIENTE' | 'SIN INDICIO', Verdict> = {
  'AFIRMADO': { state: 'confirmed', dir: null, label: 'Confirmado', pill: 'pill pill-win', sentence: '' },
  'INDICIO': { state: 'possible', dir: null, label: 'Posible señal', pill: 'pill pill-selected', sentence: 'Se ve una señal, pero con lo que hay todavía no podemos darla por buena.' },
  'INSUFICIENTE': { state: 'few-data', dir: null, label: 'Pocos datos', pill: 'pill pill-draw', sentence: 'Aún no hay datos suficientes para responder en este periodo.' },
  'SIN INDICIO': { state: 'no-signal', dir: null, label: 'Sin señales de cambio', pill: 'pill', sentence: 'No se ve un cambio claro con este criterio. Eso no demuestra que no haya habido cambio.' },
};

/**
 * One window against its baseline, judged by the 95% interval of the difference alone: an interval that excludes zero is a POSSIBLE change,
 * never a confirmed one (no persistence rule has been applied to it); no baseline is "few data".
 */
export function intervalVerdict(d: { diff: number; lower: number; upper: number } | null): Verdict {
  if (!d) return { state: 'few-data', dir: null, label: 'Pocos datos', pill: 'pill pill-draw', sentence: 'Todavía no hay partidas anteriores con las que comparar.' };
  if (d.lower > 0) return { state: 'possible', dir: 'up', label: 'Posible mejora', pill: 'pill pill-selected', sentence: 'Hay indicio de que vas mejor que antes, pero aún no lo damos por confirmado.' };
  if (d.upper < 0) return { state: 'possible', dir: 'down', label: 'Posible bajada', pill: 'pill pill-selected', sentence: 'Hay indicio de que vas peor que antes, pero aún no lo damos por confirmado.' };
  return { state: 'no-signal', dir: null, label: 'Estable', pill: 'pill', sentence: 'No se ve un cambio claro frente a tus partidas anteriores. Eso no demuestra que no lo haya.' };
}

export const verdictKey = (v: Verdict): string => v.dir ? `${v.state}-${v.dir}` : v.state;
/** What needs a look comes first. */
export const VERDICT_ORDER = ['confirmed-down', 'possible-down', 'possible-up', 'confirmed-up', 'no-signal', 'few-data'];

/** How far ahead of (or behind) what the day's difficulty asked for, in words (pct > 0 is faster); the percent stays in "Cómo se calcula". */
const FORM_TIERS: [upTo: number, phrase: [faster: string, slower: string]][] = [[10, ['algo más rápido', 'algo más lento']], [20, ['bastante más rápido', 'bastante más lento']]];
export const formWords = (pct: number | null): string => {
  if (pct == null) return 'Pocos datos';
  if (Math.abs(pct) < 3) return 'a la par';
  const [faster, slower] = FORM_TIERS.find(([upTo]) => Math.abs(pct) < upTo)?.[1] ?? ['mucho más rápido', 'mucho más lento'];
  return pct > 0 ? faster : slower;
};

/** The trend of the difficulty-adjusted form, in the same verdict vocabulary (the interval, not two weeks, is its rule). */
export function formVerdict(label: string): Verdict {
  switch (label) {
    case 'mejora': return { state: 'confirmed', dir: 'up', label: 'Mejorando', pill: 'pill pill-win', sentence: 'Teniendo en cuenta lo difícil que era cada día, vas cada vez más rápido.' };
    case 'deterioro': return { state: 'confirmed', dir: 'down', label: 'Bajando', pill: 'pill pill-warn', sentence: 'Teniendo en cuenta lo difícil que era cada día, vas cada vez más lento.' };
    case 'sin_cambio': return { state: 'no-signal', dir: null, label: 'Estable', pill: 'pill', sentence: 'Con la dificultad en cuenta no se ve un cambio claro.' };
    default: return { state: 'few-data', dir: null, label: 'Pocos datos', pill: 'pill pill-draw', sentence: 'Aún no hay historial suficiente para ajustar por dificultad.' };
  }
}

export const GAME_NAMES: Record<string, string> = { zip: 'Zip', tango: 'Tango', queens: 'Queens', mini_sudoku: 'Mini Sudoku', patches: 'Patches', wend: 'Wend' };
export const gameName = (k: string): string => GAME_NAMES[k] || k;
export const gdays = (n: number) => n + (n === 1 ? ' día' : ' días');

/** The game keys in verdict order: what needs a look first. A game without a readable verdict goes last. */
export const attentionOrder = (games: Record<string, { interpretation: Engine }>): string[] => {
  const rank = (k: string) => { try { return VERDICT_ORDER.indexOf(verdictKey(verdictFor(games[k]!.interpretation))); } catch { return 99; } };
  return Object.keys(games).sort((a, b) => (rank(a) < 0 ? 98 : rank(a)) - (rank(b) < 0 ? 98 : rank(b)));
};
