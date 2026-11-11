import artefact from "./diagnosis-thresholds.json";
import { dayNo, percentile, type Obs } from "./GameAnalysis.ts";
import { dowOf, MIN_CELL, MIN_FIT } from "./AdjustedForm.ts";

// Phase 3 of the individual game report: what stands out in one game (docs/superpowers/specs/2026-11-11-games-report-phase3-methodology.md).
// Two competing dimensions, tested against the replicates calibrated offline (docs/audits/linkedin-games-phase3-calibration, copied as
// generated into diagnosis-thresholds.json; never edited by hand, never recalculated here). The statistics mirror calibrate.py.
export const MAX_AGE_DAYS = 28;   // a calibration older than this hides the whole block (it is never shown with a mere warning)
export const WATCH_P = 0.2;       // "next aspect to watch": 1 - p >= 0.8, an exploratory hint, not a finding
const MIN_LOSSES = 10;            // total losses needed to test the weekday, at every cut (an evaluability condition, not a guarantee of power)
const MIN_WINDOW = 20;            // results needed in each 56-day window to compare the spread
const WINDOW = 56;
const DIMS = ["weekday", "regularity"] as const;
export type Dimension = (typeof DIMS)[number];

export interface GameThresholds {
  evaluable: { weekday: boolean; regularity: boolean; weekdayReason: string | null; losses: number };
  replicates: [number, number][]; // joint replicates (weekday, regularity) under the null J, as generated
}
export interface DiagnosisThresholds {
  version: number; calibratedThrough: string; replicates: number; alpha: number; entropy: number; dimensions: string[];
  games: Record<string, GameThresholds>;
}

export interface Finding { dimension: Dimension; sign: 1 | -1; kind: "fortaleza" | "debilidad"; dow: number | null; pAdjusted: number }
export interface DimensionState { evaluable: boolean; reason: string | null; p: number | null }
export interface Watch { dimension: Dimension; p: number; unconfirmed: boolean }
export interface Diagnosis {
  status: "vigente" | "caducada" | "sin_calibracion";
  calibratedThrough: string | null;
  dimensions: Record<Dimension, DimensionState> | null;
  findings: Finding[]; // published: the same aspect, sign and day also stood a week earlier
  watch: Watch | null;
}

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const num = (v: unknown, where: string): number => { if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`diagnosis-thresholds.json: ${where} is not a finite number`); return v; };

/** Fails loudly if the artefact is malformed: a diagnosis from a broken calibration would be worse than none. */
export function parseDiagnosisThresholds(a: unknown): DiagnosisThresholds {
  const x = a as Partial<DiagnosisThresholds> | null;
  if (!x || x.version !== 2 || !isDate(x.calibratedThrough) || typeof x.games !== "object" || !x.games) throw new Error("diagnosis-thresholds.json: missing version 2, calibratedThrough or games");
  const R = num(x.replicates, "replicates"), alpha = num(x.alpha, "alpha");
  for (const [g, v] of Object.entries(x.games)) {
    const e = v?.evaluable;
    if (!e || typeof e.weekday !== "boolean" || typeof e.regularity !== "boolean") throw new Error(`diagnosis-thresholds.json: ${g}.evaluable`);
    const nothingToTest = !e.weekday && !e.regularity; // a game kept only to say why (e.g. no losses): it carries no replicates
    if (!Array.isArray(v.replicates) || (v.replicates.length !== R && !(nothingToTest && v.replicates.length === 0))) throw new Error(`diagnosis-thresholds.json: ${g} must carry ${R} replicates`);
    v.replicates.forEach((p, i) => { if (!Array.isArray(p) || p.length !== 2) throw new Error(`diagnosis-thresholds.json: ${g}.replicates[${i}] is not a pair`); p.forEach((n, k) => num(n, `${g}.replicates[${i}][${k}]`)); });
  }
  return { ...(x as DiagnosisThresholds), replicates: R, alpha };
}
export const DIAGNOSIS_THRESHOLDS: DiagnosisThresholds = parseDiagnosisThresholds(artefact);

export interface DiagnosisStats {
  weekday: { stat: number; dow: number; diff: number } | null; // max over the days with at least MIN_CELL results of |loss rate of the day - overall|
  regularity: { stat: number; diff: number } | null;           // change of log(P75/P25): last 56 days vs the 56 before
  losses: number;                                                // results that did not beat the average
}

