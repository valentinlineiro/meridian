export type TrajectoryFindingType =
  | "CHESS_COLOR_ASYMMETRY_LONGITUDINAL"
  | "LANG_FOCUS_SHIFT_LONGITUDINAL";

export interface ChessColorAsymmetryMetrics {
  globalWhiteGames: number;
  globalBlackGames: number;
  globalWhiteDecided: number; // denominators of the win rates below
  globalBlackDecided: number;
  globalWhiteWinRate: number;
  globalBlackWinRate: number;
  diffPp: number;
  h1WhiteWinRate: number;
  h1BlackWinRate: number;
  h1DiffPp: number;
  h2WhiteWinRate: number;
  h2BlackWinRate: number;
  h2DiffPp: number;
  dominantColor: "white" | "black";
}

export interface LanguageFocusShiftMetrics {
  previousCourseId: string;
  newCourseId: string;
  h1PreviousCourseShare: number;
  h1PreviousCourseXp: number;
  h2PreviousCourseShare: number;
  h2NewCourseShare: number;
  h2NewCourseXp: number;
}

export interface TrajectoryFinding {
  type: TrajectoryFindingType;
  category: "chess" | "languages";
  temporalSpan: {
    startedAt: string;
    endedAt: string;
    totalDays: number;
    activeDays: number;
  };
  // pattern-specific evidence volume: games for chess, XP for languages
  sample: { gamesCount: number; decidedCount: number } | { xpTotal: number };
  metrics: ChessColorAsymmetryMetrics | LanguageFocusShiftMetrics;
}

// Games per colour: `*Games` observed, `*Decided` (win + loss + draw) the evidence and denominator of the rates.
export interface ColorTally {
  whiteGames: number;
  whiteDecided: number;
  whiteWins: number;
  blackGames: number;
  blackDecided: number;
  blackWins: number;
}

export interface ChessTrajectoryInput extends ColorTally {
  startedAt: string | null;
  endedAt: string | null;
  totalGames: number;
  activeDays: number;
  h1: ColorTally;
  h2: ColorTally;
}

export interface LanguageEraCourseActivity {
  courseId: string;
  xp: number;
}

export interface LanguagesTrajectoryInput {
  startedAt: string | null;
  endedAt: string | null;
  activeDays: number;
  h1: {
    courses: LanguageEraCourseActivity[];
  };
  h2: {
    courses: LanguageEraCourseActivity[];
  };
}

export interface TrajectoryInput {
  chess: ChessTrajectoryInput;
  languages: LanguagesTrajectoryInput;
}

