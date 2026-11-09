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
      : { state: 'possible', dir: 'up', label: 'Posible subida', pill: 'pill pill-selected', sentence: 'Puede que vayas algo más rápido. Si se repite la semana que viene, lo confirmamos.' };
  }
  switch (e.label) {
    case 'deterioro': return { state: 'confirmed', dir: 'down', label: 'A la baja', pill: 'pill pill-warn', sentence: 'Vas más lento que antes, y se ha repetido dos semanas seguidas.' };
    case 'mejora_sostenida': return { state: 'confirmed', dir: 'up', label: 'A la alza', pill: 'pill pill-win', sentence: 'Vas más rápido que antes, y se ha repetido dos semanas seguidas.' };
    case 'estable': return { state: 'no-signal', dir: null, label: 'Sin señales de cambio', pill: 'pill', sentence: `No se ve ningún cambio claro en ${PERIODS[1].phrase}.` };
    default: return { state: 'few-data', dir: null, label: 'Aún pocos datos', pill: 'pill pill-draw', sentence: 'Todavía no hay historial suficiente para juzgar este juego.' };
  }
}

export const verdictKey = (v: Verdict): string => v.dir ? `${v.state}-${v.dir}` : v.state;
/** What needs a look comes first. */
export const VERDICT_ORDER = ['confirmed-down', 'possible-down', 'possible-up', 'confirmed-up', 'no-signal', 'few-data'];
