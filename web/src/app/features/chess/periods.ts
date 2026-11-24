import { Choice } from '../../shared/segmented';
import { Tally, WeekBucket } from './weekly.model';

export type PeriodKey = '30d' | '90d' | '1y' | 'all';

export const PERIODS: readonly Choice[] = [
  { k: '30d', l: '30 días' }, { k: '90d', l: '90 días' }, { k: '1y', l: '1 año' }, { k: 'all', l: 'Todo' },
];

/** Below this many decided games a point is shown dimmed ("pocas partidas") and never ranked as a strength or weakness. */
export const MIN_GAMES = 8;

const DAY = 864e5;
const DAYS: Record<Exclude<PeriodKey, 'all'>, number> = { '30d': 30, '90d': 90, '1y': 365 };

/**
 * The weeks of the chosen period and of the same-length period right before it. A week belongs to a period when its Monday (UTC)
 * is on or after the start of the UTC day `days` ago, so the oldest week can be partial. `all` has no previous period.
 */
export function sliceWeeks(weeks: readonly WeekBucket[], key: PeriodKey, now: Date): { current: WeekBucket[]; previous: WeekBucket[] } {
  if (key === 'all') return { current: [...weeks], previous: [] };
  const days = DAYS[key];
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const cutoff = startOfToday - days * DAY;
  const monday = (w: WeekBucket) => Date.parse(w.week);
  return {
    current: weeks.filter((w) => monday(w) >= cutoff),
    previous: weeks.filter((w) => monday(w) >= cutoff - days * DAY && monday(w) < cutoff),
  };
}

export function sumTally(ts: readonly Tally[]): Tally {
  return ts.reduce((a, t) => ({ w: a.w + t.w, d: a.d + t.d, l: a.l + t.l, u: a.u + t.u, disconnections: a.disconnections + t.disconnections }),
    { w: 0, d: 0, l: 0, u: 0, disconnections: 0 });
}

/** Win rate over decided games (unknown results stay out). `competitive` also drops the losses caused by the owner's disconnection. */
export function winRate(t: Tally, competitive = false): { n: number; rate: number | null } {
  const n = t.w + t.d + t.l - (competitive ? t.disconnections : 0);
  return { n, rate: n > 0 ? t.w / n : null };
}

export interface Point { kind: 'color' | 'opening' | 'long'; label: string; n: number; rate: number; delta: number }

const COLOR_LABEL: Record<string, string> = { white: 'Con blancas', black: 'Con negras' };
const LONG_LABEL = 'Partidas largas (más de 80 jugadas)';

/** Strengths and weaknesses of a period: each point against the period's own competitive win rate (delta in percentage points). */
/** `all` has every point with a rate, ranked or not: one exactly at the period average is neither strong nor weak but still belongs in its own block. */
export function rankPoints(current: readonly WeekBucket[]): { strong: Point[]; weak: Point[]; sparse: Point[]; all: Point[] } {
  const out = { strong: [] as Point[], weak: [] as Point[], sparse: [] as Point[], all: [] as Point[] };
  const base = winRate(sumTally(current.map((w) => w.total)), true).rate;
  if (base === null) return out;

  const group = (pick: (w: WeekBucket) => Record<string, Tally>) => {
    const acc = new Map<string, Tally[]>();
    for (const w of current) for (const [k, t] of Object.entries(pick(w))) (acc.get(k) ?? acc.set(k, []).get(k)!).push(t);
    return [...acc.entries()].filter(([k]) => k !== 'unknown').map(([k, ts]) => [k, sumTally(ts)] as const);
  };
  const candidates: [Point['kind'], string, Tally][] = [
    ...group((w) => w.byColor).map(([k, t]) => ['color', COLOR_LABEL[k] ?? k, t] as [Point['kind'], string, Tally]),
    ...group((w) => w.byFamily).map(([k, t]) => ['opening', k, t] as [Point['kind'], string, Tally]),
    ...group((w) => w.byPhase).filter(([k]) => k === 'endgame').map(([, t]) => ['long', LONG_LABEL, t] as [Point['kind'], string, Tally]),
  ];
  for (const [kind, label, t] of candidates) {
    const { n, rate } = winRate(t, true);
    if (rate === null) continue;
    const p: Point = { kind, label, n, rate, delta: (rate - base) * 100 };
    out.all.push(p);
    if (n < MIN_GAMES) out.sparse.push(p);
    else if (p.delta > 0) out.strong.push(p);
    else if (p.delta < 0) out.weak.push(p);
  }
  out.strong.sort((a, b) => b.delta - a.delta);
  out.weak.sort((a, b) => a.delta - b.delta);
  return out;
}

/**
 * The ELO a period ends on and how far it moved. The change is measured from where the previous period ended; with no previous
 * period (or none with ELO) it is measured from the first ELO of the period itself. Weeks without ELO are skipped.
 */
export function eloTrend(current: readonly WeekBucket[], previous: readonly WeekBucket[]): { now: number | null; delta: number | null } {
  const known = (ws: readonly WeekBucket[]) => ws.map((w) => w.eloEnd).filter((e): e is number => e != null);
  const cur = known(current), prev = known(previous);
  if (!cur.length) return { now: null, delta: null };
  const now = cur[cur.length - 1]!;
  const start = prev.length ? prev[prev.length - 1]! : cur.length > 1 ? cur[0]! : null;
  return { now, delta: start == null ? null : now - start };
}
