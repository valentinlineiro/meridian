import { parseCalibration, type Calibration } from "../../src/domain/calibration.ts";
import artefact from "../../src/domain/calibration-elo-xp.json";

// A calibration with admitted edges, to exercise the rules above the "no band admitted" state the shipped artefact is in today.
// Built from the shipped artefact's shape; the bounds and admissions are test inputs, not calibration results.
export function withAdmitted(elo: Record<string, Record<number, number>>, xp: Record<string, Record<number, number>> = {}): Calibration {
  const a = JSON.parse(JSON.stringify(artefact));
  for (const [e, byK] of Object.entries(elo)) {
    for (const [k, bound] of Object.entries(byK)) { a.elo.edges[e][k] = { bound, uncertainty: 0.1 }; a.elo.admitted[e].push(Number(k)); }
  }
  for (const [e, byW] of Object.entries(xp)) {
    for (const [w, bound] of Object.entries(byW)) { a.xp.edges[e][w] = { bound, uncertainty: 0.1 }; a.xp.admitted[e].push(Number(w)); }
  }
  return parseCalibration(a);
}

export const ADMITTED = withAdmitted(
  { upper95: { 10: 74, 15: 92 }, upper99: { 10: 83, 15: 111 }, lower95: { 10: -62, 15: -68 }, lower99: { 10: -70, 15: -91 } },
  { upper95: { 7: 1.5 }, upper99: { 7: 2 } },
);
