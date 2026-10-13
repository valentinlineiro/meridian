// A5 (docs/contracts/2026-10-06-discarded-signals-contract.md §13.2.1): XP exists per UTC calendar day, so a window's XP is defined
// only over the days entirely inside (since, until]. The days holding `since` and `until` are partial unless the edge is a midnight.
const DAY_MS = 86_400_000;

export interface ContainedDays {
  firstDaySec: number; // start of the first contained day (epoch seconds)
  count: number; // contained days, with or without a row
  partialDaysExcluded: number; // 0..2
}

export function containedUtcDays(since: string, until: string): ContainedDays {
  const s = new Date(since).getTime(), u = new Date(until).getTime();
  const first = Math.ceil(s / DAY_MS);
  const partial = new Set<number>();
  if (s % DAY_MS !== 0) partial.add(Math.floor(s / DAY_MS));
  if (u % DAY_MS !== 0) partial.add(Math.floor(u / DAY_MS));
  return { firstDaySec: first * 86_400, count: Math.max(0, Math.floor(u / DAY_MS) - first), partialDaysExcluded: partial.size };
}

// Last whole UTC day that ends at or before `since`: the reference ends there, so no day is in both the interval and the reference.
export function lastReferenceDaySec(since: string): number {
  return Math.floor(new Date(since).getTime() / DAY_MS) * 86_400 - 86_400;
}
