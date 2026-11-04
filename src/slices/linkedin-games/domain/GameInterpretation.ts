import type { Delta } from "./GameAnalysis.ts";
import type { GameBands } from "./NoiseBands.ts";
import type { Recent28vBase56, Trend112 } from "./GameTrend.ts";

// P1b, interpretation (design rev. 4, §2-§3). Pure and deterministic: it receives measures and bands and returns labels.
// It never modifies a P0 measure and recalculates no band.
export type Label = "mejora_sostenida" | "estable" | "deterioro" | "datos_insuficientes";
export type Arrow = "up" | "down" | "flat" | null;
export type Reason = "reciente" | "sostenido" | "sin_calibracion" | "cobertura_insuficiente";
export interface Candidate { label: Label; reason: Reason | null }
export interface Published { label: Label; reason: Reason | null; pending: Label | null }

export const MIN_ARROW_OBS = 17; // ceil(0.6 * 28): both 28-day windows need this many observations with an average

// Candidate label at one date. Priority: datos insuficientes > deterioro > mejora sostenida > estable.
// A sustained trend needs BOTH a Spearman rho beyond its limit AND a Theil-Sen slope of the same sign; if they disagree
// no sustained trend is declared. A recent drop is the 28-day median against the 56 days before it, below its lower limit.
export function candidate(trend: Trend112 | null, recent: Recent28vBase56 | null, bands: GameBands | null): Candidate {
  if (!bands) return { label: "datos_insuficientes", reason: "sin_calibracion" };
  if (!trend || !recent) return { label: "datos_insuficientes", reason: "cobertura_insuficiente" };
  const recentDrop = recent.delta < bands["28v56"][0];
  const trendDown = trend.rho < bands.rho112[0] && trend.slopePctPer28d < 0;
  const trendUp = trend.rho > bands.rho112[1] && trend.slopePctPer28d > 0;
  if (recentDrop || trendDown) return { label: "deterioro", reason: recentDrop ? "reciente" : "sostenido" };
  if (trendUp) return { label: "mejora_sostenida", reason: null };
  return { label: "estable", reason: null };
}

// Option B: a sustained improvement or a deterioration is published only when the same candidate holds today and one week
// earlier (same data, evaluated at today - 7 days). Otherwise it stays "estable" and `pending` names the unconfirmed one.
// Insufficient data is published as it is; without data a week ago there is nothing to confirm against.
export function publish(now: Candidate, weekAgo: Candidate): Published {
  if (now.label === "datos_insuficientes") return { label: now.label, reason: now.reason, pending: null };
  if (now.label === "estable") return { label: "estable", reason: null, pending: null };
  if (weekAgo.label === now.label) return { label: now.label, reason: now.reason, pending: null };
  return { label: "estable", reason: null, pending: now.label };
}

// Arrow of the 28-day comparison against its calibrated band. null without calibration, without both windows covered
// or without a comparable previous period. Never used for 7 d, 90 d or "Todo".
export function arrow28(effRel: Delta, bands: GameBands | null): Arrow {
  if (!bands || effRel.value === null || effRel.nCur < MIN_ARROW_OBS || effRel.nPrev < MIN_ARROW_OBS) return null;
  return effRel.value > bands["28"][1] ? "up" : effRel.value < bands["28"][0] ? "down" : "flat";
}
