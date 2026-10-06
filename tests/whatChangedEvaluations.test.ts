import { describe, it, expect } from "vitest";
import { evaluateChanges, evaluateSignificantChanges, salience, type WhatChangedDeltas } from "../src/domain/whatChanged.ts";
import { evaluateSignificantChanges as legacy } from "./fixtures/legacyWhatChanged.ts"; // verbatim copy of the function on main before this change
import { newcombeDiff, scaleDelta, distinguishable } from "../src/domain/proportion.ts";
import { getWhatChangedUseCase } from "../src/application/getWhatChangedUseCase.ts";
import type { WhatChangedPort } from "../src/ports/whatChangedPort.ts";

const ctx = { userId: "u1", baselineAt: "2026-09-20T00:00:00.000Z", until: "2026-09-27T00:00:00.000Z" };
const clear = { diff: 40, lower: 10, upper: 60 }, wide = { diff: 40, lower: -16, upper: 72 };

type Over = { chess?: Partial<WhatChangedDeltas["chess"]>; languages?: Partial<WhatChangedDeltas["languages"]>; streak?: Partial<WhatChangedDeltas["streak"]> };
const deltas = (o: Over = {}): WhatChangedDeltas => ({
  chess: { gamesCount: 20, decidedCount: 20, ratingDelta: 0, baselineRating: 800, currentRating: 800, intervalWinRate: 50, intervalWhiteWinRate: 70, intervalBlackWinRate: 30, historicalWinRateDelta: null, colorDelta: clear, historicalDelta: null, ...o.chess },
  languages: { intervalDays: 7, xpGained: 500, sessionsCount: 5, totalSessionMinutes: 60, baselineCourseId: "A", currentCourseId: "A", courseChanged: false, dailyXpRate: 100, historicalDailyXpRate: 50, ...o.languages },
  streak: { baselineStreak: 10, currentStreak: 12, streakDelta: 2, status: "active", streakStarted: false, streakMilestone: null, ...o.streak },
});
const evalOf = (id: string, o: Over = {}) => evaluateChanges(deltas(o), ctx).evaluations.find((e) => e.id === id)!;

describe("golden: findings are unchanged by the evaluation refactor", () => {
  it("shouldProduceByteIdenticalFindingsAcrossAGridOfInputs", () => {
    let n = 0;
    for (const ratingDelta of [null, 0, 24, 25, -30])
    for (const decidedCount of [0, 9, 10, 40])
    for (const [w, b] of [[null, null], [70, 30], [55, 45], [30, 70], [50, null], [65, 50], [64.9, 50], [50, 65]] as const)
    for (const colorDelta of [null, clear, wide, { diff: -40, lower: -60, upper: -10 }])
    for (const [intervalDays, xpGained, hist, rate] of [[7, 500, 50, 100], [2, 500, 50, 100], [3, 500, 50, 100], [7, 199, 50, 100], [7, 200, 50, 100], [7, 100, 50, 100], [7, 500, 0, 100], [7, 500, 50, 64], [7, 500, 50, 65]] as const)
    for (const courseChanged of [false, true])
    for (const [milestone, status] of [[null, "active"], [100, "active"], [null, "broken"]] as const) {
      const d = deltas({
        chess: { ratingDelta, decidedCount, gamesCount: decidedCount + 2, intervalWhiteWinRate: w, intervalBlackWinRate: b, colorDelta },
        languages: { intervalDays, xpGained, historicalDailyXpRate: hist, dailyXpRate: rate, courseChanged },
        streak: { streakMilestone: milestone, status },
      });
      expect(JSON.stringify(evaluateSignificantChanges(d, ctx))).toBe(JSON.stringify(legacy(d, ctx)));
      expect(JSON.stringify(evaluateChanges(d, ctx).findings)).toBe(JSON.stringify(legacy(d, ctx)));
      n++;
    }
    expect(n).toBe(5 * 4 * 8 * 4 * 9 * 2 * 3);
  });
});

