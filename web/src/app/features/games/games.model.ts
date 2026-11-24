// Port of the LinkedIn Games view builders (src/dashboard.client.js:1787–1943). Pure: the range is a parameter, not a global.
// Nothing here is computed beyond formatting: labels, bands and arrows come from the server's contract.
import { fmtDate, localToday } from '../../core/format';
import { shortDate } from '../../core/xp-week';
import { resultBars } from '../../shared/result-bars';
import { attentionOrder, GAME_NAMES, gameName, gdays, PERIODS, PeriodKey, Verdict, verdictFor } from '../../core/words';

export type Range = PeriodKey;
export type Label = 'mejora_sostenida' | 'estable' | 'deterioro' | 'datos_insuficientes';
export interface Blk {
  eff: { median: number | null; nEff: number };
  beat: { rate: number | null; k: number; nBeat: number };
  time: { median: number | null; p25: number | null; p75: number | null; nTime: number };
}
export interface EffRel { value: number | null; nCur: number; nPrev: number; arrow?: 'up' | 'down' | 'flat' | null; band?: [number, number] }
export interface Win extends Blk { prev: Blk | null; delta: { effRel: EffRel } | null }
export interface Bucket { start: string; n: number; eff: number | null; beat: number | null }
export interface Interp {
  label: Label; reason: string | null; pending: Label | null; calibratedThrough: string | null;
  bands: { '28': [number, number]; '28v56': [number, number]; rho112: [number, number] } | null;
}
export interface Game {
  n: number; firstDate?: string; best: { seconds: number; date: string }; beatStreak: { current: number; max: number; maxDate?: string | null };
  trend112: { rho: number | null; slopePctPer28d: number | null; n: number; days: number };
  recent28vBase56: { delta: number; nCur: number; nBase: number };
  interpretation: Interp; series: { date: string; eff: number; roll: number }[];
  windows: Record<Range, Win>; trajectory: Record<Range, Bucket[]>;
  adjusted: Adjusted; losses: Losses;
  // Report phase 2 (server: GameReportStats.ts); absent in a summary that predates it.
  weekly?: WeekSeconds[]; savings?: { medianSec: number; totalSec: number; n: number } | null;
  effSpread?: { p25: number; p75: number; ratio: number; n: number } | null;
  outliers?: { n: number; minN: number; good: { date: string; eff: number }[]; bad: { date: string; eff: number }[] };
  // Report phase 3 (server: GameDiagnosis.ts); absent in a summary that predates it.
  diagnosis?: Diagnosis;
}
export interface Diagnosis {
  status: 'vigente' | 'caducada' | 'sin_calibracion'; calibratedThrough: string | null;
  dimensions: Record<'weekday' | 'regularity', { evaluable: boolean; reason: string | null; p: number | null }> | null;
  findings: { dimension: 'weekday' | 'regularity'; sign: 1 | -1; kind: 'fortaleza' | 'debilidad'; dow: number | null; pAdjusted: number }[];
  watch: { dimension: 'weekday' | 'regularity'; p: number; unconfirmed: boolean } | null;
}
export interface WeekSeconds { weekStart: string; n: number; nWithAvg: number; medianSec: number; medianAvgSec: number | null; medianEff: number | null }
export interface Adjusted {
  label: 'mejora' | 'deterioro' | 'sin_cambio' | 'pocos_datos'; elasticity: number | null; n: number;
  windows: Record<Range, { pct: number | null; n: number }>; trend: { pctPer28d: number; noise: [number, number]; weeks: number } | null;
}
export interface LossCell { dow: number; n: number; losses: number; rate: number | null; lo: number | null; hi: number | null }
export interface Losses { cells: LossCell[]; losses: number; near: number }
export type Level = 'facil' | 'normal' | 'duro';
export interface Weekday { dow: number; n: number; beat: { rate: number | null }; eff: { median: number | null } }
export interface Summary { weekdays?: Weekday[]; difficulty?: { date: string; level: Level }[]; days: number; from: string | null; to: string | null; playStreak?: { current: number; max: number } | null; games: Record<string, Game> }
export interface Day { games?: Record<string, { score?: string | null; avg?: string | null; number?: number | null }> }

