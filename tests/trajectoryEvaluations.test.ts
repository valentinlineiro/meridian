import { describe, it, expect } from "vitest";
import { evaluateTrajectory, evaluateTrajectoryPatterns, type TrajectoryInput } from "../src/domain/trajectory.ts";
import { evaluateTrajectoryPatterns as legacy } from "./fixtures/legacyTrajectory.ts"; // verbatim copy of the function before trajectory evaluations
import { CRITERIA, salience } from "../src/domain/whatChanged.ts";
import { getTrajectoryUseCase } from "../src/application/getTrajectoryUseCase.ts";

const ID = "CHESS_COLOR_ASYMMETRY_LONGITUDINAL";
const era = (ww: number, wd: number, bw: number, bd: number) => ({ whiteGames: wd, whiteDecided: wd, whiteWins: ww, blackGames: bd, blackDecided: bd, blackWins: bw });
// 80 white decided (75%) vs 80 black decided (50%), +25 pp in both eras, 123 days, 75 active days: every condition holds.
const base = (o: Partial<TrajectoryInput["chess"]> = {}): TrajectoryInput => ({
  chess: {
    startedAt: "2026-05-01T00:00:00.000Z", endedAt: "2026-09-01T00:00:00.000Z", totalGames: 160, activeDays: 75,
    ...era(60, 80, 40, 80), h1: era(30, 40, 20, 40), h2: era(30, 40, 20, 40), ...o,
  },
  languages: { startedAt: null, endedAt: null, activeDays: 0, h1: { courses: [] }, h2: { courses: [] } },
});
const ev = (o: Partial<TrajectoryInput["chess"]> = {}) => evaluateTrajectory(base(o)).evaluations.find((e) => e.id === ID)!;

