export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const low = Math.floor(idx);
  const high = Math.ceil(idx);
  const vLow = sorted[low] ?? 0;
  const vHigh = sorted[high] ?? 0;
  return vLow + (vHigh - vLow) * (idx - low);
}

export function median(values: number[]): number {
  return percentile(values, 50);
}

export function iqr(values: number[]): number {
  if (values.length === 0) return 0;
  return percentile(values, 75) - percentile(values, 25);
}
