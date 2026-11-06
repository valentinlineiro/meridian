import { distinguishable, type Delta } from "./proportion.ts";
import { CALIBRATION, eloVerdict, xpVerdict, edgeCriteria, type Calibration } from "./calibration.ts";

export interface FindingContext {
  userId: string;
  baselineAt: string;
  until: string;
}

export interface ChessDeltas {
  gamesCount: number; // observed
  decidedCount: number; // usable evidence: the sample the thresholds below refer to
  ratingDelta: number | null;
  ratingGames: number | null; // A7: games between the two anchors of ratingDelta (the k of the calibration); null when unknown
  baselineRating: number | null;
  currentRating: number | null;
  intervalWinRate: number | null;
  intervalWhiteWinRate: number | null;
  intervalBlackWinRate: number | null;
  historicalWinRateDelta: number | null;
  // Percent, with a 95% interval. colorDelta = white − black in the interval; historicalDelta = interval − lifetime before `since`.
  colorDelta: Delta | null;
  historicalDelta: Delta | null;
}

export interface LanguagesDeltas {
  // A5: whole UTC days contained in the window (with or without a row), not elapsed time.
  intervalDays: number;
  observedDays: number; // of those, days with a row: the base of the interval's rate (provisional, §13.5)
  partialDaysExcluded: number;
  historicalObservedDays: number;
  historicalSpanDays: number | null; // descriptive coverage: no condition depends on it (O3)
  historicalSpanStart: string | null;
  xpGained: number;
  sessionsCount: number;
  totalSessionMinutes: number;
  baselineCourseId: string | null;
  currentCourseId: string | null;
  courseChanged: boolean;
  dailyXpRate: number;
  historicalDailyXpRate: number;
}

export interface StreakDeltas {
  baselineStreak: number | null;
  currentStreak: number | null;
  streakDelta: number | null;
  status: "active" | "broken";
  streakStarted: boolean;
  streakMilestone: number | null;
}

export interface WhatChangedDeltas {
  chess: ChessDeltas;
  languages: LanguagesDeltas;
  streak: StreakDeltas;
}

export interface Finding {
  id: string;
  category: "chess" | "languages" | "streak";
  title: string;
  claim: string;
  evidence: string;
  baselineAt: string;
  until: string;
  metrics: Record<string, number | string>;
}

// Why a rule did not emit. Reasons are the rule's evaluated conditions, not stages of an algorithm: all failing ones are reported,
// always in this canonical order (no semantic order between them). See docs/contracts/2026-10-06-discarded-signals-contract.md.
export const REASONS = [
  "insufficient_sample",
  "effect_below_threshold",
  "interval_includes_zero",
  "persistence_not_met",
  "span_too_short",
  "data_unavailable",
  "calibration_unavailable", // A7: the user's own history does not tell us the usual variation (ELO/XP rules only)
] as const;
export type Reason = (typeof REASONS)[number];

// The thresholds of each rule: the single source for the rule and for the criteria an evaluation carries (amendment A3).
export const CRITERIA = {
  CHESS_RATING_JUMP: { kMax: CALIBRATION.elo.kMax }, // A7: no fixed threshold; the limits come from the calibration artefact
  CHESS_COLOR_ASYMMETRY: { minDecided: 10, minDiffPp: 15 },
  LANG_XP_ACCELERATION: { minDays: 3 }, // A7: the 200 XP and 1.3x thresholds are gone; the limits come from the calibration artefact
  CHESS_COLOR_ASYMMETRY_LONGITUDINAL: { minDecidedPerColor: 40, minActiveDays: 60, minSpanDays: 60, minDiffPp: 15, minEraDiffPp: 10 },
} as const;

export interface Evaluation {
  id: string;
  kind: "statistical" | "threshold";
  status: "emitted" | "not_emitted";
  reasons: Reason[];
  metrics: Record<string, number | string>; // keeps the observed effect even when not emitted
  criteria: Record<string, number | string>; // the thresholds this rule applies, so a consumer can state them without copying them
}