export function evaluateTrajectoryPatterns(input: TrajectoryInput): TrajectoryFinding[] {
  const findings: TrajectoryFinding[] = [];

  // 1. Evaluate CHESS_COLOR_ASYMMETRY_LONGITUDINAL
  const chess = input.chess;
  if (
    chess.startedAt &&
    chess.endedAt &&
    chess.whiteDecided >= 40 &&
    chess.blackDecided >= 40 &&
    chess.activeDays >= 60 &&
    chess.h1.whiteDecided > 0 &&
    chess.h1.blackDecided > 0 &&
    chess.h2.whiteDecided > 0 &&
    chess.h2.blackDecided > 0
  ) {
    const totalDays = Math.max(
      0,
      Math.floor(
        (new Date(chess.endedAt).getTime() - new Date(chess.startedAt).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    );

    if (totalDays >= 60) {
      const globalWhiteWR = (chess.whiteWins / chess.whiteDecided) * 100;
      const globalBlackWR = (chess.blackWins / chess.blackDecided) * 100;
      const globalDiff = globalWhiteWR - globalBlackWR;

      const h1WhiteWR = (chess.h1.whiteWins / chess.h1.whiteDecided) * 100;
      const h1BlackWR = (chess.h1.blackWins / chess.h1.blackDecided) * 100;
      const h1Diff = h1WhiteWR - h1BlackWR;

      const h2WhiteWR = (chess.h2.whiteWins / chess.h2.whiteDecided) * 100;
      const h2BlackWR = (chess.h2.blackWins / chess.h2.blackDecided) * 100;
      const h2Diff = h2WhiteWR - h2BlackWR;

      if (Math.abs(globalDiff) >= 15.0) {
        const isWhiteFavored = globalDiff > 0;
        const h1Satisfied = isWhiteFavored ? h1Diff >= 10.0 : h1Diff <= -10.0;
        const h2Satisfied = isWhiteFavored ? h2Diff >= 10.0 : h2Diff <= -10.0;

        if (h1Satisfied && h2Satisfied) {
          findings.push({
            type: "CHESS_COLOR_ASYMMETRY_LONGITUDINAL",
            category: "chess",
            temporalSpan: {
              startedAt: chess.startedAt,
              endedAt: chess.endedAt,
              totalDays,
              activeDays: chess.activeDays,
            },
            sample: {
              gamesCount: chess.whiteGames + chess.blackGames,
              decidedCount: chess.whiteDecided + chess.blackDecided,
            },
            metrics: {
              globalWhiteGames: chess.whiteGames,
              globalBlackGames: chess.blackGames,
              globalWhiteDecided: chess.whiteDecided,
              globalBlackDecided: chess.blackDecided,
              globalWhiteWinRate: globalWhiteWR,
              globalBlackWinRate: globalBlackWR,
              diffPp: Math.abs(globalDiff),
              h1WhiteWinRate: h1WhiteWR,
              h1BlackWinRate: h1BlackWR,
              h1DiffPp: Math.abs(h1Diff),
              h2WhiteWinRate: h2WhiteWR,
              h2BlackWinRate: h2BlackWR,
              h2DiffPp: Math.abs(h2Diff),
              dominantColor: isWhiteFavored ? "white" : "black",
            },
          });
        }
      }
    }
  }

  // 2. Evaluate LANG_FOCUS_SHIFT_LONGITUDINAL
  const lang = input.languages;
  if (lang.startedAt && lang.endedAt && lang.activeDays >= 60) {
    const totalDays = Math.max(
      0,
      Math.floor(
        (new Date(lang.endedAt).getTime() - new Date(lang.startedAt).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    );

    if (totalDays >= 90) {
      const h1TotalXp = lang.h1.courses.reduce((sum, c) => sum + c.xp, 0);
      const h2TotalXp = lang.h2.courses.reduce((sum, c) => sum + c.xp, 0);

      if (h1TotalXp > 0 && h2TotalXp > 0) {
        // Find dominant course in H1 (share >= 60%, xp >= 2000)
        const candidatePrev = lang.h1.courses.find(
          (c) => c.xp >= 2000 && (c.xp / h1TotalXp) * 100 >= 60.0
        );

        if (candidatePrev) {
          const h1PrevShare = (candidatePrev.xp / h1TotalXp) * 100;

          // Find dominant course in H2 (share >= 60%, xp >= 2000, different from candidatePrev)
          const candidateNew = lang.h2.courses.find(
            (c) =>
              c.courseId !== candidatePrev.courseId &&
              c.xp >= 2000 &&
              (c.xp / h2TotalXp) * 100 >= 60.0
          );

          if (candidateNew) {
            const h2NewShare = (candidateNew.xp / h2TotalXp) * 100;

            // Check previous course share in H2 <= 25%
            const prevInH2 = lang.h2.courses.find((c) => c.courseId === candidatePrev.courseId);
            const h2PrevShare = prevInH2 ? (prevInH2.xp / h2TotalXp) * 100 : 0;

            // Check candidateNew was not already dominant in H1 (< 60%)
            const newInH1 = lang.h1.courses.find((c) => c.courseId === candidateNew.courseId);
            const h1NewShare = newInH1 ? (newInH1.xp / h1TotalXp) * 100 : 0;

            if (h2PrevShare <= 25.0 && h1NewShare < 60.0) {
              findings.push({
                type: "LANG_FOCUS_SHIFT_LONGITUDINAL",
                category: "languages",
                temporalSpan: {
                  startedAt: lang.startedAt,
                  endedAt: lang.endedAt,
                  totalDays,
                  activeDays: lang.activeDays,
                },
                sample: {
                  xpTotal: h1TotalXp + h2TotalXp,
                },
                metrics: {
                  previousCourseId: candidatePrev.courseId,
                  newCourseId: candidateNew.courseId,
                  h1PreviousCourseShare: h1PrevShare,
                  h1PreviousCourseXp: candidatePrev.xp,
                  h2PreviousCourseShare: h2PrevShare,
                  h2NewCourseShare: h2NewShare,
                  h2NewCourseXp: candidateNew.xp,
                },
              });
            }
          }
        }
      }
    }
  }

  return findings;
}