describe("CHESS_COLOR_ASYMMETRY evaluation", () => {
  it("shouldBeEmittedWithNoReasonsWhenEveryConditionHolds", () => {
    const e = evalOf("CHESS_COLOR_ASYMMETRY");
    expect(e).toMatchObject({ kind: "statistical", status: "emitted", reasons: [] });
  });
  it.each([
    ["insufficient_sample", { decidedCount: 9 }],
    ["effect_below_threshold", { intervalWhiteWinRate: 55, intervalBlackWinRate: 45 }],
    ["interval_includes_zero", { colorDelta: wide }],
  ])("shouldReportOnly%sWhenOnlyThatConditionFails", (reason, chess) => {
    expect(evalOf("CHESS_COLOR_ASYMMETRY", { chess: chess as any })).toMatchObject({ status: "not_emitted", reasons: [reason] });
  });
  it("shouldReportEveryFailingConditionNotJustTheFirst", () => {
    const e = evalOf("CHESS_COLOR_ASYMMETRY", { chess: { decidedCount: 9, intervalWhiteWinRate: 55, intervalBlackWinRate: 45, colorDelta: wide } });
    expect(e.reasons).toEqual(["insufficient_sample", "effect_below_threshold", "interval_includes_zero"]);
  });
  it("shouldReportDataUnavailableNotEffectBelowThresholdWhenAColourHasNoRate", () => {
    const e = evalOf("CHESS_COLOR_ASYMMETRY", { chess: { intervalBlackWinRate: null, colorDelta: null } });
    expect(e.reasons).toEqual(["data_unavailable"]);
    expect(salience(e)).toBe("no_indication"); // no observed effect to reach the threshold
  });
  it("shouldKeepTheObservedEffectInMetricsEvenWhenNotEmitted", () => {
    const e = evalOf("CHESS_COLOR_ASYMMETRY", { chess: { decidedCount: 9, colorDelta: wide } });
    expect(e.metrics).toMatchObject({ decidedCount: 9, whiteWinRate: 70, blackWinRate: 30, diffPp: 40, diffCiLower: -16, diffCiUpper: 72 });
  });
  it("shouldGiveReasonsInAStableCanonicalOrderRegardlessOfEvaluation", () => {
    const a = evalOf("CHESS_COLOR_ASYMMETRY", { chess: { colorDelta: wide, decidedCount: 5 } }).reasons;
    expect(a).toEqual(["insufficient_sample", "interval_includes_zero"]);
  });
});

describe("CHESS_RATING_JUMP evaluation", () => {
  it("shouldBeEmittedWhenTheJumpReachesTheThreshold", () => {
    expect(evalOf("CHESS_RATING_JUMP", { chess: { ratingDelta: -25 } })).toMatchObject({ kind: "threshold", status: "emitted", reasons: [] });
  });
  it("shouldReportEffectBelowThresholdWhenTheJumpIsSmall", () => {
    const e = evalOf("CHESS_RATING_JUMP", { chess: { ratingDelta: 24 } });
    expect(e).toMatchObject({ status: "not_emitted", reasons: ["effect_below_threshold"] });
    expect(e.metrics).toMatchObject({ ratingDelta: 24 });
  });
  it("shouldReportDataUnavailableWhenThereIsNoRatingDelta", () => {
    expect(evalOf("CHESS_RATING_JUMP", { chess: { ratingDelta: null } }).reasons).toEqual(["data_unavailable"]);
  });
});

describe("LANG_XP_ACCELERATION evaluation", () => {
  it("shouldBeEmittedWhenAllConditionsHold", () => {
    expect(evalOf("LANG_XP_ACCELERATION", { languages: { dailyXpRate: 65, historicalDailyXpRate: 50 } })).toMatchObject({ kind: "threshold", status: "emitted", reasons: [] });
  });
  it.each([
    ["span_too_short", { intervalDays: 2 }],
    ["insufficient_sample", { xpGained: 199 }],
    ["data_unavailable", { historicalDailyXpRate: 0 }],
    ["effect_below_threshold", { dailyXpRate: 64 }],
  ])("shouldReportOnly%sWhenOnlyThatConditionFails", (reason, languages) => {
    expect(evalOf("LANG_XP_ACCELERATION", { languages: { dailyXpRate: 100, historicalDailyXpRate: 50, ...languages } as any }).reasons).toEqual([reason]);
  });
  it("shouldCombineSpanVolumeAndEffectReasons", () => {
    expect(evalOf("LANG_XP_ACCELERATION", { languages: { intervalDays: 1, xpGained: 10, dailyXpRate: 10, historicalDailyXpRate: 50 } }).reasons)
      .toEqual(["insufficient_sample", "effect_below_threshold", "span_too_short"]);
  });
});

describe("event rules produce no evaluations", () => {
  it("shouldEmitEvaluationsOnlyForStatisticalAndThresholdRules", () => {
    const ids = evaluateChanges(deltas({ languages: { courseChanged: true, baselineCourseId: "A", currentCourseId: "B" }, streak: { streakMilestone: 100, status: "broken" } }), ctx).evaluations.map((e) => e.id);
    expect(ids).toEqual(["CHESS_RATING_JUMP", "CHESS_COLOR_ASYMMETRY", "LANG_XP_ACCELERATION"]);
  });
  it("shouldNotInventANotEmittedEvaluationForAnEventThatDidNotHappen", () => {
    const ev = evaluateChanges(deltas(), ctx).evaluations;
    expect(ev.every((e) => e.kind !== ("event" as any))).toBe(true);
    expect(ev.some((e) => e.id.startsWith("STREAK") || e.id === "LANG_ACTIVE_COURSE_SWITCH")).toBe(false);
  });
});

