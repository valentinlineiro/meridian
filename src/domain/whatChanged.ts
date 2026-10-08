import { distinguishable, type Delta } from "./proportion.ts";

export interface FindingContext {
  userId: string;
  baselineAt: string;
  until: string;
}

export interface ChessDeltas {
  gamesCount: number; // observed
  decidedCount: number; // usable evidence: the sample the thresholds below refer to
  ratingDelta: number | null;
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
  intervalDays: number;
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
] as const;
export type Reason = (typeof REASONS)[number];

// The thresholds of each rule: the single source for the rule and for the criteria an evaluation carries (amendment A3).
export const CRITERIA = {
  CHESS_RATING_JUMP: { minAbsDelta: 25 },
  CHESS_COLOR_ASYMMETRY: { minDecided: 10, minDiffPp: 15 },
  LANG_XP_ACCELERATION: { minDays: 3, minXp: 200, minRatio: 1.3 },
} as const;

export interface Evaluation {
  id: string;
  kind: "statistical" | "threshold";
  status: "emitted" | "not_emitted";
  reasons: Reason[];
  metrics: Record<string, number | string>; // keeps the observed effect even when not emitted
  criteria: Record<string, number>; // the thresholds this rule applies, so a consumer can state them without copying them
}

// Derived from the evaluation alone: inconclusive = the effect was observed and reaches the threshold, and only the sample
// and/or the interval stand in the way.
export function salience(e: Evaluation): "finding" | "inconclusive" | "no_indication" {
  if (e.status === "emitted") return "finding";
  return e.reasons.length > 0 && e.reasons.every((r) => r === "insufficient_sample" || r === "interval_includes_zero")
    ? "inconclusive"
    : "no_indication";
}

const canonical = (rs: Set<Reason>): Reason[] => REASONS.filter((r) => rs.has(r));
const numeric = (o: Record<string, number | string | null | undefined>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined)) as Record<string, number | string>;

export function evaluateSignificantChanges(deltas: WhatChangedDeltas, context: FindingContext): Finding[] {
  return evaluateChanges(deltas, context).findings;
}

// One evaluation of every rule's conditions yields both the findings (exactly the emitted ones) and the evaluations.
export function evaluateChanges(
  deltas: WhatChangedDeltas,
  context: FindingContext
): { findings: Finding[]; evaluations: Evaluation[] } {
  const findings: Finding[] = [];
  const evaluations: Evaluation[] = [];


  // 1. Chess rating jump (|delta| >= CRITERIA.CHESS_RATING_JUMP.minAbsDelta)
  {
    const delta = deltas.chess.ratingDelta;
    const why = new Set<Reason>();
    if (delta === null) why.add("data_unavailable");
    else if (Math.abs(delta) < CRITERIA.CHESS_RATING_JUMP.minAbsDelta) why.add("effect_below_threshold");
    const emitted = why.size === 0;
    evaluations.push({
      id: "CHESS_RATING_JUMP", kind: "threshold", status: emitted ? "emitted" : "not_emitted", reasons: canonical(why),
      metrics: numeric({ ratingDelta: delta, baselineRating: deltas.chess.baselineRating, currentRating: deltas.chess.currentRating, gamesCount: deltas.chess.gamesCount }),
      criteria: CRITERIA.CHESS_RATING_JUMP,
    });
    if (emitted) {
      const sign = delta! > 0 ? "+" : "";
      findings.push({
        id: "CHESS_RATING_JUMP",
        category: "chess",
        title: "Salto de ELO",
        claim: `Tu ELO cambió ${sign}${delta} puntos en el periodo.`,
        evidence: `Inicial: ${deltas.chess.baselineRating ?? "—"} → Final: ${deltas.chess.currentRating ?? "—"} (${deltas.chess.gamesCount} partidas jugadas).`,
        baselineAt: context.baselineAt,
        until: context.until,
        metrics: {
          ratingDelta: delta!,
          baselineRating: deltas.chess.baselineRating ?? 0,
          currentRating: deltas.chess.currentRating ?? 0,
          gamesCount: deltas.chess.gamesCount,
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
        claim: `Mayor tasa de victorias con ${better}: ${diff!.toFixed(1)} pp de diferencia (IC95 [${c.colorDelta!.lower.toFixed(0)}, ${c.colorDelta!.upper.toFixed(0)}] pp, blancas − negras; excluye 0).`,
        evidence: `Blancas: ${white!.toFixed(1)}% · Negras: ${black!.toFixed(1)}% en ${c.decidedCount} partidas decididas.`,
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

  // 4. Language XP acceleration (interval daily rate >= 1.3 * historical rate with min 200 XP and min 3 days duration)
  {
    const l = deltas.languages;
    const why = new Set<Reason>();
    if (l.intervalDays < CRITERIA.LANG_XP_ACCELERATION.minDays) why.add("span_too_short");
    if (l.xpGained < CRITERIA.LANG_XP_ACCELERATION.minXp) why.add("insufficient_sample");
    if (!(l.historicalDailyXpRate > 0)) why.add("data_unavailable");
    else if (l.dailyXpRate < CRITERIA.LANG_XP_ACCELERATION.minRatio * l.historicalDailyXpRate) why.add("effect_below_threshold");
    const emitted = why.size === 0;
    evaluations.push({
      id: "LANG_XP_ACCELERATION", kind: "threshold", status: emitted ? "emitted" : "not_emitted", reasons: canonical(why),
      metrics: numeric({ intervalDays: l.intervalDays, xpGained: l.xpGained, dailyRate: l.dailyXpRate, historicalRate: l.historicalDailyXpRate, ratio: l.historicalDailyXpRate > 0 ? l.dailyXpRate / l.historicalDailyXpRate : null }),
      criteria: CRITERIA.LANG_XP_ACCELERATION,
    });
    if (emitted) {
      const ratio = (l.dailyXpRate / l.historicalDailyXpRate).toFixed(1);
      findings.push({
        id: "LANG_XP_ACCELERATION",
        category: "languages",
        title: "Mayor XP diario",
        claim: `Tu XP diario en el periodo fue ${ratio}x tu media histórica.`,
        evidence: `${Math.round(l.dailyXpRate)} XP/día en el intervalo vs ${Math.round(l.historicalDailyXpRate)} XP/día histórico (+${l.xpGained} XP).`,
        baselineAt: context.baselineAt,
        until: context.until,
        metrics: {
          dailyRate: l.dailyXpRate,
          historicalRate: l.historicalDailyXpRate,
          xpGained: l.xpGained,
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
