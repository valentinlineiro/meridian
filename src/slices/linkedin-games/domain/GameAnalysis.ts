// Measurement over a game's observations: windows, time distribution, period comparison and trajectory buckets
// (design: docs/audits/linkedin-games-analysis-p0-design-2026-11-03.md). Measurement only: no labels, no thresholds.

export interface Obs { date: string; score: number; avg: number | null }

export const WINDOWS = [7, 28, 90] as const;
export type RangeKey = "7" | "28" | "90" | "all";

export interface EffBlock { median: number | null; nEff: number }
export interface BeatBlock { rate: number | null; k: number; nBeat: number }
export interface TimeBlock { median: number | null; p25: number | null; p75: number | null; nTime: number }
export interface Block { eff: EffBlock; beat: BeatBlock; time: TimeBlock }
export interface Delta { value: number | null; nCur: number; nPrev: number }
export interface WindowResult extends Block {
  prev: Block | null; // null when the previous window is not fully covered by the game's data (or there is none)
  delta: { effRel: Delta; beatPp: Delta; medianSec: Delta } | null;
}
export interface Bucket { start: string; n: number; eff: number | null; beat: number | null }

const DAY_MS = 86_400_000;
export const dayNo = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / DAY_MS);
const isoDay = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
const mondayOf = (n: number) => n - ((new Date(n * DAY_MS).getUTCDay() + 6) % 7);

export const median = (xs: number[]): number => percentile(xs, 0.5);
// R-7 (linear interpolation between neighbours), sorted copy; xs must not be empty.
export function percentile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b), h = (s.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
  return s[lo]! + (h - lo) * (s[hi]! - s[lo]!);
}
const orNull = (xs: number[], f: (xs: number[]) => number): number | null => (xs.length ? f(xs) : null);

export const efficiencyOf = (o: Obs) => o.avg! / o.score;
export const beats = (o: Obs) => o.avg !== null && o.score < o.avg;

export function block(obs: Obs[]): Block {
  const withAvg = obs.filter((o) => o.avg !== null), times = obs.map((o) => o.score);
  const k = withAvg.filter(beats).length;
  return {
    eff: { median: orNull(withAvg.map(efficiencyOf), median), nEff: withAvg.length },
    beat: { rate: withAvg.length ? k / withAvg.length : null, k, nBeat: withAvg.length },
    time: { median: orNull(times, median), p25: orNull(times, (x) => percentile(x, 0.25)), p75: orNull(times, (x) => percentile(x, 0.75)), nTime: times.length },
  };
}

const diff = (cur: number | null, prev: number | null, nCur: number, nPrev: number, f: (c: number, p: number) => number): Delta =>
  ({ value: cur !== null && prev !== null ? f(cur, prev) : null, nCur, nPrev });

function compare(cur: Block, prev: Block): NonNullable<WindowResult["delta"]> {
  return {
    effRel: diff(cur.eff.median, prev.eff.median, cur.eff.nEff, prev.eff.nEff, (c, p) => (c - p) / p),
    beatPp: diff(cur.beat.rate, prev.beat.rate, cur.beat.nBeat, prev.beat.nBeat, (c, p) => (c - p) * 100),
    medianSec: diff(cur.time.median, prev.time.median, cur.time.nTime, prev.time.nTime, (c, p) => c - p),
  };
}

// `obs` ascending by date. Window = (today-W, today]; previous = (today-2W, today-W], compared only when the game's data
// covers all of it (first observation on or before its first day). A day without play is not an observation.
export function windows(obs: Obs[], today: string): Record<RangeKey, WindowResult> {
  const t = dayNo(today), first = obs.length ? dayNo(obs[0]!.date) : Infinity;
  const within = (from: number, to: number) => obs.filter((o) => dayNo(o.date) > from && dayNo(o.date) <= to);
  const out = {} as Record<RangeKey, WindowResult>;
  for (const w of WINDOWS) {
    const cur = block(within(t - w, t));
    const prev = first <= t - 2 * w + 1 ? block(within(t - 2 * w, t - w)) : null;
    out[String(w) as RangeKey] = { ...cur, prev, delta: prev ? compare(cur, prev) : null };
  }
  out.all = { ...block(within(-Infinity, t)), prev: null, delta: null };
  return out;
}

// Dense axis built here: every bucket from max(window start, first observation) to today, empty ones as n=0 and null.
// 7 and 28 days by day, 90 and all by ISO week (Monday, UTC). Raw values, no smoothing; `n` counts observations with avg.
export function trajectory(obs: Obs[], today: string): Record<RangeKey, Bucket[]> {
  const t = dayNo(today), first = obs.length ? dayNo(obs[0]!.date) : Infinity;
  const build = (from: number, weekly: boolean): Bucket[] => {
    const key = (n: number) => (weekly ? mondayOf(n) : n);
    const groups = new Map<number, Obs[]>();
    for (const o of obs) { const n = dayNo(o.date); if (n >= from && n <= t) (groups.get(key(n)) ?? groups.set(key(n), []).get(key(n))!).push(o); }
    const out: Bucket[] = [];
    for (let b = key(from); b <= t; b += weekly ? 7 : 1) {
      const withAvg = (groups.get(b) ?? []).filter((o) => o.avg !== null);
      out.push({ start: isoDay(b), n: withAvg.length, eff: orNull(withAvg.map(efficiencyOf), median), beat: withAvg.length ? withAvg.filter(beats).length / withAvg.length : null });
    }
    return out;
  };
  const start = (w: number) => Math.max(t - w + 1, first);
  return { "7": build(start(7), false), "28": build(start(28), false), "90": build(start(90), true), all: build(first, true) };
}
