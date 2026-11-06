// Port of the LinkedIn Games view builders (src/dashboard.client.js:1787–1943). Pure: the range is a parameter, not a global.
// Nothing here is computed beyond formatting: labels, bands and arrows come from the server's contract.

export type Range = '7' | '28' | '90' | 'all';
export type Label = 'mejora_sostenida' | 'estable' | 'deterioro' | 'datos_insuficientes';
export interface Blk {
  eff: { median: number | null; nEff: number };
  beat: { rate: number | null; nBeat: number };
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
  n: number; best: { seconds: number; date: string }; beatStreak: { current: number; max: number };
  trend112: { rho: number | null; slopePctPer28d: number | null; n: number; days: number };
  recent28vBase56: { delta: number; nCur: number; nBase: number };
  interpretation: Interp; series: { roll: number }[];
  windows: Record<Range, Win>; trajectory: Record<Range, Bucket[]>;
}
export interface Summary { days: number; from: string | null; to: string | null; playStreak?: { current: number; max: number } | null; games: Record<string, Game> }
export interface Day { games?: Record<string, { score?: string | null; avg?: string | null; number?: number | null }> }

export const GAME_NAMES: Record<string, string> = { zip: 'Zip', tango: 'Tango', queens: 'Queens', mini_sudoku: 'Mini Sudoku', patches: 'Patches', wend: 'Wend' };
export const gameName = (k: string): string => GAME_NAMES[k] || k;
export const RANGES: { k: Range; l: string }[] = [{ k: '7', l: '7 d' }, { k: '28', l: '28 d' }, { k: '90', l: '90 d' }, { k: 'all', l: 'Todo' }];
export const RANGE_NAMES: Record<Range, string> = { '7': '7 días', '28': '28 días', '90': '90 días', all: 'todo el histórico' };

/** The browser's calendar day (sv-SE formats as YYYY-MM-DD), not UTC: a result logged at 01:00 belongs to today. */
export const localToday = (): string => new Date().toLocaleDateString('sv-SE');

const gnum = (v: number | null, d: number) => v == null ? '—' : v.toLocaleString('es-ES', { maximumFractionDigits: d });
export const gmmss = (s: number) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
export const gdays = (n: number) => n + (n === 1 ? ' día' : ' días');
const gpct = (r: number | null) => r == null ? '—' : Math.round(r * 100) + ' %';
// ponytail: the legacy ASCII "-" is kept, legacy tests pin "-13 %".
const gsigned = (v: number | null, suffix: string) => { if (v == null) return '—'; const r = Math.round(v); return (r > 0 ? '+' : '') + r + suffix; };
const gtime = (s: number | null) => s == null ? '—' : gmmss(Math.round(s));
const gsign = (v: number | null, d: number) => v == null ? '—' : (v > 0 ? '+' : '') + gnum(v, d);
const gband = (b: [number, number]) => gsigned(b[0] * 100, ' %') + ' a ' + gsigned(b[1] * 100, ' %');
export const effText = (v: number | null) => v == null ? '—' : '×' + gnum(v, 2);
export const beatText = gpct;

const ARROWS = { up: '↑', down: '↓', flat: '→' };
export const LABEL_TEXT: Record<Label, string> = { mejora_sostenida: 'Mejora sostenida', estable: 'Estable (sin cambio detectable)', deterioro: 'Deterioro', datos_insuficientes: 'Datos insuficientes' };
export const LABEL_CLASS: Record<Label, string> = { mejora_sostenida: 'pill-win', estable: '', deterioro: 'pill-warn', datos_insuficientes: 'pill-draw' };
const LABEL_ORDER: Record<Label, number> = { deterioro: 0, mejora_sostenida: 1, estable: 2, datos_insuficientes: 3 };

/** A manual log has no broken streak: with no record for 2+ days the run is 0 because nothing was recorded. */
const gbeatStreak = (x: Game, s: Summary) =>
  x.beatStreak.current > 0 || (s.playStreak && s.playStreak.current > 0) ? gdays(x.beatStreak.current) : (s.to ? 'sin registro desde ' + s.to : '—');

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
  if (b) out.push('Límites calibrados con datos hasta ' + i.calibratedThrough + '.');
  return out;
}

