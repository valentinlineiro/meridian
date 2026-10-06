// Uncertainty of a proportion. Pure and Chess-agnostic.

export const Z_95 = 1.96; // fixed on purpose: two consumers must never read the same rate at different confidence levels

// Wilson score interval for wins/n, as fractions in [0, 1]. No rounding. Null when n = 0 (no estimate, like winRate).
export function wilson(wins: number, n: number): { p: number; lower: number; upper: number } | null {
  if (!Number.isInteger(n) || n < 0 || !Number.isInteger(wins) || wins < 0 || wins > n) throw new RangeError(`invalid proportion ${wins}/${n}`);
  if (n === 0) return null;
  const p = wins / n, z2 = Z_95 * Z_95, k = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / k;
  const half = (Z_95 * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / k;
  // The formula is exact at the edges; clamp only floating-point residue.
  return { p, lower: wins === 0 ? 0 : Math.max(0, centre - half), upper: wins === n ? 1 : Math.min(1, centre + half) };
}

export interface Delta { diff: number; lower: number; upper: number }

// Newcombe (1998, method 10) interval for a.p − b.p between two independent groups, built on Wilson. Null if either group is empty.
export function newcombeDiff(a: { wins: number; n: number }, b: { wins: number; n: number }): Delta | null {
  const x = wilson(a.wins, a.n), y = wilson(b.wins, b.n);
  if (!x || !y) return null;
  const diff = x.p - y.p;
  return {
    diff,
    lower: diff - Math.sqrt((x.p - x.lower) ** 2 + (y.upper - y.p) ** 2),
    upper: diff + Math.sqrt((x.upper - x.p) ** 2 + (y.p - y.lower) ** 2),
  };
}

// The interval excludes 0 (strictly). Null never is: no data is not evidence.
export const distinguishable = (d: Delta | null) => d !== null && (d.lower > 0 || d.upper < 0);

export const scaleDelta = (d: Delta | null, k: number): Delta | null => d && { diff: d.diff * k, lower: d.lower * k, upper: d.upper * k };
