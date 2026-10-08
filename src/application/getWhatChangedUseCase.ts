import type { WhatChangedPort } from "../ports/whatChangedPort.ts";
import { NotFoundError } from "./errors.ts";
import { newcombeDiff, scaleDelta, type Delta } from "../domain/proportion.ts";
import {
  evaluateChanges,
  type Evaluation,
  type Finding,
  type WhatChangedDeltas,
} from "../domain/whatChanged.ts";

export interface GetWhatChangedInput {
  since: string;
  until: string;
  userId?: string | null;
}

export interface WhatChangedResult {
  userId: string;
  interval: {
    since: string;
    until: string;
  };
  baseline: {
    status: "exactOrPrevious" | "firstHistorical" | "unavailable";
    observedAt: string | null;
  };
  chess: {
    gamesCount: number;
    decidedCount: number;
    unknownCount: number;
    ratingDelta: number | null;
    baselineRating: number | null;
    currentRating: number | null;
    intervalWinRate: number | null;
    whiteWinRate: number | null;
    blackWinRate: number | null;
    historicalWinRateDelta: number | null;
    colorDelta: Delta | null;
    historicalDelta: Delta | null;
  };
  languages: {
    xpGained: number;
    sessionsCount: number;
    totalSessionMinutes: number;
    baselineCourseId: string | null;
    currentCourseId: string | null;
    courseChanged: boolean;
  };
  streak: {
    baselineStreak: number | null;
    currentStreak: number | null;
    streakDelta: number | null;
    status: "active" | "broken";
    streakStarted: boolean;
    streakMilestone: number | null;
  };
  findings: Finding[];
  evaluations: Evaluation[];
}