function deltaWhy(w: Win, range: Range): string {
  if (range === 'all') return 'Sin periodo anterior: es todo el histórico.';
  if (!w.prev) return 'Periodo anterior incompleto: el juego no tiene datos de todo ese periodo.';
  return 'Falta alguna observación en uno de los dos periodos.';
}
function deltaTitle(w: Win, range: Range): string | null {
  const e = w.delta && w.delta.effRel;
  if (!e || e.value == null) return deltaWhy(w, range);
  if (range !== '28') return null;
  if (e.arrow === 'flat') return 'Dentro del ruido de este juego (' + gband(e.band!) + ').';
  if (e.arrow) return 'Supera el ruido de este juego (fuera de ' + gband(e.band!) + ').';
  return 'Sin calibración o sin observaciones suficientes para interpretar este cambio.';
}
function deltaSr(w: Win, range: Range): string | null {
  const e = w.delta && w.delta.effRel;
  return range === '28' && e && e.value != null && e.arrow ? (e.arrow === 'flat' ? ' (dentro del ruido)' : e.arrow === 'up' ? ' (sube, fuera del ruido)' : ' (baja, fuera del ruido)') : null;
}

// Table columns: one source for the header, the cell text and the sort value. nulls always sort last.
type Val = string | number | null;
interface Col { k: string; l: string; v: (g: Game, w: Win, k: string) => Val; t: (g: Game, w: Win, k: string, s: Summary, range: Range) => string }
const GCOLS: Col[] = [
  { k: 'name', l: 'Juego', v: (g, w, k) => gameName(k), t: (g, w, k) => gameName(k) },
  { k: 'eff', l: 'Eficiencia', v: (g, w) => w.eff.median, t: (g, w) => w.eff.median == null ? '—' : '×' + gnum(w.eff.median, 2) + ' · n=' + w.eff.nEff },
  { k: 'beat', l: 'Gana a la media', v: (g, w) => w.beat.rate, t: (g, w) => w.beat.rate == null ? '—' : gpct(w.beat.rate) + ' · n=' + w.beat.nBeat },
  { k: 'delta', l: 'Δ eficiencia', v: (g, w) => w.delta ? w.delta.effRel.value : null, t: (g, w, k, s, range) => {
    const e = w.delta && w.delta.effRel; if (!e || e.value == null) return '—';
    return (range === '28' && e.arrow ? ARROWS[e.arrow] + ' ' : '') + gsigned(e.value * 100, ' %') + ' · n=' + e.nCur + '/' + e.nPrev; } },
  { k: 'time', l: 'Tiempo mediano (P25–P75)', v: (g, w) => w.time.median, t: (g, w) => w.time.median == null ? '—' : gtime(w.time.median) + ' (' + gtime(w.time.p25) + '–' + gtime(w.time.p75) + ') · n=' + w.time.nTime },
  { k: 'streak', l: 'Racha', v: (g) => g.beatStreak.current, t: (g, w, k, s) => gbeatStreak(g, s) },
  { k: 'n', l: 'n', v: (g, w) => w.time.nTime, t: (g, w) => String(w.time.nTime) },
];

export interface Sort { key: string; dir: 1 | -1 }
export const nextSort = (cur: Sort, key: string): Sort => cur.key === key ? { key, dir: -cur.dir as 1 | -1 } : { key, dir: key === 'name' ? 1 : -1 };
export interface Cell { text: string; title: string | null; sr: string | null; num: boolean }