describe("golden: trajectory findings are unchanged by the evaluation refactor", () => {
  it("shouldProduceByteIdenticalFindingsAcrossAGridOfInputs", () => {
    let n = 0;
    for (const [ww, wd] of [[0, 0], [29, 39], [30, 40], [60, 80]] as const)
      for (const [bw, bd] of [[0, 0], [20, 39], [20, 40], [40, 80], [60, 80]] as const)
        for (const activeDays of [59, 60])
          for (const end of ["2026-06-29T00:00:00.000Z", "2026-06-30T00:00:00.000Z", "2026-09-01T00:00:00.000Z"])
            for (const [h1, h2] of [
              [era(30, 40, 20, 40), era(30, 40, 20, 40)], [era(30, 40, 20, 40), era(30, 40, 28, 40)], [era(0, 0, 0, 0), era(30, 40, 20, 40)],
              [era(20, 40, 30, 40), era(30, 40, 20, 40)], [era(30, 40, 20, 40), era(24, 40, 20, 40)],
            ] as const)
              for (const startedAt of ["2026-05-01T00:00:00.000Z", null]) {
                const input = base({ startedAt, endedAt: end, activeDays, whiteWins: ww, whiteDecided: wd, whiteGames: wd, blackWins: bw, blackDecided: bd, blackGames: bd, h1, h2 });
                input.languages = { startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-09-01T00:00:00.000Z", activeDays: 90, h1: { courses: [{ courseId: "A", xp: 5000 }] }, h2: { courses: [{ courseId: "B", xp: 5000 }, { courseId: "A", xp: 500 }] } };
                expect(JSON.stringify(evaluateTrajectoryPatterns(input))).toBe(JSON.stringify(legacy(input)));
                expect(JSON.stringify(evaluateTrajectory(input).findings)).toBe(JSON.stringify(legacy(input)));
                n++;
              }
    expect(n).toBe(4 * 5 * 2 * 3 * 5 * 2);
  });
});

describe("CHESS_COLOR_ASYMMETRY_LONGITUDINAL evaluation", () => {
  it("shouldBeEmittedWithNoReasonsWhenEveryConditionHolds", () => {
    expect(ev()).toMatchObject({ kind: "statistical", status: "emitted", reasons: [] });
    expect(evaluateTrajectory(base()).findings).toHaveLength(1);
  });

  it.each([
    ["insufficient_sample", { whiteDecided: 39, whiteGames: 39, whiteWins: 30 }, "a colour under the decided minimum"],
    ["insufficient_sample", { activeDays: 59 }, "active days under the minimum"],
    ["span_too_short", { endedAt: "2026-06-29T00:00:00.000Z" }, "calendar span of 59 days"],
    ["data_unavailable", { h1: era(0, 0, 0, 0) }, "an era without one colour decided"],
    ["data_unavailable", { startedAt: null }, "no temporal extremes"],
    ["persistence_not_met", { h2: era(30, 40, 28, 40) }, "second era below the era criterion"],
    ["persistence_not_met", { h2: era(20, 40, 30, 40) }, "second era with the opposite sign"],
  ] as const)("shouldReportOnly%sWhenOnly(%#)ThatConditionFails", (reason, over, _what) => {
    expect(ev(over as any)).toMatchObject({ status: "not_emitted", reasons: [reason] });
  });

  it("shouldReportEffectBelowThresholdWhenTheGlobalDifferenceIsSmall", () => {
    const e = ev({ whiteWins: 56, blackWins: 52, h1: era(28, 40, 26, 40), h2: era(28, 40, 26, 40) });
    expect(e.reasons).toContain("effect_below_threshold");
    expect(e.reasons).not.toContain("data_unavailable");
  });

  it("shouldReportIntervalIncludesZeroAloneWhenTheEffectReachesTheCriterionButTheIntervalIncludesZero", () => {
    // 65% vs 50% with 40 decided per colour: +15 pp, but the 95% interval of the difference includes 0
    const e = ev({ whiteWins: 26, whiteDecided: 40, whiteGames: 40, blackWins: 20, blackDecided: 40, blackGames: 40, h1: era(13, 20, 10, 20), h2: era(13, 20, 10, 20) });
    expect(e.reasons).toEqual(["interval_includes_zero"]);
    expect(salience(e)).toBe("inconclusive");
  });

  it("shouldReportEveryFailingConditionNotJustTheFirst", () => {
    const e = ev({ whiteDecided: 39, whiteGames: 39, whiteWins: 30, activeDays: 59, endedAt: "2026-06-29T00:00:00.000Z", h2: era(30, 40, 28, 40) });
    expect(e.reasons).toEqual(["insufficient_sample", "persistence_not_met", "span_too_short"]) // canonical order, no semantic order;
  });

  it("shouldKeepTheObservedEffectInMetricsWhenNotEmitted", () => {
    const e = ev({ activeDays: 59 });
    expect(e.metrics).toMatchObject({ diffPp: 25, whiteWinRate: 75, blackWinRate: 50, activeDays: 59, totalDays: 123, h1DiffSigned: 25, h2DiffSigned: 25 });
  });

  it("shouldClassifyASampleOnlyShortfallAsInconclusiveAndAPersistenceFailureAsNoIndication", () => {
    expect(salience(ev({ activeDays: 59 }))).toBe("inconclusive");
    expect(salience(ev({ h2: era(30, 40, 28, 40) }))).toBe("no_indication");
  });

  it("shouldCarryItsOwnWindowSoItDoesNotDependOnTheCompositeSpanOfTheResponse", () => {
    expect(ev().metrics).toMatchObject({ startedAt: "2026-05-01T00:00:00.000Z", endedAt: "2026-09-01T00:00:00.000Z" });
    expect(ev({ startedAt: null, endedAt: null }).metrics).not.toHaveProperty("startedAt");
  });

  it("shouldCarryTheCriteriaOfTheRule", () => {
    expect(ev().criteria).toEqual(CRITERIA.CHESS_COLOR_ASYMMETRY_LONGITUDINAL);
  });

  it("shouldReportDataUnavailableNotEffectBelowThresholdWhenThereIsNoActivityAtAll", () => {
    const e = evaluateTrajectory({ ...base(), chess: { startedAt: null, endedAt: null, totalGames: 0, activeDays: 0, ...era(0, 0, 0, 0), h1: era(0, 0, 0, 0), h2: era(0, 0, 0, 0) } }).evaluations[0]!;
    expect(e.reasons).toEqual(["insufficient_sample", "data_unavailable"]);
  });

  it("shouldNotEvaluateTheLanguageFocusShiftWhichHasNoContractYet", () => {
    const input = base();
    input.languages = { startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-09-01T00:00:00.000Z", activeDays: 90, h1: { courses: [{ courseId: "A", xp: 5000 }] }, h2: { courses: [{ courseId: "B", xp: 5000 }, { courseId: "A", xp: 500 }] } };
    const r = evaluateTrajectory(input);
    expect(r.findings.map((f) => f.type)).toContain("LANG_FOCUS_SHIFT_LONGITUDINAL");
    expect(r.evaluations.map((e) => e.id)).toEqual([ID]);
  });

  it("shouldTransportTheEvaluationThroughTheUseCase", async () => {
    const port = {
      resolveUserId: async () => "u1",
      getChessTrajectoryData: async () => base({ activeDays: 59 }).chess,
      getLanguagesTrajectoryData: async () => base().languages,
    };
    const res = await getTrajectoryUseCase(port as any, {});
    expect(res.findings).toEqual([]);
    expect(res.evaluations).toHaveLength(1);
    expect(res.evaluations[0]).toMatchObject({ id: ID, reasons: ["insufficient_sample"] });
  });
});
