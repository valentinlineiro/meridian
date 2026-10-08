import { distinguishable, newcombeDiff, scaleDelta, type Delta } from "./proportion.ts";
import { CRITERIA, canonical, numeric, type Evaluation, type Reason } from "./whatChanged.ts";

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
  diffCi: Delta; // white − black over all decided games, percent, 95% interval
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

export interface TrajectoryEvaluation {
  findings: TrajectoryFinding[];
  evaluations: Evaluation[];
}

export function evaluateTrajectoryPatterns(input: TrajectoryInput): TrajectoryFinding[] {
  return evaluateTrajectory(input).findings;
}

const daysBetween = (a: string, b: string) =>
  Math.max(0, Math.floor((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24)));

// One pass yields the findings (exactly the emitted ones) and the evaluations. Contract: docs/contracts/2026-10-06-discarded-signals-contract.md.
// Only the colour pattern is evaluable: LANG_FOCUS_SHIFT_LONGITUDINAL needs its own contract (§3.1) and produces no evaluation.
export function evaluateTrajectory(input: TrajectoryInput): TrajectoryEvaluation {
  const findings: TrajectoryFinding[] = [];
  const evaluations: Evaluation[] = [];
  const K = CRITERIA.CHESS_COLOR_ASYMMETRY_LONGITUDINAL;

  // 1. CHESS_COLOR_ASYMMETRY_LONGITUDINAL
  const chess = input.chess;
  {
    const why = new Set<Reason>();
    const spanKnown = Boolean(chess.startedAt && chess.endedAt);
    const totalDays = spanKnown ? daysBetween(chess.startedAt!, chess.endedAt!) : null;
    if (!spanKnown) why.add("data_unavailable");
    if (chess.whiteDecided < K.minDecidedPerColor || chess.blackDecided < K.minDecidedPerColor) why.add("insufficient_sample");
    if (chess.activeDays < K.minActiveDays) why.add("insufficient_sample");
    if (totalDays !== null && totalDays < K.minSpanDays) why.add("span_too_short");
    const erasDefined = chess.h1.whiteDecided > 0 && chess.h1.blackDecided > 0 && chess.h2.whiteDecided > 0 && chess.h2.blackDecided > 0;
    if (!erasDefined) why.add("data_unavailable");

    const ratesDefined = chess.whiteDecided > 0 && chess.blackDecided > 0;
    const globalWhiteWR = chess.whiteDecided > 0 ? (chess.whiteWins / chess.whiteDecided) * 100 : null;
    const globalBlackWR = chess.blackDecided > 0 ? (chess.blackWins / chess.blackDecided) * 100 : null;
    const globalDiff = globalWhiteWR !== null && globalBlackWR !== null ? globalWhiteWR - globalBlackWR : null;
    const h1Diff = erasDefined ? (chess.h1.whiteWins / chess.h1.whiteDecided) * 100 - (chess.h1.blackWins / chess.h1.blackDecided) * 100 : null;
    const h2Diff = erasDefined ? (chess.h2.whiteWins / chess.h2.whiteDecided) * 100 - (chess.h2.blackWins / chess.h2.blackDecided) * 100 : null;
    // The interval applies to the global difference only: per-era n is too small for it, and the eras are a persistence check.
    const diffCi = ratesDefined ? scaleDelta(newcombeDiff({ wins: chess.whiteWins, n: chess.whiteDecided }, { wins: chess.blackWins, n: chess.blackDecided }), 100) : null;

    if (globalDiff === null) why.add("data_unavailable");
    else if (Math.abs(globalDiff) < K.minDiffPp) why.add("effect_below_threshold");
    if (diffCi === null) why.add("data_unavailable");
    else if (!distinguishable(diffCi)) why.add("interval_includes_zero");
    if (globalDiff !== null && h1Diff !== null && h2Diff !== null) {
      const white = globalDiff > 0;
      const ok = (d: number) => (white ? d >= K.minEraDiffPp : d <= -K.minEraDiffPp);
      if (!(ok(h1Diff) && ok(h2Diff))) why.add("persistence_not_met");
    }

    const emitted = why.size === 0;
    evaluations.push({
      id: "CHESS_COLOR_ASYMMETRY_LONGITUDINAL", kind: "statistical", status: emitted ? "emitted" : "not_emitted", reasons: canonical(why),
      metrics: numeric({
        whiteDecided: chess.whiteDecided, blackDecided: chess.blackDecided, activeDays: chess.activeDays, totalDays,
        startedAt: chess.startedAt, endedAt: chess.endedAt, // this rule's own window (the response span also covers languages)
        whiteWinRate: globalWhiteWR, blackWinRate: globalBlackWR, diffPp: globalDiff === null ? null : Math.abs(globalDiff),
        diffCiLower: diffCi?.lower, diffCiUpper: diffCi?.upper,
        // signed white − black, so persistence can be read: same sign as the global difference and at least the era criterion
        diffSigned: globalDiff, h1DiffSigned: h1Diff, h2DiffSigned: h2Diff,
      }),
      criteria: K,
    });

    if (emitted) {
      const globalDiffV = globalDiff!, h1 = h1Diff!, h2 = h2Diff!;
      findings.push({
        type: "CHESS_COLOR_ASYMMETRY_LONGITUDINAL",
        category: "chess",
        temporalSpan: { startedAt: chess.startedAt!, endedAt: chess.endedAt!, totalDays: totalDays!, activeDays: chess.activeDays },
        sample: { gamesCount: chess.whiteGames + chess.blackGames, decidedCount: chess.whiteDecided + chess.blackDecided },
        metrics: {
          globalWhiteGames: chess.whiteGames,
          globalBlackGames: chess.blackGames,
          globalWhiteDecided: chess.whiteDecided,
          globalBlackDecided: chess.blackDecided,
          globalWhiteWinRate: globalWhiteWR!,
          globalBlackWinRate: globalBlackWR!,
          diffPp: Math.abs(globalDiffV),
          diffCi: diffCi!,
          h1WhiteWinRate: (chess.h1.whiteWins / chess.h1.whiteDecided) * 100,
          h1BlackWinRate: (chess.h1.blackWins / chess.h1.blackDecided) * 100,
          h1DiffPp: Math.abs(h1),
          h2WhiteWinRate: (chess.h2.whiteWins / chess.h2.whiteDecided) * 100,
          h2BlackWinRate: (chess.h2.blackWins / chess.h2.blackDecided) * 100,
          h2DiffPp: Math.abs(h2),
          dominantColor: globalDiffV > 0 ? "white" : "black",
        },
      });
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

  return { findings, evaluations };
}