export function gamesTable(s: Summary, range: Range, sort: Sort) {
  const head = GCOLS.map((c) => ({ k: c.k, l: c.l, aria: sort.key === c.k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none' }));
  const col = GCOLS.find((c) => c.k === sort.key) || GCOLS[1];
  const rows = Object.keys(s.games).map((k) => { const g = s.games[k]; return { k, g, w: g.windows[range] }; });
  rows.sort((a, b) => {
    const x = col.v(a.g, a.w, a.k), y = col.v(b.g, b.w, b.k);
    if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
    return (typeof x === 'string' ? x.localeCompare(y as string) : x - (y as number)) * sort.dir;
  });
  return {
    head,
    rows: rows.map((r) => ({ k: r.k, cells: GCOLS.map((c): Cell => ({
      text: c.t(r.g, r.w, r.k, s, range),
      title: c.k === 'delta' ? deltaTitle(r.w, range) : null,
      sr: c.k === 'delta' ? deltaSr(r.w, range) : null,
      num: c.k !== 'name',
    })) })),
  };
}

/** Polyline points of the 28-day rolling median, or '' with fewer than two points. */
export function gameSpark(series: { roll: number }[]): string {
  const v = series.map((p) => p.roll); if (v.length < 2) return '';
  const lo = Math.min(...v), hi = Math.max(...v), r = (hi - lo) || 1;
  return v.map((y, i) => (i / (v.length - 1) * 100).toFixed(1) + ',' + (22 - (y - lo) / r * 20).toFixed(1)).join(' ');
}

export function gameCard(k: string, x: Game, s: Summary, range: Range) {
  const w = x.windows[range], lb = x.interpretation.label, e = w.delta && w.delta.effRel;
  const dl = e && e.value != null ? gsigned(e.value * 100, ' %') + ' vs periodo previo (n=' + e.nCur + '/' + e.nPrev + ')' : 'sin periodo previo comparable';
  return {
    k, name: gameName(k), det: lb === 'deterioro', badge: LABEL_TEXT[lb], badgeClass: 'pill ' + LABEL_CLASS[lb],
    interp: interpretationLines(x),
    lines: [
      'Eficiencia (' + RANGE_NAMES[range] + '): ' + (w.eff.median == null ? '—' : '×' + gnum(w.eff.median, 2) + ' · n=' + w.eff.nEff + ' (' + dl + ')'),
      'Gana a la media: ' + (w.beat.rate == null ? '—' : gpct(w.beat.rate) + ' · n=' + w.beat.nBeat),
      'Tiempo típico: ' + (w.time.median == null ? '—' : gtime(w.time.median) + ' (P25–P75 ' + gtime(w.time.p25) + '–' + gtime(w.time.p75) + ') · n=' + w.time.nTime),
      'Mejor marca: ' + gmmss(x.best.seconds) + ' (' + x.best.date + ')',
      'Racha ganando a la media: ' + gbeatStreak(x, s) + ' (máx ' + x.beatStreak.max + ')',
    ],
    spark: gameSpark(x.series),
  };
}
export type GameCard = ReturnType<typeof gameCard>;
/** Cards in label priority: deterioration first. A game without a readable label goes last. */
export const cardOrder = (s: Summary): string[] =>
  Object.keys(s.games).sort((a, b) => (LABEL_ORDER[s.games[a]?.interpretation?.label] ?? 9) - (LABEL_ORDER[s.games[b]?.interpretation?.label] ?? 9));

/** Port of gamesStreakView (src/dashboard.client.js:828) for the hero. */
export function gamesHero(s: Summary) {
  if (!Object.keys(s.games).length) return { label: 'LinkedIn Games · racha actual', streak: '—', meta: 'Aún no hay datos.', days: '—' };
  if (typeof s.days !== 'number') throw new TypeError('summary.days is not a number');
  const cur = s.playStreak?.current ?? 0, max = s.playStreak?.max ?? 0;
  const maxTxt = max > 0 ? 'Racha máxima ' + gdays(max) : '';
  const days = gdays(s.days) + ' registrados · ' + s.from + ' → ' + s.to;
  if (cur > 0) return { label: 'LinkedIn Games · racha actual', streak: gdays(cur) + (cur === 1 ? ' seguido' : ' seguidos'), meta: maxTxt, days };
  return { label: 'LinkedIn Games · último registro', streak: s.to ? 'Sin registro desde ' + s.to : '—', meta: [maxTxt, 'registro manual'].filter(Boolean).join(' · '), days };
}

/** The game charted by default: the one with the most observations (first on a tie). */
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
    note: 'Periodo: ' + RANGE_NAMES[range] + '. Un punto por ' + (weekly ? 'semana (lunes)' : 'día') + ', valor sin suavizar. Azul: mediana de eficiencia (la línea de puntos es ×1, la media global). Verde: % que gana a la media. Barras: n por ' + (weekly ? 'semana' : 'día') + '; un hueco es un periodo sin observaciones.',
  };
}

/** One line of the modal's "Registrado ese día" list. */
export const dayLine = (k: string, e: { score?: string | null; avg?: string | null; number?: number | null } | null) =>
  gameName(k) + ': ' + (e?.score ?? '?') + (e?.avg ? '  (media ' + e.avg + ')' : '') + (e?.number ? '  #' + e.number : '');