export { GAME_NAMES, gameName, gdays };
export const RANGES: { k: Range; l: string }[] = PERIODS.map(({ k, l }) => ({ k, l }));
export const RANGE_NAMES = Object.fromEntries(PERIODS.map((p) => [p.k, p.phrase])) as Record<Range, string>;

export { localToday };

const gnum = (v: number | null, d: number) => v == null ? '—' : v.toLocaleString('es-ES', { maximumFractionDigits: d });
const gpct = (r: number | null) => r == null ? '—' : Math.round(r * 100) + ' %';
/** Typographic minus, as in the rest of the UI (changes, chess). */
const minus = (s: string) => s.replace('-', '−');
const gsigned = (v: number | null, suffix: string) => { if (v == null) return '—'; const r = Math.round(v); return (r > 0 ? '+' : '') + minus(String(r)) + suffix; };
const gsign = (v: number | null, d: number) => v == null ? '—' : (v > 0 ? '+' : '') + minus(gnum(v, d));
export const effText = (v: number | null) => v == null ? '—' : '×' + gnum(v, 2);
export const beatText = gpct;

export const LABEL_TEXT: Record<Label, string> = { mejora_sostenida: 'Mejora sostenida', estable: 'Estable (sin cambio detectable)', deterioro: 'Deterioro', datos_insuficientes: 'Datos insuficientes' };


export function interpretationLines(x: Game): string[] {
  const i = x.interpretation, b = i.bands, t = x.trend112, r = x.recent28vBase56, out: string[] = [];
  if (i.label === 'mejora_sostenida' || (i.label === 'deterioro' && i.reason === 'sostenido')) {
    const up = i.label === 'mejora_sostenida';
    out.push('Tendencia ' + (up ? 'al alza' : 'a la baja') + ' en los últimos ' + t.days + ' días: ρ de Spearman ' + gsign(t.rho, 2) + ' (límite ' + gsign(b!.rho112[up ? 1 : 0], 2) + ') y pendiente ' + gsign(t.slopePctPer28d, 1) + ' % cada 28 días (n=' + t.n + '). Se repite dos semanas seguidas.');
  } else if (i.label === 'deterioro') {
    out.push('Los últimos 28 días están un ' + gsigned(r.delta * 100, ' %') + ' frente a los 56 anteriores; el límite de ruido de este juego es ' + gsigned(b!['28v56'][0] * 100, ' %') + ' (n=' + r.nCur + '/' + r.nBase + '). Se repite dos semanas seguidas.');
  } else if (i.label === 'estable') {
    out.push('Ninguna señal supera el ruido de este juego: a 28 días solo se detecta un cambio por debajo de ' + gsigned(b!['28'][0] * 100, ' %') + ' o por encima de ' + gsigned(b!['28'][1] * 100, ' %') + '.');
  } else if (i.reason === 'sin_calibracion') {
    const daysText = x.n != null ? x.n + ' de 112 días de historia observados' : 'se calibran con al menos 112 días de historia';
    out.push('Este juego aún no tiene límites calibrados (' + daysText + '; requiere el periodo completo sin validez parcial).');
  } else {
    out.push('Faltan observaciones con media: hacen falta al menos 68 de los últimos 112 días, 17 de los últimos 28 y 34 de los 56 anteriores.');
  }
  if (i.pending) out.push('Señal sin confirmar: ' + LABEL_TEXT[i.pending].toLowerCase() + '. Se publicará si se repite la semana próxima.');
  if (b) out.push('Límites calibrados con datos hasta ' + fmtDate(i.calibratedThrough) + '.');
  return out;
}

