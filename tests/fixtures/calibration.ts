import type { Calibration } from "../../src/domain/calibration.ts";

// A calibration with admitted edges, to exercise the rules above the "no band admitted" state the shipped artefact is in today.
// The numbers are test inputs, not calibration results.
export const ADMITTED: Calibration = {
  calibratedThrough: "2026-01-01",
  elo: { kMax: 20, bounds: { upper95: { 10: 74, 15: 92 }, upper99: { 10: 83, 15: 111 }, lower95: { 10: -62, 15: -68 }, lower99: { 10: -70, 15: -91 } } },
  xp: { 7: { upper95: 1.5, upper99: 2 } },
};
