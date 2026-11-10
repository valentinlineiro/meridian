// What the report of ONE game says, as pure functions of the server's summary of that game. Nothing is computed that the contract does
// not carry: a window with nothing to say says nothing, and every claim keeps its condition.
import { fmtClock, fmtDate } from '../../core/format';
import { PERIODS } from '../../core/words';
import { beatText, effText, Game, interpretationLines, MIN_LOSS_CELL, Range, RANGE_NAMES } from './games.model';

/** A week with at least this many results counts as complete in the report: a presentation convention, not a statistical threshold. */
export const MIN_WEEK_N = 5;
const MIN_WEEKS_FOR_RANGE = 4;
const DAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']; // dow 0 = lunes
const DAYS_PLURAL = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'];
const pct = (r: number) => Math.round(r * 100) + ' %';
const clock = (s: number) => fmtClock(Math.round(s));
/** Signed number with the typographic minus, decimal comma. */
const signed = (v: number, d = 0) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d).replace('.', ',');
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

/** The same figures for 7 days, 4 weeks, 3 months and all: a period without results prints a dash, never a zero. */
export function levelRows(x: Game): { range: Range; label: string; median: string; band: string; speed: string; beat: string }[] {
  return PERIODS.map(({ k, l }) => {
    const w = x.windows[k], t = w.time;
    return {
      range: k, label: l,
      median: t.median == null ? '—' : clock(t.median),
      band: t.p25 == null || t.p75 == null ? '—' : `${clock(t.p25)}–${clock(t.p75)}`,
      speed: effText(w.eff.median),
      beat: w.beat.rate == null ? '—' : `${w.beat.k} de ${w.beat.nBeat} (${beatText(w.beat.rate)})`,
    };
  });
}

export interface Fact { title: string; value: string; note: string; detectable: boolean | null }
const ADJUSTED_NOTE: Record<string, string> = { sin_cambio: 'sin cambio detectable', mejora: 'mejora detectable', deterioro: 'deterioro detectable' };

/**
 * Three measures of change, each saying whether it is DETECTABLE or only an estimate. "Detectable" is a plain comparison with the band
 * the server sends (the adjusted form uses the label it already published); null = it cannot be judged.
 */
export function evolutionFacts(x: Game, range: Range): { adjusted: Fact; recent: Fact; trend: Fact } {
  const a = x.adjusted, pctA = a.windows[range].pct, bands = x.interpretation.bands;
  const noise = a.trend ? ` · ruido ${signed(a.trend.noise[0])} % a ${signed(a.trend.noise[1])} %` : '';
  const adjusted: Fact = {
    title: 'Forma descontando la dificultad', value: pctA == null ? '—' : `${signed(pctA)} %`,
    note: a.label in ADJUSTED_NOTE ? ADJUSTED_NOTE[a.label] + noise : 'aún pocos datos',
    detectable: a.label === 'mejora' || a.label === 'deterioro' ? true : a.label === 'sin_cambio' ? false : null,
  };

  const r = x.recent28vBase56, b = bands?.['28v56'];
  const span = b ? `(${signed(b[0] * 100)} % a ${signed(b[1] * 100)} %)` : '';
  const inside = r && b ? r.delta >= b[0] && r.delta <= b[1] : null;
  const recent: Fact = {
    title: 'Últimos 28 días frente a los 56 anteriores', value: r ? `${signed(r.delta * 100)} %` : '—',
    note: !r ? 'aún pocos datos' : !b ? 'sin límites calibrados' : `${inside ? 'dentro' : 'fuera'} del ruido de este juego ${span}`,
    detectable: inside == null ? null : !inside,
  };

  const t = x.trend112, rb = bands?.rho112, slope = t?.slopePctPer28d ?? null;
  const detect = t && rb && slope != null && t.rho != null ? (t.rho > rb[1] && slope > 0) || (t.rho < rb[0] && slope < 0) : null;
  const trend: Fact = {
    title: 'Tendencia a 112 días', value: slope == null ? '—' : `${signed(slope, 1)} % cada 4 semanas`,
    note: !t || slope == null ? 'aún pocos datos' : `estimada · ${!rb ? 'sin límites calibrados' : detect ? 'detectable' : 'sin cambio detectable'} · n = ${t.n}`,
    detectable: detect,
  };
  return { adjusted, recent, trend };
}

/** What the data show: the count since the first result, then the lines the server's own interpretation already gives (also what is missing). */
export function evidenceLines(x: Game): string[] {
  const b = x.windows.all.beat;
  const count = b.rate == null ? [] : [`${b.k} de ${b.nBeat} días mejor que la media (${beatText(b.rate)})` + (x.firstDate ? `, desde el ${fmtDate(x.firstDate)}` : '')];
  return [...count, ...interpretationLines(x)];
}