const verdictOf = (g: Game): Verdict => verdictFor(g.interpretation);
const DAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
export function formLines(x: Game, range: Range): string[] {
  const a = x.adjusted;
  if (a.elasticity == null) return ['Descontar la dificultad necesita al menos 60 resultados con media de este juego (hay ' + a.n + ').'];
  return [
    'Forma descontando la dificultad: tu tiempo se compara con el que cabía esperar según la media de ese día, con tu propia historia (n=' + a.n + '). Forma de este periodo: ' + (a.windows[range].pct == null ? '—' : gsigned(a.windows[range].pct, ' %') + ' (n=' + a.windows[range].n + ')') + '. Cuando la media sube un 10 %, tu tiempo sube un ' + gnum(a.elasticity * 10, 1) + ' %.',
    a.trend ? 'Tendencia: tu tiempo cambia ' + gsigned(a.trend.pctPer28d, ' %') + ' cada 4 semanas (con ruido solo, este juego daría entre ' + gsigned(a.trend.noise[0], ' %') + ' y ' + gsigned(a.trend.noise[1], ' %') + '), con la pendiente de los últimos 112 días y ' + a.trend.weeks + ' semanas. El ruido sale de barajar bloques de 4 semanas seguidas, que conservan que una semana se parece a la anterior.' : 'Tendencia: faltan resultados en los últimos 112 días (hacen falta al menos 68 y 10 semanas con datos).',
  ];
}

/** Cards in verdict order: what needs a look first. A game without a readable verdict goes last. */
export const cardOrder = (s: Summary): string[] => attentionOrder(s.games);

/** The hub hero: the span of the record (footer) and, when the manual log has lapsed, a pill with the last record beside the title. No streak and no record: a log is not a score. */
export function gamesHero(s: Summary, now = Date.now()) {
  if (!Object.keys(s.games).length) return { since: '', meta: 'Aún no hay datos.', days: '—' };
  if (typeof s.days !== 'number') throw new TypeError('summary.days is not a number');
  const days = gdays(s.days) + ' registrados · ' + fmtDate(s.from) + ' → ' + fmtDate(s.to);
  if ((s.playStreak?.current ?? 0) > 0) return { since: '', meta: '', days };
  return { since: s.to ? 'Último registro: ' + shortDate(s.to, now) : '', meta: 'registro manual', days };
}

export const defaultTrajGame = (s: Summary): string => Object.keys(s.games).sort((a, b) => s.games[b].n - s.games[a].n)[0];

export function trajectory(s: Summary, game: string, range: Range) {
  const b = s.games[game].trajectory[range], weekly = range === '90' || range === 'all';
  if (!Array.isArray(b)) throw new Error('trajectory is not a list');
  // A wrong-typed value would reach the SVG as NaN: the whole chart degrades instead (the caller's safe()).
  const num = (v: unknown, nullable: boolean) => (nullable && v == null) || Number.isFinite(v);
  if (!b.every((p) => num(p?.n, false) && num(p.eff, true) && num(p.beat, true))) throw new TypeError('trajectory bucket is not numeric');
  return {
    buckets: b,
    caption: 'Datos de la trayectoria de ' + gameName(game) + ', ' + RANGE_NAMES[range] + ': un valor por ' + (weekly ? 'semana' : 'día') + '.',
    rows: b.map((p) => [(weekly ? 'Semana del ' : '') + p.start, p.eff == null ? '—' : effText(p.eff), p.beat == null ? '—' : gpct(p.beat), String(p.n)]),
    note: 'Cifras de ' + RANGE_NAMES[range] + ', un punto por ' + (weekly ? 'semana (lunes)' : 'día') + ', sin suavizar. Línea azul: cuánto más rápido que la media vas (la línea de puntos es la media). Línea verde: la parte de los días que le ganas a la media. Barras: partidas de cada ' + (weekly ? 'semana' : 'día') + '; un hueco es un periodo sin partidas.',
  };
}

