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
