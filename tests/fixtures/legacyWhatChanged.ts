import { distinguishable, type Delta } from "../../src/domain/proportion.ts";

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

export function evaluateSignificantChanges(
  deltas: WhatChangedDeltas,
  context: FindingContext
): Finding[] {
  const findings: Finding[] = [];

  // 1. Chess rating jump (|delta| >= 25)
  if (deltas.chess.ratingDelta !== null && Math.abs(deltas.chess.ratingDelta) >= 25) {
    const sign = deltas.chess.ratingDelta > 0 ? "+" : "";
    findings.push({
      id: "CHESS_RATING_JUMP",
      category: "chess",
      title: "Salto de ELO",
      claim: `Tu ELO cambió ${sign}${deltas.chess.ratingDelta} puntos en el periodo.`,
      evidence: `Inicial: ${deltas.chess.baselineRating ?? "—"} → Final: ${deltas.chess.currentRating ?? "—"} (${deltas.chess.gamesCount} partidas jugadas).`,
      baselineAt: context.baselineAt,
      until: context.until,
      metrics: {
        ratingDelta: deltas.chess.ratingDelta,
        baselineRating: deltas.chess.baselineRating ?? 0,
        currentRating: deltas.chess.currentRating ?? 0,
        gamesCount: deltas.chess.gamesCount,
      },
    });
  }

  // 2. Chess color asymmetry (decided games >= 10, |white - black| >= 15 pp, and the 95% interval of the difference excludes 0)
  if (
    deltas.chess.decidedCount >= 10 &&
    distinguishable(deltas.chess.colorDelta) &&
    deltas.chess.intervalWhiteWinRate !== null &&
    deltas.chess.intervalBlackWinRate !== null
  ) {
    const diff = Math.abs(deltas.chess.intervalWhiteWinRate - deltas.chess.intervalBlackWinRate);
    if (diff >= 15.0) {
      const better =
        deltas.chess.intervalWhiteWinRate > deltas.chess.intervalBlackWinRate
          ? "blancas"
          : "negras";
      findings.push({
        id: "CHESS_COLOR_ASYMMETRY",
        category: "chess",
        title: "Asimetría por color",
        claim: `Mayor tasa de victorias con ${better}: ${diff.toFixed(1)} pp de diferencia (IC95 [${deltas.chess.colorDelta!.lower.toFixed(0)}, ${deltas.chess.colorDelta!.upper.toFixed(0)}] pp, blancas − negras; excluye 0).`,
        evidence: `Blancas: ${deltas.chess.intervalWhiteWinRate.toFixed(1)}% · Negras: ${deltas.chess.intervalBlackWinRate.toFixed(1)}% en ${deltas.chess.decidedCount} partidas decididas.`,
        baselineAt: context.baselineAt,
        until: context.until,
        metrics: {
          whiteWinRate: deltas.chess.intervalWhiteWinRate,
          blackWinRate: deltas.chess.intervalBlackWinRate,
          diffPp: diff,
          diffCiLower: deltas.chess.colorDelta!.lower,
          diffCiUpper: deltas.chess.colorDelta!.upper,
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
  if (
    deltas.languages.intervalDays >= 3 &&
    deltas.languages.xpGained >= 200 &&
    deltas.languages.historicalDailyXpRate > 0 &&
    deltas.languages.dailyXpRate >= 1.3 * deltas.languages.historicalDailyXpRate
  ) {
    const ratio = (deltas.languages.dailyXpRate / deltas.languages.historicalDailyXpRate).toFixed(1);
    findings.push({
      id: "LANG_XP_ACCELERATION",
      category: "languages",
      title: "Aceleración de ritmo",
      claim: `Aceleración en tu ritmo de aprendizaje: creció ${ratio}x sobre tu media histórica.`,
      evidence: `${Math.round(deltas.languages.dailyXpRate)} XP/día en el intervalo vs ${Math.round(deltas.languages.historicalDailyXpRate)} XP/día histórico (+${deltas.languages.xpGained} XP).`,
      baselineAt: context.baselineAt,
      until: context.until,
      metrics: {
        dailyRate: deltas.languages.dailyXpRate,
        historicalRate: deltas.languages.historicalDailyXpRate,
        xpGained: deltas.languages.xpGained,
      },
    });
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

  return findings;
}
