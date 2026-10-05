
export type EloStats = { count: number; min: number | null; max: number | null; avg: number | null; median: number | null; buckets: Record<string, number> };

export const ELO_BUCKETS: Array<{ key: string; test: (e: number) => boolean }> = [
  { key: "<700", test: (e) => e < 700 },
  { key: "700-799", test: (e) => e >= 700 && e < 800 },
  { key: "800-899", test: (e) => e >= 800 && e < 900 },
  { key: "900-999", test: (e) => e >= 900 && e < 1000 },
  { key: "1000-1099", test: (e) => e >= 1000 && e < 1100 },
  { key: "1100+", test: (e) => e >= 1100 },
];

// Critical: only non-null elos. Never null->0.
export function eloStats(elos: Array<number | null | undefined>): EloStats {
  const known = (elos as Array<unknown>).filter((e): e is number => typeof e === "number" && Number.isFinite(e));
  const buckets: Record<string, number> = {};
  for (const b of ELO_BUCKETS) buckets[b.key] = 0;
  if (known.length === 0) return { count: 0, min: null, max: null, avg: null, median: null, buckets };
  const sorted = [...known].sort((a, b) => a - b);
  const sum = known.reduce((a, b) => a + b, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid]! : ((sorted[mid - 1]! + sorted[mid]!) / 2);
  for (const e of known) for (const b of ELO_BUCKETS) if (b.test(e)) { buckets[b.key]!++; break; }
  return { count: known.length, min: sorted[0]!, max: sorted[sorted.length - 1]!, avg: sum / known.length, median, buckets };
}

export { resultOf, summarize } from "../domain/result.ts";

// Streaks over canonical chronological order (ordered by played_at ASC via allMatches).
export function streaks(results: Array<"win" | "loss" | "draw" | "unknown">) {
  let cur = 0, curKind: string | null = null, lw = 0, ll = 0, run = 0, runKind: string | null = null;
  for (const r of results) {
    if (r !== "win" && r !== "loss") { run = 0; runKind = null; if (curKind !== "draw-break") { cur = 0; curKind = null; } continue; }
    if (runKind === r) run++; else { run = 1; runKind = r; }
    if (r === "win") lw = Math.max(lw, run); else ll = Math.max(ll, run);
    if (curKind === r) cur++; else { cur = 1; curKind = r; }
  }
  return { currentStreak: cur, currentKind: curKind, longestWin: lw, longestLoss: ll };
}
