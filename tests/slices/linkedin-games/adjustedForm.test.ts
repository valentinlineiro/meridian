import { describe, it, expect } from "vitest";
import { adjustedForm, classifier, dayLevels, dowOf, lossMap } from "../../../src/slices/linkedin-games/domain/AdjustedForm.ts";
import { summarize } from "../../../src/slices/linkedin-games/domain/GameStats.ts";
import type { Obs } from "../../../src/slices/linkedin-games/domain/GameAnalysis.ts";

const TODAY = "2026-11-03";
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
// One observation a day for `days` days ending today; the average varies with the day, the own time follows it with elasticity 0.5
// and drifts by `drift` (log units per day).
const series = (days: number, drift = 0): Obs[] => Array.from({ length: days }, (_, i) => {
  const avg = 20 + ((i * 37) % 60);
  return { date: addDays(TODAY, i - days + 1), avg, score: Math.exp(1 + 0.5 * Math.log(avg) + drift * i) };
});

describe("adjustedForm", () => {
  it("shouldRecoverTheElasticityAndShowNoFormWhenTheOwnTimeJustFollowsTheAverage", () => {
    const f = adjustedForm(series(120), TODAY);
    expect(f.elasticity).toBeCloseTo(0.5, 6);
    expect(f.windows.all.pct).toBeCloseTo(0, 6);
    expect(f.label).toBe("sin_cambio");
  });

  it("shouldReportAnImprovementAndItsPercentWhenTheResidualFalls", () => {
    const f = adjustedForm(series(120, -0.004), TODAY);
    expect(f.label).toBe("mejora");
    expect(f.trend!.pctPer28d).toBeCloseTo((Math.exp(-0.004 * 28) - 1) * 100, 1);
    expect(f.trend!.pctPer28d).toBeLessThan(f.trend!.noise[0]);
    expect(f.windows["7"].pct).toBeGreaterThan(f.windows.all.pct!); // the last week is faster than the whole history
  });

  it("shouldReportADeteriorationWhenTheResidualRises", () => {
    expect(adjustedForm(series(120, 0.004), TODAY).label).toBe("deterioro");
  });

  it("shouldNotMoveTheFitWhenOneResultIsAnInterruption", () => {
    const clean = series(120), dirty = clean.map((o, i) => (i === 40 ? { ...o, score: o.score * 100 } : o));
    expect(adjustedForm(dirty, TODAY).elasticity).toBeCloseTo(adjustedForm(clean, TODAY).elasticity!, 6);
  });

  it("shouldGiveTheSameIntervalWhenCalledTwice", () => {
    const o = series(120, -0.002).map((p, i) => ({ ...p, score: p.score * (1 + 0.1 * Math.sin(i * 7)) }));
    expect(adjustedForm(o, TODAY)).toEqual(adjustedForm(o, TODAY));
  });

  it("shouldAskForMoreDataWhenThereAreFewerThan60ResultsWithAnAverage", () => {
    expect(adjustedForm(series(59), TODAY)).toMatchObject({ label: "pocos_datos", elasticity: null, trend: null });
    expect(adjustedForm(series(60), TODAY).elasticity).not.toBeNull();
  });

  it("shouldRarelyCallATrendWhenTheWeeklyNoiseIsAutocorrelatedAndThereIsNone", () => {
    // AR(1) weekly noise (0.5) aligned with the analysis weeks, plus daily noise; a plain weekly resampling labels ~35 % of these.
    let seed = 7;
    const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
    let called = 0;
    const N = 100;
    for (let s = 0; s < N; s++) {
      let u = 0;
      const o = Array.from({ length: 160 }, (_, i) => {
        if ((159 - i) % 7 === 0) u = 0.5 * u + Math.sqrt(0.75) * 0.15 * gauss();
        const avg = 20 + Math.floor(rand() * 60);
        return { date: addDays(TODAY, i - 159), avg, score: Math.exp(1 + 0.5 * Math.log(avg) + u + 0.2 * gauss()) };
      });
      if (["mejora", "deterioro"].includes(adjustedForm(o, TODAY).label)) called++;
    }
    expect(called / N).toBeLessThan(0.15);
  });

  it("shouldSeeAClearTrendThroughNoise", () => {
    let seed = 11;
    const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const o = series(160, -0.006).map((p) => ({ ...p, score: p.score * Math.exp(0.1 * (rand() - 0.5)) }));
    expect(adjustedForm(o, TODAY).label).toBe("mejora");
  });

  it("shouldHaveNoTrendWhenTheLast112DaysAreMostlyEmpty", () => {
    const f = adjustedForm(series(200).filter((_, i) => i < 88 || i % 4 === 0), TODAY); // 88 days before the window, then one in four
    expect(f.elasticity).not.toBeNull();
    expect(f.trend).toBeNull();
    expect(f.label).toBe("pocos_datos");
  });
});

