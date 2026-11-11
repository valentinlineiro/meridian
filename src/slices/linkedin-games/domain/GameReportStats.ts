import { efficiencyOf as eff, median, percentile, type Obs } from "./GameAnalysis.ts";
import { dowOf } from "./AdjustedForm.ts";

// Phase 2 of the individual game report (docs/superpowers/specs/2026-11-10-games-individual-report-design.md §5): aggregations the
// report needs that the earlier summary did not carry. All additive. Efficiency = avg / own time; a day "saves" avg - own seconds.
const DAY_MS = 86_400_000;
const mondayOf = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - dowOf(date) * DAY_MS).toISOString().slice(0, 10);

export interface WeekPoint { weekStart: string; n: number; nWithAvg: number; medianSec: number; medianAvgSec: number | null; medianEff: number | null }
export interface Savings { medianSec: number; totalSec: number; n: number }
export interface EffSpread { p25: number; p75: number; ratio: number; n: number }
export interface OutlierDay { date: string; eff: number }
export interface Outliers { n: number; minN: number; good: OutlierDay[]; bad: OutlierDay[] }

// A convention, not a calibrated threshold: the modified z-score (median and MAD) of ln(efficiency), flagged beyond 3.5 (Iglewicz & Hoaglin),
// and only with enough days for the median and MAD to mean something. Revisit with real data if phase 3 calibrates it.
export const OUTLIER_Z = 3.5;
export const OUTLIER_MIN_N = 20;

export function weekly(obs: Obs[]): WeekPoint[] {
  const byWeek = new Map<string, Obs[]>();
  for (const o of obs) (byWeek.get(mondayOf(o.date)) ?? byWeek.set(mondayOf(o.date), []).get(mondayOf(o.date))!).push(o);
  return [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([weekStart, list]) => {
    const withAvg = list.filter((o) => o.avg !== null);
    return {
      weekStart, n: list.length, nWithAvg: withAvg.length, medianSec: median(list.map((o) => o.score)),
      medianAvgSec: withAvg.length ? median(withAvg.map((o) => o.avg!)) : null,
      medianEff: withAvg.length ? median(withAvg.map(eff)) : null,
    };
  });
}

export function savings(obs: Obs[]): Savings | null {
  const d = obs.filter((o) => o.avg !== null).map((o) => o.avg! - o.score);
  return d.length ? { medianSec: median(d), totalSec: d.reduce((a, b) => a + b, 0), n: d.length } : null;
}

export function effSpread(obs: Obs[]): EffSpread | null {
  const e = obs.filter((o) => o.avg !== null).map(eff);
  if (!e.length) return null;
  const p25 = percentile(e, 0.25), p75 = percentile(e, 0.75);
  return { p25, p75, ratio: p75 / p25, n: e.length };
}

export function outliers(obs: Obs[]): Outliers {
  const withAvg = obs.filter((o) => o.avg !== null);
  const out: Outliers = { n: withAvg.length, minN: OUTLIER_MIN_N, good: [], bad: [] };
  if (withAvg.length < OUTLIER_MIN_N) return out;
  const logs = withAvg.map((o) => Math.log(eff(o))), m = median(logs), mad = median(logs.map((x) => Math.abs(x - m)));
  if (mad === 0) return out; // no spread: nothing is unusual
  withAvg.forEach((o, i) => {
    const z = (0.6745 * (logs[i]! - m)) / mad;
    if (Math.abs(z) > OUTLIER_Z) (z > 0 ? out.good : out.bad).push({ date: o.date, eff: eff(o) });
  });
  return out;
}
