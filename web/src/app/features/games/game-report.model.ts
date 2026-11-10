// What the report of ONE game says, as pure functions of the server's summary of that game. Nothing is computed that the contract does
// not carry: a window with nothing to say says nothing, and every claim keeps its condition.
import { fmtClock } from '../../core/format';
import { Game, MIN_LOSS_CELL, Range, RANGE_NAMES } from './games.model';

/** A week with at least this many results counts as complete in the report: a presentation convention, not a statistical threshold. */
export const MIN_WEEK_N = 5;
const MIN_WEEKS_FOR_RANGE = 4;
const DAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']; // dow 0 = lunes
const DAYS_PLURAL = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'];
const pct = (r: number) => Math.round(r * 100) + ' %';
const clock = (s: number) => fmtClock(Math.round(s));
const list = (a: string[]) => (a.length > 1 ? a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1] : a[0]!);

/** The middle half of the results of a period (P25–P75), its median, the best time ever and the n behind them; null with no median. */
export function normalRange(x: Game, range: Range): { median: string; low: string; high: string; n: number; best: { time: string; date: string } } | null {
  const t = x.windows[range].time;
  if (t.median == null || t.p25 == null || t.p75 == null) return null;
  return { median: clock(t.median), low: clock(t.p25), high: clock(t.p75), n: t.nTime, best: { time: clock(x.best.seconds), date: x.best.date } };
}

/** The share of days each week beat the average (the 90-day weekly buckets); only complete weeks enter the range. */
export function weeklyBeat(x: Game): { weeks: { start: string; n: number; beat: number | null; complete: boolean }[]; completeCount: number; min: number | null; max: number | null } {
  const weeks = (x.trajectory['90'] ?? []).map((b) => ({ start: b.start, n: b.n, beat: b.beat, complete: b.n >= MIN_WEEK_N }));
  const beats = weeks.filter((w) => w.complete && w.beat != null).map((w) => w.beat!);
  return { weeks, completeCount: weeks.filter((w) => w.complete).length, min: beats.length ? Math.min(...beats) : null, max: beats.length ? Math.max(...beats) : null };
}

/**
 * Wins and losses per weekday over the whole history. A day stands out only when it has enough results and the LOWER limit of its loss
 * interval is above the game's overall loss rate (the interval the server already sends; no threshold of our own).
 */
export function weekdayReport(x: Game): {
  rows: { day: string; n: number; losses: number; wins: number; rate: number | null; lo: number | null; hi: number | null; enough: boolean; stands: boolean }[];
  overallRate: number | null; standing: string[];
} {
  const cells = x.losses?.cells ?? [];
  const total = cells.reduce((a, c) => a + c.n, 0);
  const overallRate = total ? x.losses.losses / total : null;
  const rows = DAYS.map((day, dow) => {
    const c = cells.find((k) => k.dow === dow);
    const n = c?.n ?? 0, losses = c?.losses ?? 0, enough = n >= MIN_LOSS_CELL;
    return {
      day, n, losses, wins: n - losses, rate: c?.rate ?? null, lo: c?.lo ?? null, hi: c?.hi ?? null, enough,
      stands: enough && c?.rate != null && c?.lo != null && overallRate != null && c.lo > overallRate,
    };
  });
  return { rows, overallRate, standing: rows.flatMap((r, i) => (r.stands ? [DAYS_PLURAL[i]!] : [])) };
}

/** Up to three clauses of facts, each only when its condition holds; it describes, it does not conclude. */
export function reportSentence(x: Game, range: Range): string[] {
  const b = x.windows[range].beat;
  if (b.rate == null) return [];
  const out = [`Le ganas a la media el ${pct(b.rate)} de los días (${b.k} de ${b.nBeat}, ${RANGE_NAMES[range]})`];
  const w = weeklyBeat(x);
  if (w.completeCount >= MIN_WEEKS_FOR_RANGE && w.min != null && w.max != null) out.push(`En las ${w.completeCount} semanas completas, entre el ${pct(w.min)} y el ${pct(w.max)} de los días`);
  const days = weekdayReport(x).standing;
  if (days.length) out.push('Se pierde más ' + list(days.map((d) => 'los ' + d)));
  return out;
}