describe("difficulty of the day", () => {
  it("shouldLeaveAResultUnclassifiedWhenItsWeekdayHasFewerThan8Results", () => {
    const few = series(7 * 7); // 7 results per weekday
    expect(classifier(few)(few[0]!)).toBeNull();
    const enough = series(7 * 8);
    expect(classifier(enough)(enough[0]!)).not.toBeNull();
  });

  it("shouldClassifyTheSlowestThirdOfAWeekdayAsHardAndTheFastestAsEasy", () => {
    const o = series(7 * 12), cl = classifier(o);
    const sameDay = o.filter((p) => dowOf(p.date) === dowOf(o[0]!.date)).sort((a, b) => a.avg! - b.avg!);
    expect(cl(sameDay[0]!)).toBe("facil");
    expect(cl(sameDay[sameDay.length - 1]!)).toBe("duro");
  });

  it("shouldTakeTheLevelMostGamesShareAndNormalOnATie", () => {
    const base = series(7 * 12);
    const easy = base.map((p) => ({ ...p })); // identical games: every vote agrees
    const levels = dayLevels([base, easy]);
    expect(levels).toHaveLength(84);
    const cl = classifier(base);
    expect(levels.filter((d) => d.level === cl(base.find((p) => p.date === d.date)!)).length).toBe(84);
    // one game says easy, the other hard, on the same day: a tie
    const hardRef = base.map((p) => ({ ...p }));
    const pivot = base.filter((p) => dowOf(p.date) === 0).sort((x, y) => x.avg! - y.avg!);
    const day = pivot[0]!.date, hardDay = pivot[pivot.length - 1]!.date;
    const swapped = hardRef.map((p) => (p.date === day ? { ...p, avg: pivot[pivot.length - 1]!.avg! } : p.date === hardDay ? { ...p, avg: pivot[0]!.avg! } : p));
    expect(dayLevels([base, swapped]).find((d) => d.date === day)!.level).toBe("normal");
  });
});

describe("lossMap", () => {
  it("shouldCountLossesByWeekdayAndNearMissesWhenTheTimeIsNotBelowTheAverage", () => {
    // 2026-11-02 is a Monday
    const o: Obs[] = [
      { date: "2026-11-02", score: 10, avg: 20 }, // win
      { date: "2026-11-09", score: 22, avg: 20 }, // near miss (1.10)
      { date: "2026-11-16", score: 40, avg: 20 }, // loss by far
      { date: "2026-11-17", score: 20, avg: 20 }, // a tie is not a win
      { date: "2026-11-18", score: 5, avg: null }, // no average: not an observation here
    ];
    const m = lossMap(o);
    expect([m.losses, m.near]).toEqual([3, 2]);
    expect(m.cells[0]).toMatchObject({ n: 3, losses: 2 });
    expect(m.cells[0]!.rate).toBeCloseTo(2 / 3, 12);
    expect(m.cells[0]!.lo).toBeLessThan(2 / 3);
    expect(m.cells[0]!.hi).toBeGreaterThan(2 / 3);
    expect(m.cells[1]).toMatchObject({ n: 1, losses: 1 });
    expect(m.cells[2]).toMatchObject({ n: 0, rate: null, lo: null });
  });
});

describe("summary", () => {
  it("shouldCarryAdjustedLossesAndDifficultyWhenSummarising", () => {
    const days = series(70).map((o) => ({ schema: 1 as const, date: o.date, games: { zip: { scoreSeconds: o.score, avgSeconds: o.avg } } }));
    const s = summarize(days, TODAY);
    expect(s.games.zip!.adjusted.elasticity).toBeCloseTo(0.5, 6);
    expect(s.games.zip!.losses.cells).toHaveLength(7);
    expect(s.difficulty.length).toBe(70);
  });
});