describe("salience is derived from the evaluation alone", () => {
  it("shouldClassifyEmittedInconclusiveAndNoIndication", () => {
    expect(salience(evalOf("CHESS_COLOR_ASYMMETRY"))).toBe("finding");
    expect(salience(evalOf("CHESS_COLOR_ASYMMETRY", { chess: { colorDelta: wide } }))).toBe("inconclusive");
    expect(salience(evalOf("CHESS_COLOR_ASYMMETRY", { chess: { decidedCount: 9 } }))).toBe("inconclusive");
    expect(salience(evalOf("CHESS_COLOR_ASYMMETRY", { chess: { intervalWhiteWinRate: 55, intervalBlackWinRate: 45, colorDelta: wide } }))).toBe("no_indication");
    expect(salience(evalOf("LANG_XP_ACCELERATION", { languages: { intervalDays: 2 } }))).toBe("no_indication"); // span is not a sample/interval reason
  });

  it("shouldCoverEveryFindingThatTheIntervalRuleRemoved", () => {
    // Pre-P1.5b rule: decided >= 10 and |white − black| >= 15 pp. Removed by A(b) when the interval includes 0.
    for (const [ww, wn, bw, bn] of [[4, 5, 2, 5], [8, 10, 4, 10], [15, 20, 5, 20], [3, 6, 1, 6], [30, 40, 20, 40], [26, 40, 20, 40]] as Array<[number, number, number, number]>) {
      const colorDelta = scaleDelta(newcombeDiff({ wins: ww, n: wn }, { wins: bw, n: bn }), 100);
      const d = deltas({ chess: { decidedCount: wn + bn, intervalWhiteWinRate: (ww / wn) * 100, intervalBlackWinRate: (bw / bn) * 100, colorDelta } });
      const removed = Math.abs((ww / wn - bw / bn) * 100) >= 15 && wn + bn >= 10 && !distinguishable(colorDelta);
      const e = evaluateChanges(d, ctx).evaluations.find((x) => x.id === "CHESS_COLOR_ASYMMETRY")!;
      if (removed) expect(salience(e)).toBe("inconclusive");
      expect(evaluateChanges(d, ctx).findings.some((f) => f.id === "CHESS_COLOR_ASYMMETRY")).toBe(salience(e) === "finding");
    }
  });
});

describe("what-changed use case transports evaluations", () => {
  const none = { status: "unavailable", data: null } as const;
  const port = (interval: any): WhatChangedPort => ({
    resolveUserId: async () => "u1",
    getChessBaseline: async () => ({ status: "exactOrPrevious", data: { rating: 800, observedAt: ctx.baselineAt, lifetimeGames: 100, lifetimeDecided: 100, lifetimeWins: 50 } }),
    getChessInterval: async () => ({ gamesCount: 0, decidedCount: 0, wins: 0, whiteGames: 0, whiteDecided: 0, whiteWins: 0, blackGames: 0, blackDecided: 0, blackWins: 0, latestRating: null, ...interval }),
    getLanguagesBaseline: async () => none, getLanguagesTarget: async () => none,
    getLanguagesInterval: async () => ({ xpGained: 0, sessionsCount: 0, totalSessionMinutes: 0, daysWithActivity: 0 }),
    getHistoricalDailyXpRate: async () => 0,
  });

  it("shouldReportTheFiveVsFiveCaseAsInconclusiveWithoutAddingAFinding", async () => {
    const r = await getWhatChangedUseCase(port({ gamesCount: 10, decidedCount: 10, wins: 6, whiteGames: 5, whiteDecided: 5, whiteWins: 4, blackGames: 5, blackDecided: 5, blackWins: 2 }), { since: ctx.baselineAt, until: ctx.until });
    expect(r.findings.some((f) => f.id === "CHESS_COLOR_ASYMMETRY")).toBe(false);
    const e = r.evaluations.find((x) => x.id === "CHESS_COLOR_ASYMMETRY")!;
    expect(e).toMatchObject({ status: "not_emitted", reasons: ["interval_includes_zero"] });
    expect(salience(e)).toBe("inconclusive");
  });

  it("shouldEmitTheEvaluationAndTheFindingTogetherWhenEvidenceIsClear", async () => {
    const r = await getWhatChangedUseCase(port({ gamesCount: 40, decidedCount: 40, wins: 20, whiteGames: 20, whiteDecided: 20, whiteWins: 15, blackGames: 20, blackDecided: 20, blackWins: 5 }), { since: ctx.baselineAt, until: ctx.until });
    expect(r.findings.some((f) => f.id === "CHESS_COLOR_ASYMMETRY")).toBe(true);
    expect(r.evaluations.find((x) => x.id === "CHESS_COLOR_ASYMMETRY")).toMatchObject({ status: "emitted", reasons: [] });
  });
});
