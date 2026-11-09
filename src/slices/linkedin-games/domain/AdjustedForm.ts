import { dayNo, median, percentile, type Obs, type RangeKey } from "./GameAnalysis.ts";
import { COVERAGE, TREND_DAYS, theilSenSlope } from "./GameTrend.ts";

// Form adjusted for the difficulty of the day, difficulty of the day and loss map
// (design: docs/audits/linkedin-games-adjusted-form-design-2026-11-09.md).
// The published average moves with the weekday (x3.7 from Monday to Sunday) and the player's time moves less (x2.4): efficiency and
// "beats the average" therefore measure part difficulty. Here the player's own time is explained by the average with a robust fit.

export const MIN_FIT = 60; // observations with an average needed to fit a game
export const MIN_CELL = 8; // results per game and weekday needed to classify a day or to colour a loss cell
export const MIN_WEEKS = 10; // non-empty weeks (of 16) needed for a trend
export const NEAR_MISS = 1.15; // a loss within 15 % of the average
const BOOTSTRAP = 1000;
export const BLOCK_WEEKS = 4; // moving-block length: one month, longer than the weekly dependence seen in the data (design §3.A)
const WEEKS = TREND_DAYS / 7;

/** Monday = 0 … Sunday = 6. */
export const dowOf = (date: string): number => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

export type FormLabel = "mejora" | "deterioro" | "sin_cambio" | "pocos_datos";
export interface FormWindow { pct: number | null; n: number } // pct > 0: faster than the difficulty of those days predicted
export interface FormTrend { pctPer28d: number; noise: [number, number]; weeks: number } // pct < 0: faster; noise: what a series without trend produces
export interface AdjustedForm {
  label: FormLabel;
  elasticity: number | null; // slope of log(own time) on log(average): 1 would mean the difficulty fully passes through
  n: number;
  windows: Record<RangeKey, FormWindow>;
  trend: FormTrend | null;
}
export type Level = "facil" | "normal" | "duro";
export interface LossCell { dow: number; n: number; losses: number; rate: number | null; lo: number | null; hi: number | null }
export interface LossMap { cells: LossCell[]; losses: number; near: number }

const withAvg = (obs: Obs[]) => obs.filter((o): o is Obs & { avg: number } => o.avg !== null);

// Mulberry32: a fixed seed makes the interval reproducible (same data, same answer).
function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fit(obs: Obs[]): { a: number; b: number; resid: Map<string, number> } | null {
  const pts = withAvg(obs);
  if (pts.length < MIN_FIT) return null;
  const x = pts.map((o) => Math.log(o.avg)), y = pts.map((o) => Math.log(o.score));
  const b = theilSenSlope(x, y), a = median(y.map((v, i) => v - b * x[i]!));
  return { a, b, resid: new Map(pts.map((o, i) => [o.date, y[i]! - (a + b * x[i]!)])) };
}

// Theil-Sen of the weekly medians against the noise a series with no trend produces: the weekly medians (centred) are reshuffled in
// blocks of consecutive weeks, so the dependence between neighbouring weeks stays inside each block, and `noise` is the 2.5-97.5 %
// range of the slopes that come out. A trend outside it is a signal. A week without results stays an empty slot of the calendar: blocks are consecutive calendar weeks and the empty slots travel with them.
// Calibrated by simulation (design rev. 2, §3.A): with 16 weeks and blocks of 4, a series without trend gets a false label ~8 % of the
// time for weekly dependence 0 to 0.5 and ~16 % at 0.8; a trend of 5 % per 28 days is seen ~25 % of the time. Weekly resampling
// (blocks of 1) failed at 25-45 % false labels under dependence, and a residual bootstrap around the fitted line was too narrow.
function trendOf(obs: Obs[], resid: Map<string, number>, today: string, block: number): FormTrend | null {
  const t = dayNo(today), pts = withAvg(obs).filter((o) => dayNo(o.date) > t - TREND_DAYS && dayNo(o.date) <= t);
  if (pts.length < COVERAGE * TREND_DAYS) return null;
  const byWeek = new Map<number, number[]>();
  for (const o of pts) { const w = WEEKS - 1 - Math.floor((t - dayNo(o.date)) / 7); (byWeek.get(w) ?? byWeek.set(w, []).get(w)!).push(resid.get(o.date)!); }
  // One slot per calendar week; a week without results stays empty (NaN) so a block is always consecutive weeks of the calendar.
  const med = Array.from({ length: WEEKS }, (_, w) => (byWeek.has(w) ? median(byWeek.get(w)!) : NaN));
  const seen = med.filter(Number.isFinite).length;
  if (seen < MIN_WEEKS) return null;
  const centre = median(med.filter(Number.isFinite)), e = med.map((y) => y - centre);
  const slopeOf = (y: number[]) => { const xs: number[] = [], ys: number[] = []; y.forEach((v, i) => { if (Number.isFinite(v)) { xs.push(i); ys.push(v); } }); return theilSenSlope(xs, ys); };
  const pct = (v: number) => (Math.exp(v * 4) - 1) * 100;
  const L = Math.min(block, WEEKS), rand = rng(1), out: number[] = [];
  for (let i = 0; i < BOOTSTRAP; i++) {
    const star: number[] = [];
    while (star.length < WEEKS) { const st = Math.floor(rand() * (WEEKS - L + 1)); for (let k = 0; k < L && star.length < WEEKS; k++) star.push(e[st + k]!); }
    const sb = slopeOf(star);
    if (Number.isFinite(sb)) out.push(pct(sb));
  }
  if (out.length < BOOTSTRAP / 2) return null;
  return { pctPer28d: pct(slopeOf(med)), noise: [percentile(out, 0.025), percentile(out, 0.975)], weeks: seen };
}