// Derived from the evaluation alone: inconclusive = the effect was observed and reaches the threshold, and only the sample
// and/or the interval stand in the way.
export function salience(e: Evaluation): "finding" | "inconclusive" | "no_indication" {
  if (e.status === "emitted") return "finding";
  // A7: not knowing the usual variation is inconclusive only if an effect was observed; with no effect there is nothing to be unsure about.
  if (e.reasons.length === 1 && e.reasons[0] === "calibration_unavailable") return observedEffect(e) !== 0 ? "inconclusive" : "no_indication";
  return e.reasons.length > 0 && e.reasons.every((r) => r === "insufficient_sample" || r === "interval_includes_zero")
    ? "inconclusive"
    : "no_indication";
}

// The observed effect of a calibrated rule, from the evaluation alone: ELO points, or XP rate ratio − 1.
export function observedEffect(e: Evaluation): number {
  const m = e.metrics;
  if (typeof m.ratingDelta === "number") return m.ratingDelta;
  if (typeof m.ratio === "number") return m.ratio - 1;
  return 0;
}

export const canonical = (rs: Set<Reason>): Reason[] => REASONS.filter((r) => rs.has(r));
export const numeric = (o: Record<string, number | string | null | undefined>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined)) as Record<string, number | string>;

export function evaluateSignificantChanges(deltas: WhatChangedDeltas, context: FindingContext): Finding[] {
  return evaluateChanges(deltas, context).findings;
}

// One evaluation of every rule's conditions yields both the findings (exactly the emitted ones) and the evaluations.
// A8: numbers in finding text use the decimal comma, as the whole UI does (the metrics keep the raw number).
const es1 = (n: number): string => n.toFixed(1).replace(".", ",");