/** A weekday with fewer results than this is not coloured nor named. */
export const MIN_LOSS_CELL = 8;
export function lossRows(s: Summary) {
  const keys = Object.keys(s.games).filter((k) => s.games[k].losses);
  if (!keys.length) return undefined;
  let worst: { k: string; c: LossCell } | null = null;
  const rows = keys.map((k) => {
    const l = s.games[k].losses;
    for (const c of l.cells) if (c.n >= MIN_LOSS_CELL && (!worst || c.rate! > worst.c.rate!)) worst = { k, c };
    return {
      k, name: gameName(k), near: l.losses ? Math.round(l.near / l.losses * 100) + ' %' : 'sin derrotas',
      cells: l.cells.map((c) => c.n >= MIN_LOSS_CELL
        ? { text: gpct(c.rate), n: c.n, level: c.rate! >= 0.5 ? 3 : c.rate! >= 0.25 ? 2 : c.rate! > 0 ? 1 : 0, title: c.losses + ' derrotas de ' + c.n + ' (entre el ' + Math.round(c.lo! * 100) + ' % y el ' + Math.round(c.hi! * 100) + ' %)' }
        : { text: '—', n: c.n, level: -1, title: 'Pocos datos (' + c.n + ')' }),
    };
  });
  const w = worst as { k: string; c: LossCell } | null;
  return { rows, days: DAYS.map((d) => d.slice(0, 3)), sentence: w ? `Donde más pierdes: ${gameName(w.k)} los ${DAYS[w.c.dow]} (${gpct(w.c.rate)}, ${w.c.n} partidas).` : 'Aún no hay ningún día con partidas suficientes para decir dónde pierdes más.' };
}

/** The first look: per game a verdict, the speed against the average as one big number, the change against the previous period, how often the average is beaten, and the last 14 results as bars. */
export function summaryRows(s: Summary, range: Range) {
  return cardOrder(s).flatMap((k) => { try { return [row(k)]; } catch { return []; } }); // a malformed game drops its own row only
  function row(k: string) {
    const x = s.games[k]!;
    const verdict = verdictOf(x), rate = x.windows[range].beat.rate;
    // with too little data the card shows the game count only: no percentage beside "Pocos datos"
    const beat = verdict.state === 'few-data' || rate == null ? '' : `Le ganas a la media en el ${Math.round(rate * 100)} % de las partidas`;
    return { k, name: gameName(k), verdict, bars: resultBars(x.series), beat, ...figures(x, range) };
  }
}

/** The big number of a game for a period: how much faster or slower than the LinkedIn average, and the change against the previous period (none when there is no previous one). */
export function figures(x: Game, range: Range) {
  const w = x.windows[range], m = w.eff.median, e = w.delta?.effRel?.value;
  return {
    big: m == null ? '—' : gsigned((m - 1) * 100, ' %'),
    cap: m == null ? 'aún sin media' : m > 1 ? 'más rápido que la media' : m < 1 ? 'más lento que la media' : 'igual que la media',
    delta: e == null ? '' : gsigned(e * 100, ' %') + ' frente al periodo anterior',
  };
}

const names = (n: string[]) => n.length < 2 ? n.join('') : n.slice(0, -1).join(', ') + ' y ' + n[n.length - 1];
/** "How you are doing": one sentence that names each game by its state, worst first. Null with no games. */
export function overview(rows: { name: string; verdict: Verdict }[]) {
  if (!rows.length) return null;
  const by = (f: (v: Verdict) => boolean) => rows.filter((r) => f(r.verdict)).map((r) => r.name).sort((a, b) => a.localeCompare(b, 'es'));
  const down = by((v) => v.dir === 'down'), flat = by((v) => v.state === 'no-signal'), few = by((v) => v.state === 'few-data'), up = by((v) => v.dir === 'up');
  return {
    sentence: [down.length && `${names(down)} ${down.length > 1 ? 'bajan' : 'baja'}`, up.length && `${names(up)} ${up.length > 1 ? 'mejoran' : 'mejora'}`,
      flat.length && `${names(flat)}, sin cambios`, few.length && `${names(few)}, pocos datos`].filter(Boolean).join('. ') + '.',
  };
}
