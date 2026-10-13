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
  // A6 §14.4: courses left out of the shares because their gain is not comparable, with the bound the series gives them.
  // Present only when there is at least one; its absence keeps the finding byte-identical to the pre-A6 shape.
  excludedCourses?: Array<{ courseId: string; state: NonComparableState; boundXp: number | null }>;
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

// A6 (docs/contracts/2026-10-06-discarded-signals-contract.md §14.2). `courses` holds the observed gains (> 0); an observed 0 adds
// nothing to a share. Everything else is a course whose gain in the half is NOT comparable and must never be read as 0.
export interface LanguageEraCourseActivity {
  courseId: string;
  xp: number;
}

export type NonComparableState = "new_course" | "unknown" | "discontinuity";

export interface NonComparableCourse {
  courseId: string;
  state: NonComparableState;
  reason?: "not_observed_in_period" | "non_monotonic";
  // U of §14.4: the gain in the half cannot exceed it, by what the series itself shows. null = no bound.
  boundXp: number | null;
  firstObservedAt?: string; // new_course
  discontinuity?: { fromAt: string; toAt: string; xpBefore: number; xpAfter: number };
}

export interface LanguagesTrajectoryInput {
  startedAt: string | null;
  endedAt: string | null;
  activeDays: number;
  h1: {
    courses: LanguageEraCourseActivity[];
    nonComparable?: NonComparableCourse[];
  };
  h2: {
    courses: LanguageEraCourseActivity[];
    nonComparable?: NonComparableCourse[];
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

  // 2. Evaluate LANG_FOCUS_SHIFT_LONGITUDINAL (no Evaluation: it has no contract of its own yet, §3.1)
  const lang = input.languages;
  if (lang.startedAt && lang.endedAt && lang.activeDays >= 60) {
    const totalDays = daysBetween(lang.startedAt, lang.endedAt);

    if (totalDays >= 90) {
      const shift = focusShift(lang.h1.courses, lang.h2.courses);
      // A6 §14.4 (P3): a course whose gain is not comparable does not silence the rule by existing, and it is never read as 0.
      // The rule emits only if its conclusion is the same for every value the series allows those courses (0..U).
      if (shift && determinableWithoutBias(lang)) {
        const excluded = [
          ...(lang.h1.nonComparable ?? []),
          ...(lang.h2.nonComparable ?? []),
        ];
        const seen = new Set<string>();
        const excludedCourses = excluded
          .filter((c) => (seen.has(c.courseId) ? false : (seen.add(c.courseId), true)))
          .map((c) => ({ courseId: c.courseId, state: c.state, boundXp: c.boundXp }));
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
            xpTotal: shift.h1TotalXp + shift.h2TotalXp,
          },
          metrics: {
            ...(excludedCourses.length ? { excludedCourses } : {}),
            previousCourseId: shift.prev.courseId,
            newCourseId: shift.next.courseId,
            h1PreviousCourseShare: shift.h1PrevShare,
            h1PreviousCourseXp: shift.prev.xp,
            h2PreviousCourseShare: shift.h2PrevShare,
            h2NewCourseShare: shift.h2NewShare,
            h2NewCourseXp: shift.next.xp,
          },
        });
      }
    }
  }

  return { findings, evaluations };
}

interface FocusShift {
  prev: LanguageEraCourseActivity;
  next: LanguageEraCourseActivity;
  h1TotalXp: number;
  h2TotalXp: number;
  h1PrevShare: number;
  h2PrevShare: number;
  h2NewShare: number;
}

// The pre-A6 decision, unchanged (its thresholds belong to a contract that does not exist yet and are not approved here):
// dominant course in H1 (share >= 60 %, xp >= 2000), another dominant course in H2, the old one <= 25 % in H2, the new one not
// already dominant in H1.
function focusShift(h1: LanguageEraCourseActivity[], h2: LanguageEraCourseActivity[]): FocusShift | null {
  const h1TotalXp = h1.reduce((sum, c) => sum + c.xp, 0);
  const h2TotalXp = h2.reduce((sum, c) => sum + c.xp, 0);
  if (!(h1TotalXp > 0 && h2TotalXp > 0)) return null;

  const prev = h1.find((c) => c.xp >= 2000 && (c.xp / h1TotalXp) * 100 >= 60.0);
  if (!prev) return null;
  const next = h2.find((c) => c.courseId !== prev.courseId && c.xp >= 2000 && (c.xp / h2TotalXp) * 100 >= 60.0);
  if (!next) return null;

  const h2PrevShare = ((h2.find((c) => c.courseId === prev.courseId)?.xp ?? 0) / h2TotalXp) * 100;
  const h1NewShare = ((h1.find((c) => c.courseId === next.courseId)?.xp ?? 0) / h1TotalXp) * 100;
  if (!(h2PrevShare <= 25.0 && h1NewShare < 60.0)) return null;

  return { prev, next, h1TotalXp, h2TotalXp, h1PrevShare: (prev.xp / h1TotalXp) * 100, h2PrevShare, h2NewShare: (next.xp / h2TotalXp) * 100 };
}

const UNBOUNDED_XP = 1e9; // stands for "no bound": larger than any lifetime XP, so the share it could take is ~100 %
const MAX_RANGE_COURSES = 12; // 2^12 combinations; beyond that the rule does not claim to be determinable

// A6 §14.4.3: the conclusion must be the same for every value compatible with the evidence of the non-comparable courses.
// Checked at the extremes of each range [0, U] (a safety check, not a proof for every interior value; contract §14.4 leaves
// the method to the implementation).
function determinableWithoutBias(lang: LanguagesTrajectoryInput): boolean {
  const ranges: Array<{ half: 1 | 2; courseId: string; u: number }> = [];
  for (const [half, h] of [[1, lang.h1], [2, lang.h2]] as const)
    for (const c of h.nonComparable ?? []) ranges.push({ half, courseId: c.courseId, u: c.boundXp === null ? UNBOUNDED_XP : c.boundXp });
  if (ranges.length === 0) return true;
  if (ranges.length > MAX_RANGE_COURSES) return false;

  const key = (h1: LanguageEraCourseActivity[], h2: LanguageEraCourseActivity[]) => {
    const r = focusShift(h1, h2);
    return r ? `${r.prev.courseId}>${r.next.courseId}` : "none";
  };
  const base = key(lang.h1.courses, lang.h2.courses);
  for (let mask = 1; mask < 1 << ranges.length; mask++) {
    const h1 = [...lang.h1.courses], h2 = [...lang.h2.courses];
    ranges.forEach((r, i) => {
      if (!(mask & (1 << i)) || r.u <= 0) return;
      (r.half === 1 ? h1 : h2).push({ courseId: r.courseId, xp: r.u });
    });
    if (key(h1, h2) !== base) return false;
  }
  return true;
}
