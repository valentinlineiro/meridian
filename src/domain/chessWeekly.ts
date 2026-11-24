import { resultOf } from "./result.ts";

// Weekly chess aggregates: pure fold of pre-grouped rows (the SQL groups, this counts with the one result classifier).

/** One grouped SQL row: `n` games sharing every other field. `disconnection` is 0|1; `week` is the Monday (YYYY-MM-DD, UTC) or null when undated. */
export interface WeeklyRow {
  week: string | null; color: string | null; family: string | null; phase: string | null;
  result: string | null; outcome: string | null; disconnection: number; n: number;
}

/** `l` includes disconnection losses; `disconnections` is that subset; `u` is results that could not be classified. */
export interface Tally { w: number; d: number; l: number; u: number; disconnections: number }

export interface WeekBucket {
  week: string; games: number; total: Tally;
  byColor: Record<string, Tally>; byFamily: Record<string, Tally>; byPhase: Record<string, Tally>;
  eloEnd: number | null;
}

export interface Weekly { weeks: WeekBucket[]; undated: Tally & { games: number } }

const empty = (): Tally => ({ w: 0, d: 0, l: 0, u: 0, disconnections: 0 });

function add(t: Tally, kind: ReturnType<typeof resultOf>, disconnection: boolean, n: number) {
  if (kind === "win") t.w += n;
  else if (kind === "draw") t.d += n;
  else if (kind === "loss") { t.l += n; if (disconnection) t.disconnections += n; }
  else t.u += n;
}

function bump(map: Record<string, Tally>, key: string | null, kind: ReturnType<typeof resultOf>, disconnection: boolean, n: number) {
  add((map[key ?? "unknown"] ??= empty()), kind, disconnection, n);
}

export function foldWeekly(rows: readonly WeeklyRow[], eloByWeek: ReadonlyMap<string, number>): Weekly {
  const byWeek = new Map<string, WeekBucket>();
  const undated = { games: 0, ...empty() };
  for (const r of rows) {
    const kind = resultOf({ result: r.result, outcome: r.outcome });
    const disc = r.disconnection === 1;
    if (r.week === null) { undated.games += r.n; add(undated, kind, disc, r.n); continue; }
    let b = byWeek.get(r.week);
    if (!b) byWeek.set(r.week, b = { week: r.week, games: 0, total: empty(), byColor: {}, byFamily: {}, byPhase: {}, eloEnd: eloByWeek.get(r.week) ?? null });
    b.games += r.n;
    add(b.total, kind, disc, r.n);
    bump(b.byColor, r.color, kind, disc, r.n);
    bump(b.byFamily, r.family, kind, disc, r.n);
    bump(b.byPhase, r.phase, kind, disc, r.n);
  }
  return { weeks: [...byWeek.values()].sort((a, b) => a.week.localeCompare(b.week)), undated };
}