export function evaluateChanges(
  deltas: WhatChangedDeltas,
  context: FindingContext,
  cal: Calibration = CALIBRATION
): { findings: Finding[]; evaluations: Evaluation[] } {
  const findings: Finding[] = [];
  const evaluations: Evaluation[] = [];


  // 1. Chess rating jump (A7: outside the usual variation for k games, from the calibration artefact; unavailable beyond what it validates)
  {
    const delta = deltas.chess.ratingDelta;
    const why = new Set<Reason>();
    const k = deltas.chess.ratingGames;
    const v = delta === null ? null : k === null ? ({ available: false } as const) : eloVerdict(delta, k, cal);
    if (v === null) why.add("data_unavailable");
    else if (!v.available) why.add("calibration_unavailable");
    else if (!v.relevant) why.add("effect_below_threshold");
    const emitted = why.size === 0;
    const band = v && v.available ? numeric({ level: v.level ?? undefined, bandLower: v.lower, bandUpper: v.upper }) : {};
    evaluations.push({
      id: "CHESS_RATING_JUMP", kind: "threshold", status: emitted ? "emitted" : "not_emitted", reasons: canonical(why),
      metrics: { ...numeric({ ratingDelta: delta, games: k, baselineRating: deltas.chess.baselineRating, currentRating: deltas.chess.currentRating, gamesCount: deltas.chess.gamesCount }), ...band },
      criteria: { ...CRITERIA.CHESS_RATING_JUMP, ...edgeCriteria("elo", k, cal) },
    });
    if (emitted) {
      const sign = delta! > 0 ? "+" : "";
      findings.push({
        id: "CHESS_RATING_JUMP",
        category: "chess",
        title: "Salto de ELO",
        claim: `Tu ELO cambió ${sign}${delta} puntos en ${k} partidas, fuera de lo habitual.`,
        evidence: `Inicial: ${deltas.chess.baselineRating ?? "—"} → Final: ${deltas.chess.currentRating ?? "—"} (${deltas.chess.gamesCount} partidas jugadas).`,
        baselineAt: context.baselineAt,
        until: context.until,
        metrics: {
          ratingDelta: delta!,
          baselineRating: deltas.chess.baselineRating ?? 0,
          currentRating: deltas.chess.currentRating ?? 0,
          gamesCount: deltas.chess.gamesCount,
          ...band,
        },
      });
    }
  }

  // 2. Chess color asymmetry (decided games >= 10, |white - black| >= 15 pp, and the 95% interval of the difference excludes 0)
  {
    const c = deltas.chess, white = c.intervalWhiteWinRate, black = c.intervalBlackWinRate;
    const why = new Set<Reason>();
    if (c.decidedCount < CRITERIA.CHESS_COLOR_ASYMMETRY.minDecided) why.add("insufficient_sample");
    const diff = white !== null && black !== null ? Math.abs(white - black) : null;
    if (diff === null) why.add("data_unavailable");
    else if (diff < CRITERIA.CHESS_COLOR_ASYMMETRY.minDiffPp) why.add("effect_below_threshold");
    if (c.colorDelta === null) why.add("data_unavailable");
    else if (!distinguishable(c.colorDelta)) why.add("interval_includes_zero");
    const emitted = why.size === 0;
    evaluations.push({
      id: "CHESS_COLOR_ASYMMETRY", kind: "statistical", status: emitted ? "emitted" : "not_emitted", reasons: canonical(why),
      metrics: numeric({ decidedCount: c.decidedCount, whiteWinRate: white, blackWinRate: black, diffPp: diff, diffCiLower: c.colorDelta?.lower, diffCiUpper: c.colorDelta?.upper }),
      criteria: CRITERIA.CHESS_COLOR_ASYMMETRY,
    });
    if (emitted) {
      const better = white! > black! ? "blancas" : "negras";
      findings.push({
        id: "CHESS_COLOR_ASYMMETRY",
        category: "chess",
        title: "Asimetría por color",
        claim: `Mayor tasa de victorias con ${better}: ${es1(diff!)} pp de diferencia (IC95 [${c.colorDelta!.lower.toFixed(0)}, ${c.colorDelta!.upper.toFixed(0)}] pp, blancas − negras; excluye 0).`,
        evidence: `Blancas: ${es1(white!)} % · Negras: ${es1(black!)} % en ${c.decidedCount} partidas decididas.`,
        baselineAt: context.baselineAt,
        until: context.until,
        metrics: {
          whiteWinRate: white!,
          blackWinRate: black!,
          diffPp: diff!,
          diffCiLower: c.colorDelta!.lower,
          diffCiUpper: c.colorDelta!.upper,
        },
      });
    }
  }

  // 3. Language active course switch
  if (
    deltas.languages.courseChanged &&
    deltas.languages.baselineCourseId &&
    deltas.languages.currentCourseId
  ) {
    findings.push({
      id: "LANG_ACTIVE_COURSE_SWITCH",
      category: "languages",
      title: "Cambio de curso activo",
      claim: `Has cambiado tu curso de aprendizaje principal a ${deltas.languages.currentCourseId}.`,
      evidence: `Anterior: ${deltas.languages.baselineCourseId} → Actual: ${deltas.languages.currentCourseId}.`,
      baselineAt: context.baselineAt,
      until: context.until,
      metrics: {
        fromCourse: deltas.languages.baselineCourseId,
        toCourse: deltas.languages.currentCourseId,
      },
    });
  }

  // 4. Language XP acceleration (A7: rate ratio above the usual variation for the window length, from the calibration artefact; min 3 days)
  {
    const l = deltas.languages;
    const why = new Set<Reason>();
    if (l.intervalDays < CRITERIA.LANG_XP_ACCELERATION.minDays) why.add("span_too_short");
    // A5 §13.3: a rate over no day with a record is not defined (never "0 XP/day")
    if (l.observedDays === 0) why.add("data_unavailable");
    if (!(l.historicalDailyXpRate > 0)) why.add("data_unavailable");
    // A7 §15.8.7: only classify when the data to classify exist; otherwise the reasons above stand alone
    let v: ReturnType<typeof xpVerdict> | null = null;
    if (why.size === 0) {
      v = xpVerdict(l.dailyXpRate / l.historicalDailyXpRate, l.intervalDays, cal);
      if (!v.available) why.add("calibration_unavailable");
      else if (!v.relevant) why.add("effect_below_threshold");
    }
    const emitted = why.size === 0;
    const band = v && v.available ? numeric({ level: v.level ?? undefined, bandUpper: v.upper }) : {};
    evaluations.push({
      id: "LANG_XP_ACCELERATION", kind: "threshold", status: emitted ? "emitted" : "not_emitted", reasons: canonical(why),
      metrics: { ...numeric({
        intervalDays: l.intervalDays, xpGained: l.xpGained, dailyRate: l.observedDays > 0 ? l.dailyXpRate : null, historicalRate: l.historicalDailyXpRate,
        ratio: l.observedDays > 0 && l.historicalDailyXpRate > 0 ? l.dailyXpRate / l.historicalDailyXpRate : null,
        observedDays: l.observedDays, partialDaysExcluded: l.partialDaysExcluded, historicalObservedDays: l.historicalObservedDays,
        historicalSpanDays: l.historicalSpanDays, historicalSpanStart: l.historicalSpanStart,
      }), ...band },
      criteria: { ...CRITERIA.LANG_XP_ACCELERATION, ...edgeCriteria("xp", l.intervalDays, cal) },
    });
    if (emitted) {
      const ratio = es1(l.dailyXpRate / l.historicalDailyXpRate);
      findings.push({
        id: "LANG_XP_ACCELERATION",
        category: "languages",
        title: "Mayor XP diario",
        claim: `Tu XP por día con registro en el periodo fue ${ratio}x el de tu histórico.`,
        evidence: `${Math.round(l.dailyXpRate)} XP/día con registro en el intervalo vs ${Math.round(l.historicalDailyXpRate)} XP/día con registro histórico (+${l.xpGained} XP en ${l.observedDays} ${l.observedDays === 1 ? "día" : "días"} con registro).`,
        baselineAt: context.baselineAt,
        until: context.until,
        metrics: {
          dailyRate: l.dailyXpRate,
          historicalRate: l.historicalDailyXpRate,
          xpGained: l.xpGained,
          ...band,
        },
      });
    }
  }

  // 5. Streak milestone
  if (deltas.streak.streakMilestone !== null) {
    findings.push({
      id: "STREAK_MILESTONE",
      category: "streak",
      title: "Hito de consistencia",
      claim: `Has alcanzado la marca de ${deltas.streak.streakMilestone} días de racha.`,
      evidence: `Racha acumulada: ${deltas.streak.currentStreak ?? deltas.streak.streakMilestone} días.`,
      baselineAt: context.baselineAt,
      until: context.until,
      metrics: {
        milestone: deltas.streak.streakMilestone,
        currentStreak: deltas.streak.currentStreak ?? 0,
      },
    });
  }

  // 6. Streak broken
  if (deltas.streak.status === "broken") {
    findings.push({
      id: "STREAK_BROKEN",
      category: "streak",
      title: "Racha interrumpida",
      claim: `Tu racha diaria fue interrumpida durante este periodo.`,
      evidence: `Racha previa de ${deltas.streak.baselineStreak ?? "—"} días → Actual: ${deltas.streak.currentStreak ?? 0}.`,
      baselineAt: context.baselineAt,
      until: context.until,
      metrics: {
        baselineStreak: deltas.streak.baselineStreak ?? 0,
        currentStreak: deltas.streak.currentStreak ?? 0,
      },
    });
  }

  return { findings, evaluations };
}