export async function getWhatChangedUseCase(
  port: WhatChangedPort,
  input: GetWhatChangedInput
): Promise<WhatChangedResult> {
  const userId = await port.resolveUserId(input.userId);
  if (!userId) {
    throw new NotFoundError(
      input.userId
        ? `User '${input.userId}' not found`
        : "No default user identity found"
    );
  }

  const [chessBase, chessInt, langBase, langTarget, langInt, histXpRate] = await Promise.all([
    port.getChessBaseline(userId, input.since),
    port.getChessInterval(userId, input.since, input.until),
    port.getLanguagesBaseline(userId, input.since),
    port.getLanguagesTarget(userId, input.until),
    port.getLanguagesInterval(userId, input.since, input.until),
    port.getHistoricalDailyXpRate(userId, input.since),
  ]);


  // Overall baseline classification
  let baselineStatus: "exactOrPrevious" | "firstHistorical" | "unavailable" = "exactOrPrevious";
  if (chessBase.status === "unavailable" && langBase.status === "unavailable") {
    baselineStatus = "unavailable";
  } else if (chessBase.status === "firstHistorical" || langBase.status === "firstHistorical") {
    baselineStatus = "firstHistorical";
  }

  const observedAt =
    chessBase.data?.observedAt ?? langBase.data?.observedAt ?? null;

  // Chess calculations
  const baselineRating = chessBase.data?.rating ?? null;
  // A rating is observed only by a game inside the window: with none, "no change" is not an observation (amendment A2).
  const currentRating = chessInt.latestRating;
  const ratingDelta = baselineRating !== null && currentRating !== null ? currentRating - baselineRating : null;

  // Rates are over decided games: an unknown result is neither a win nor a loss.
  const intervalWinRate =
    chessInt.decidedCount > 0 ? (chessInt.wins / chessInt.decidedCount) * 100 : null;
  const whiteWinRate =
    chessInt.whiteDecided > 0 ? (chessInt.whiteWins / chessInt.whiteDecided) * 100 : null;
  const blackWinRate =
    chessInt.blackDecided > 0 ? (chessInt.blackWins / chessInt.blackDecided) * 100 : null;

  const lifetimePriorWinRate =
    chessBase.status === "exactOrPrevious" &&
    chessBase.data &&
    chessBase.data.lifetimeDecided > 0
      ? (chessBase.data.lifetimeWins / chessBase.data.lifetimeDecided) * 100
      : null;
  const historicalWinRateDelta =
    intervalWinRate !== null && lifetimePriorWinRate !== null
      ? intervalWinRate - lifetimePriorWinRate
      : null;

  // 95% intervals (percent) of the same differences. Groups are disjoint, so Newcombe applies.
  const colorDelta = scaleDelta(
    newcombeDiff({ wins: chessInt.whiteWins, n: chessInt.whiteDecided }, { wins: chessInt.blackWins, n: chessInt.blackDecided }), 100);
  const historicalDelta =
    chessBase.status === "exactOrPrevious" && chessBase.data
      ? scaleDelta(newcombeDiff({ wins: chessInt.wins, n: chessInt.decidedCount }, { wins: chessBase.data.lifetimeWins, n: chessBase.data.lifetimeDecided }), 100)
      : null;

  // Languages calculations (symmetric point-in-time)
  const baselineCourseId = langBase.data?.activeCourseId ?? null;
  const currentCourseId =
    langTarget.data?.activeCourseId ??
    (langBase.status === "exactOrPrevious" ? baselineCourseId : null);
  const courseChanged =
    baselineCourseId !== null &&
    currentCourseId !== null &&
    baselineCourseId !== currentCourseId;

  // Duration in days
  const durationMs = Math.max(
    1,
    new Date(input.until).getTime() - new Date(input.since).getTime()
  );
  const durationDays = durationMs / (1000 * 60 * 60 * 24);
  const dailyXpRate = langInt.xpGained / durationDays;

  // Streak calculations (symmetric point-in-time)
  const baselineStreak = langBase.data?.streak ?? null;
  const currentStreak =
    langTarget.data?.streak ??
    (langBase.status === "exactOrPrevious" ? baselineStreak : null);
  const streakDelta =
    currentStreak !== null && baselineStreak !== null
      ? currentStreak - baselineStreak
      : null;

  // A streak is broken if a positive multi-day streak collapsed to 0 or 1
  const streakBroken =
    baselineStreak !== null &&
    baselineStreak > 1 &&
    currentStreak !== null &&
    currentStreak <= 1;
  const streakStatus: "active" | "broken" = streakBroken ? "broken" : "active";
  const streakStarted =
    (baselineStreak === null || baselineStreak === 0) && currentStreak !== null && currentStreak > 0;


  // Check milestone crossed (e.g. crossing 50, 100, 150... 1000, 1050, 1100)
  let streakMilestone: number | null = null;
  if (baselineStreak !== null && currentStreak !== null && currentStreak > baselineStreak) {
    const nextMilestone = Math.floor(currentStreak / 50) * 50;
    if (nextMilestone > baselineStreak && nextMilestone <= currentStreak) {
      streakMilestone = nextMilestone;
    }
  }

  const deltas: WhatChangedDeltas = {
    chess: {
      gamesCount: chessInt.gamesCount,
      decidedCount: chessInt.decidedCount,
      ratingDelta,
      baselineRating,
      currentRating,
      intervalWinRate,
      intervalWhiteWinRate: whiteWinRate,
      intervalBlackWinRate: blackWinRate,
      historicalWinRateDelta,
      colorDelta,
      historicalDelta,
    },
    languages: {
      intervalDays: durationDays,
      xpGained: langInt.xpGained,
      sessionsCount: langInt.sessionsCount,
      totalSessionMinutes: langInt.totalSessionMinutes,
      baselineCourseId,
      currentCourseId,
      courseChanged,
      dailyXpRate,
      historicalDailyXpRate: histXpRate,
    },
    streak: {
      baselineStreak,
      currentStreak,
      streakDelta,
      status: streakStatus,
      streakStarted,
      streakMilestone,
    },
  };

  const { findings, evaluations } = evaluateChanges(deltas, {
    userId,
    baselineAt: observedAt ?? input.since,
    until: input.until,
  });

  return {
    userId,
    interval: {
      since: input.since,
      until: input.until,
    },
    baseline: {
      status: baselineStatus,
      observedAt,
    },
    chess: {
      gamesCount: chessInt.gamesCount,
      decidedCount: chessInt.decidedCount,
      unknownCount: chessInt.gamesCount - chessInt.decidedCount,
      ratingDelta,
      baselineRating,
      currentRating,
      intervalWinRate,
      whiteWinRate,
      blackWinRate,
      historicalWinRateDelta,
      colorDelta,
      historicalDelta,
    },
    languages: {
      xpGained: langInt.xpGained,
      sessionsCount: langInt.sessionsCount,
      totalSessionMinutes: langInt.totalSessionMinutes,
      baselineCourseId,
      currentCourseId,
      courseChanged,
    },
    streak: {
      baselineStreak,
      currentStreak,
      streakDelta,
      status: streakStatus,
      streakStarted,
      streakMilestone,
    },
    findings,
    evaluations,
  };
}