/** The statistics of one game with the data up to `to`. A loss is an efficiency <= 1; a day below MIN_CELL results can never be chosen. */
export function diagnosisStats(obs: Obs[], to: string): DiagnosisStats {
  const rows = obs.filter((o) => o.date <= to);
  if (!rows.length) return { weekday: null, regularity: null, losses: 0 };
  const first = dayNo(rows.reduce((m, o) => (o.date < m ? o.date : m), rows[0]!.date));
  const origin = first - dowOf(rows.reduce((m, o) => (o.date < m ? o.date : m), rows[0]!.date)); // the Monday of the first week
  const toIdx = dayNo(to) - origin;
  const x = new Float64Array(toIdx + 1).fill(Number.NaN);
  for (const o of rows) if (o.avg !== null) x[dayNo(o.date) - origin] = o.avg / o.score;

  const n = new Array(7).fill(0), lost = new Array(7).fill(0);
  let total = 0, losses = 0;
  x.forEach((v, i) => { if (Number.isNaN(v)) return; n[i % 7]++; total++; if (v <= 1) { lost[i % 7]++; losses++; } });
  let weekday: DiagnosisStats["weekday"] = null;
  if (total) {
    const overall = losses / total;
    for (let d = 0; d < 7; d++) {
      if (n[d] < MIN_CELL) continue;
      const diff = lost[d] / n[d] - overall;
      if (!weekday || Math.abs(diff) > weekday.stat) weekday = { stat: Math.abs(diff), dow: d, diff }; // strictly greater: the first of equal days wins
    }
  }

  const window = (from: number, upto: number) => { const v: number[] = []; for (let i = Math.max(from, 0); i <= upto; i++) if (!Number.isNaN(x[i]!)) v.push(x[i]!); return v; };
  const spread = (v: number[]) => Math.log(percentile(v, 0.75) / percentile(v, 0.25));
  let regularity: DiagnosisStats["regularity"] = null;
  if (toIdx >= 2 * WINDOW - 1) {
    const last = window(toIdx - WINDOW + 1, toIdx), prev = window(toIdx - 2 * WINDOW + 1, toIdx - WINDOW);
    if (last.length >= MIN_WINDOW && prev.length >= MIN_WINDOW) { const diff = spread(last) - spread(prev); regularity = { stat: Math.abs(diff), diff }; }
  }
  return { weekday, regularity, losses };
}

const lowerBound = (s: number[], v: number) => { let lo = 0, hi = s.length; while (lo < hi) { const m = (lo + hi) >> 1; if (s[m]! < v) lo = m + 1; else hi = m; } return lo; };
const upperBound = (s: number[], v: number) => { let lo = 0, hi = s.length; while (lo < hi) { const m = (lo + hi) >> 1; if (s[m]! <= v) lo = m + 1; else hi = m; } return lo; };

/**
 * The exact permutation test over a pool of N = R + 1 elements (the data and the R joint replicates). p_k(i) = share of the pool at least as
 * extreme in dimension k; U(i) = min_k p_k(i); the adjusted p of dimension k = share of the pool with U <= p_k(data). Ties are counted, which
 * makes the test conservative. A dimension that cannot be tested has a constant statistic (p = 1) and can never produce a finding.
 */
export function adjust(obs: [number, number], reps: [number, number][], testable: [boolean, boolean]): { p: [number, number]; adjusted: [number, number] } {
  const N = reps.length + 1;
  const col = (k: 0 | 1) => [testable[k] ? obs[k] : 0, ...reps.map((r) => (testable[k] ? r[k] : 0))];
  const cols = [col(0), col(1)], sorted = cols.map((c) => [...c].sort((a, b) => a - b));
  const p = cols.map((c, k) => c.map((v) => (N - lowerBound(sorted[k]!, v)) / N));
  const U = p[0]!.map((a, i) => Math.min(a, p[1]![i]!)).sort((a, b) => a - b);
  const adj = (k: 0 | 1) => upperBound(U, p[k]![0]!) / N;
  return { p: [p[0]![0]!, p[1]![0]!], adjusted: [adj(0), adj(1)] };
}