export function adjustedForm(obs: Obs[], today: string, blockWeeks = BLOCK_WEEKS): AdjustedForm {
  const f = fit(obs), t = dayNo(today);
  const empty: Record<RangeKey, FormWindow> = { "7": { pct: null, n: 0 }, "28": { pct: null, n: 0 }, "90": { pct: null, n: 0 }, all: { pct: null, n: 0 } };
  if (!f) return { label: "pocos_datos", elasticity: null, n: withAvg(obs).length, windows: empty, trend: null };
  const windows = Object.fromEntries((["7", "28", "90", "all"] as const).map((k) => {
    const r = withAvg(obs).filter((o) => k === "all" || (dayNo(o.date) > t - Number(k) && dayNo(o.date) <= t)).map((o) => f.resid.get(o.date)!);
    return [k, { pct: r.length >= 4 ? (1 - Math.exp(median(r))) * 100 : null, n: r.length }];
  })) as Record<RangeKey, FormWindow>;
  const trend = trendOf(obs, f.resid, today, blockWeeks);
  const label: FormLabel = !trend ? "pocos_datos" : trend.pctPer28d < trend.noise[0] ? "mejora" : trend.pctPer28d > trend.noise[1] ? "deterioro" : "sin_cambio";
  return { label, elasticity: f.b, n: f.resid.size, windows, trend };
}

// Difficulty of a result: its published average against the tertiles of the same game on the same weekday (whole history).
export function classifier(obs: Obs[]): (o: Obs) => Level | null {
  const cells = new Map<number, number[]>();
  for (const o of withAvg(obs)) { const d = dowOf(o.date); (cells.get(d) ?? cells.set(d, []).get(d)!).push(Math.log(o.avg)); }
  const cuts = new Map([...cells].filter(([, v]) => v.length >= MIN_CELL).map(([d, v]) => [d, [percentile(v, 1 / 3), percentile(v, 2 / 3)] as const]));
  return (o) => {
    const c = cuts.get(dowOf(o.date));
    if (!c || o.avg === null) return null;
    const v = Math.log(o.avg);
    return v <= c[0] ? "facil" : v >= c[1] ? "duro" : "normal";
  };
}

/** The level most games of the day share; a tie is "normal". */
export function dayLevels(perGame: Obs[][]): Array<{ date: string; level: Level }> {
  const votes = new Map<string, Record<Level, number>>();
  for (const obs of perGame) {
    const cl = classifier(obs);
    for (const o of obs) {
      const l = cl(o);
      if (l) (votes.get(o.date) ?? votes.set(o.date, { facil: 0, normal: 0, duro: 0 }).get(o.date)!)[l]++;
    }
  }
  return [...votes].map(([date, v]): { date: string; level: Level } => {
    const top = Math.max(v.facil, v.normal, v.duro), winners = (["facil", "normal", "duro"] as const).filter((l) => v[l] === top);
    return { date, level: winners.length === 1 ? winners[0]! : "normal" };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

// Wilson 95 % interval of a proportion.
function wilson(k: number, n: number): [number, number] {
  const z = 1.96, p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), h = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(c - h) / d, (c + h) / d];
}

/** Losses (own time not below the average) by weekday; a loss is "near" when the own time is under 15 % above the average. */
export function lossMap(obs: Obs[]): LossMap {
  const pts = withAvg(obs), lost = pts.filter((o) => o.score >= o.avg);
  return {
    losses: lost.length,
    near: lost.filter((o) => o.score / o.avg < NEAR_MISS).length,
    cells: Array.from({ length: 7 }, (_, dow) => {
      const mine = pts.filter((o) => dowOf(o.date) === dow), k = mine.filter((o) => o.score >= o.avg).length, n = mine.length;
      const [lo, hi] = n ? wilson(k, n) : [null, null];
      return { dow, n, losses: k, rate: n ? k / n : null, lo, hi };
    }),
  };
}
