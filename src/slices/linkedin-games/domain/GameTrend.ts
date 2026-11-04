import { dayNo, efficiencyOf, median, type Obs } from "./GameAnalysis.ts";

// P1a, measurement only (design rev. 4: docs/audits/linkedin-games-p1-interpretation-design-2026-11-04.md, §3-§4).
// Two additive measures over a game's observations. They label nothing: interpretation is GameInterpretation.

export const TREND_DAYS = 112; // trend horizon
export const RECENT_DAYS = 28; // recent window
export const BASE_DAYS = 56; // baseline: the days before the recent window
export const COVERAGE = 0.6; // minimum share of days with an observation in each window (the calibration only holds with it)

export interface Trend112 { rho: number; slopePctPer28d: number; n: number; days: number }
export interface Recent28vBase56 { delta: number; nCur: number; nBase: number }

// Spearman's rho: Pearson correlation of the average ranks (ties share the mean of their ranks).
function ranks(v: number[]): number[] {
  const idx = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(v.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j++;
    for (let k = i; k <= j; k++) r[idx[k]![1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
}
export function spearman(x: number[], y: number[]): number {
  const a = ranks(x), b = ranks(y), n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const da = a[i]! - ma, db = b[i]! - mb; sab += da * db; saa += da * da; sbb += db * db; }
  return saa === 0 || sbb === 0 ? 0 : sab / Math.sqrt(saa * sbb); // a constant series has no trend: 0, not NaN
}

// Theil-Sen: the median of the slopes of every pair of points with different x.
export function theilSenSlope(x: number[], y: number[]): number {
  const s: number[] = [];
  for (let i = 0; i < x.length; i++) for (let j = i + 1; j < x.length; j++) if (x[j]! !== x[i]!) s.push((y[j]! - y[i]!) / (x[j]! - x[i]!));
  return median(s);
}

// Last 112 days (today-111 .. today). Needs >= 60 % of the days with an observation that has an average; otherwise null.
export function trend112(obs: Obs[], today: string): Trend112 | null {
  const t = dayNo(today), pts = obs.filter((o) => o.avg !== null && dayNo(o.date) > t - TREND_DAYS && dayNo(o.date) <= t);
  if (pts.length < COVERAGE * TREND_DAYS) return null;
  const x = pts.map((o) => dayNo(o.date) - (t - TREND_DAYS + 1)), y = pts.map((o) => Math.log(efficiencyOf(o)));
  return { rho: spearman(x, y), slopePctPer28d: (Math.exp(theilSenSlope(x, y) * 28) - 1) * 100, n: pts.length, days: TREND_DAYS };
}

// Median efficiency of the last 28 days against the 56 days before them (relative change). Needs 60 % coverage in both.
export function recent28vBase56(obs: Obs[], today: string): Recent28vBase56 | null {
  const t = dayNo(today), withAvg = obs.filter((o) => o.avg !== null);
  const cur = withAvg.filter((o) => dayNo(o.date) > t - RECENT_DAYS && dayNo(o.date) <= t).map(efficiencyOf);
  const base = withAvg.filter((o) => dayNo(o.date) > t - RECENT_DAYS - BASE_DAYS && dayNo(o.date) <= t - RECENT_DAYS).map(efficiencyOf);
  if (cur.length < COVERAGE * RECENT_DAYS || base.length < COVERAGE * BASE_DAYS) return null;
  const mc = median(cur), mb = median(base);
  return { delta: (mc - mb) / mb, nCur: cur.length, nBase: base.length };
}