/** The same aspect, the same sign and, for the weekday, the same day: otherwise a change of Monday for Friday would count as stable. */
export const publishable = (f: Finding, aWeekEarlier: Finding[]): boolean => aWeekEarlier.some((g) => g.dimension === f.dimension && g.sign === f.sign && g.dow === f.dow);

const r6 = (v: number) => Math.round(v * 1e6) / 1e6; // the replicates are stored with 6 decimals: compare like with like
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

interface Cut { reasons: [string | null, string | null]; testable: [boolean, boolean]; p: [number, number]; raw: Finding[] }

function cutAt(g: GameThresholds, obs: Obs[], to: string, alpha: number): Cut {
  const s = diagnosisStats(obs, to);
  // A cut with fewer than MIN_FIT results with an average is not a cut at all (as in the calibration): nothing at it can confirm a finding.
  const enough = obs.filter((o) => o.date <= to && o.avg !== null).length >= MIN_FIT;
  const lossesOk = s.losses >= MIN_LOSSES; // also at the cut a week earlier: with fewer losses it cannot confirm a weekday finding
  const testable: [boolean, boolean] = [enough && lossesOk && g.evaluable.weekday && s.weekday !== null, enough && g.evaluable.regularity && s.regularity !== null];
  const stat: [number, number] = [r6(s.weekday?.stat ?? 0), r6(s.regularity?.stat ?? 0)];
  const { p, adjusted } = adjust(stat, g.replicates, testable);
  const reasons: Cut["reasons"] = [
    testable[0] ? null : !enough ? "datos_insuficientes" : !g.evaluable.weekday ? g.evaluable.weekdayReason ?? "no_evaluable" : !lossesOk ? "sin_derrotas_suficientes" : "sin_dias_con_partidas_suficientes",
    testable[1] ? null : !enough ? "datos_insuficientes" : "historial_insuficiente",
  ];
  const raw: Finding[] = [];
  if (testable[0] && adjusted[0] <= alpha) { const sign = s.weekday!.diff > 0 ? 1 : -1; raw.push({ dimension: "weekday", sign, kind: sign > 0 ? "debilidad" : "fortaleza", dow: s.weekday!.dow, pAdjusted: adjusted[0] }); }
  if (testable[1] && adjusted[1] <= alpha) { const sign = s.regularity!.diff > 0 ? 1 : -1; raw.push({ dimension: "regularity", sign, kind: sign > 0 ? "debilidad" : "fortaleza", dow: null, pAdjusted: adjusted[1] }); } // wider spread = less regular
  return { reasons, testable, p, raw };
}

/**
 * What stands out in one game. `to` is the last recorded date (the windows hang from it, as in the calibration); `today` is only for the expiry.
 * The week-earlier cut reuses today's replicates: the null is calibrated on the data as they were, which is why it expires.
 */
export function diagnose(game: string, obs: Obs[], to: string, today: string, th: DiagnosisThresholds = DIAGNOSIS_THRESHOLDS): Diagnosis {
  const empty = (status: Diagnosis["status"]): Diagnosis => ({ status, calibratedThrough: th.calibratedThrough, dimensions: null, findings: [], watch: null });
  if (dayNo(today) - dayNo(th.calibratedThrough) > MAX_AGE_DAYS) return empty("caducada");
  const g = th.games[game];
  if (!g) return empty("sin_calibracion");

  const now = cutAt(g, obs, to, th.alpha), before = cutAt(g, obs, addDays(to, -7), th.alpha);
  const findings = now.raw.filter((f) => publishable(f, before.raw));
  const published = new Set(findings.map((f) => f.dimension));
  const watch = DIMS.map((d, k): Watch | null => (now.testable[k] && !published.has(d) && now.p[k]! <= WATCH_P ? { dimension: d, p: now.p[k]!, unconfirmed: now.raw.some((f) => f.dimension === d) } : null))
    .filter((w): w is Watch => w !== null).sort((a, b) => a.p - b.p)[0] ?? null;
  const state = (k: 0 | 1): DimensionState => ({ evaluable: now.testable[k], reason: now.reasons[k], p: now.testable[k] ? now.p[k] : null });
  return { status: "vigente", calibratedThrough: th.calibratedThrough, dimensions: { weekday: state(0), regularity: state(1) }, findings, watch };
}
