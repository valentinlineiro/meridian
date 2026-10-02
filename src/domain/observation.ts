// Source-agnostic core: what was measured, what "better" means, and how a measure moved between two periods.
// Knows nothing about any source, game or course; interpretation (claims, thresholds) lives elsewhere.

export interface Observation {
  key: string; // natural key within its source, used for dedupe
  source: string;
  observedAt: string; // ISO
  measures: Record<string, number>;
}

export interface MeasureSpec {
  measure: string;
  unit: string;
  direction: "higher" | "lower"; // which way is "better"
}

export interface WindowDelta {
  before: number | null;
  after: number | null;
  delta: number | null;
  verdict: "better" | "worse" | "unchanged" | null;
}

// Mean of the measure over the observations that carry it; null when none do.
function mean(obs: readonly Observation[], measure: string): number | null {
  const values = obs.flatMap((o) => (measure in o.measures ? [o.measures[measure] as number] : []));
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

export function windowDelta(before: readonly Observation[], after: readonly Observation[], spec: MeasureSpec): WindowDelta {
  const a = mean(before, spec.measure);
  const b = mean(after, spec.measure);
  if (a === null || b === null) return { before: a, after: b, delta: null, verdict: null };
  const delta = b - a;
  const sign = spec.direction === "higher" ? delta : -delta;
  return { before: a, after: b, delta, verdict: sign > 0 ? "better" : sign < 0 ? "worse" : "unchanged" };
}
