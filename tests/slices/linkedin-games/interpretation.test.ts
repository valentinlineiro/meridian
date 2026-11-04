import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { arrow28, candidate, publish } from "../../../src/slices/linkedin-games/domain/GameInterpretation.ts";
import { NOISE_BANDS, parseNoiseBands, type GameBands, type NoiseBands } from "../../../src/slices/linkedin-games/domain/NoiseBands.ts";
import { recent28vBase56, trend112 } from "../../../src/slices/linkedin-games/domain/GameTrend.ts";
import { summarize } from "../../../src/slices/linkedin-games/domain/GameStats.ts";
import type { DayRecord } from "../../../src/slices/linkedin-games/domain/LinkedinGames.ts";

const TODAY = "2026-11-03";
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const entry = (score: number, avg: number) => ({ number: null, score: `0:${score}`, scoreSeconds: score, avg: `0:${avg}`, avgSeconds: avg });
// one record per day for `count` days ending today; eff = avg / 100 with score 100
const daily = (game: string, count: number, avgAt: (i: number) => number): DayRecord[] =>
  Array.from({ length: count }, (_, i) => ({ schema: 1, date: addDays(TODAY, i - count + 1), games: { [game]: entry(100, avgAt(i)) } }));
const ZIP = NOISE_BANDS.games.zip!;
const trend = (rho: number, slopePctPer28d: number) => ({ rho, slopePctPer28d, n: 100, days: 112 });
const recent = (delta: number) => ({ delta, nCur: 27, nBase: 54 });

describe("noise bands artefact", () => {
  it("shouldBeTheCalibrationArtefactCopiedWithoutChanges", () => {
    const bytes = readFileSync(resolve(process.cwd(), "src/slices/linkedin-games/domain/noise-bands.json"));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe("92cc20ca927f716b5364d6a495662eb6a30aea04db73cff857d01ed0543d8702");
  });

  it("shouldExposeTheFourCalibratedGamesAndNeitherTangoNorWend", () => {
    expect(Object.keys(NOISE_BANDS.games).sort()).toEqual(["mini_sudoku", "patches", "queens", "zip"]);
    expect(NOISE_BANDS.calibratedThrough).toBe("2026-11-03");
  });

  it("shouldMapTheArtefactStatisticsToTheContractKeys", () => {
    expect(ZIP).toEqual({ "28": [-0.2552, 0.3433], "28v56": [-0.2263, 0.2971], rho112: [-0.1888, 0.183] });
  });

  it("shouldRejectAMalformedArtefact", () => {
    const ok = { calibratedThrough: "2026-11-03", games: { g: { limits: { d28v28: [-0.2, 0.3], d28v56: [-0.2, 0.3], rho112: [-0.2, 0.2] } } } };
    expect(() => parseNoiseBands(ok)).not.toThrow();
    expect(() => parseNoiseBands({ ...ok, games: { g: { limits: { d28v28: [0.3, -0.2], d28v56: [-0.2, 0.3], rho112: [-0.2, 0.2] } } } })).toThrow(/invalid band/);
    expect(() => parseNoiseBands({ ...ok, games: { g: { limits: { d28v28: [-0.2, 0.3], rho112: [-0.2, 0.2] } } } })).toThrow(/invalid band/);
    expect(() => parseNoiseBands({ games: {} })).toThrow(/calibratedThrough/);
  });
});

describe("candidate label", () => {
  it("shouldBeInsufficientWhenTheGameHasNoCalibration", () => {
    expect(candidate(trend(0.9, 5), recent(0.5), null)).toEqual({ label: "datos_insuficientes", reason: "sin_calibracion" });
  });

  it("shouldBeInsufficientWhenAnyMeasureLacksCoverage", () => {
    expect(candidate(null, recent(0), ZIP)).toEqual({ label: "datos_insuficientes", reason: "cobertura_insuficiente" });
    expect(candidate(trend(0, 0), null, ZIP)).toEqual({ label: "datos_insuficientes", reason: "cobertura_insuficiente" });
  });

  it("shouldBeDeteriorationRecentWhenTheLast28DaysFallBelowTheLowerLimit", () => {
    expect(candidate(trend(0, 0), recent(ZIP["28v56"][0] - 0.001), ZIP)).toEqual({ label: "deterioro", reason: "reciente" });
  });

  it("shouldBeSustainedDeteriorationWhenRhoIsBelowItsLimitAndTheSlopeIsNegative", () => {
    expect(candidate(trend(ZIP.rho112[0] - 0.01, -2), recent(0), ZIP)).toEqual({ label: "deterioro", reason: "sostenido" });
  });

  it("shouldBeSustainedImprovementWhenRhoIsAboveItsLimitAndTheSlopeIsPositive", () => {
    expect(candidate(trend(ZIP.rho112[1] + 0.01, 2), recent(0), ZIP)).toEqual({ label: "mejora_sostenida", reason: null });
  });

  it("shouldBeStableWhenNoSignalExceedsItsLimit", () => {
    expect(candidate(trend(0.1, 1), recent(0.05), ZIP)).toEqual({ label: "estable", reason: null });
  });

  it("shouldNotCountAValueEqualToTheLimitAsBeyondIt", () => {
    expect(candidate(trend(ZIP.rho112[1], 2), recent(ZIP["28v56"][0]), ZIP).label).toBe("estable");
    expect(candidate(trend(ZIP.rho112[0], -2), recent(0), ZIP).label).toBe("estable");
  });

  it("shouldPreferDeteriorationOverImprovementWhenBothSignalsAppear", () => {
    expect(candidate(trend(ZIP.rho112[1] + 0.1, 3), recent(ZIP["28v56"][0] - 0.1), ZIP)).toEqual({ label: "deterioro", reason: "reciente" });
  });

  // Spearman and Theil-Sen measure different things. If they disagree no sustained trend is declared.
  it.each([[0], [-1.5]])("shouldNotDeclareSustainedImprovementWhenRhoIsAboveItsLimitButTheSlopeIs %s", (slope) => {
    expect(candidate(trend(ZIP.rho112[1] + 0.3, slope), recent(0), ZIP)).toEqual({ label: "estable", reason: null });
  });

  it.each([[0], [1.5]])("shouldNotDeclareSustainedDeteriorationWhenRhoIsBelowItsLimitButTheSlopeIs %s", (slope) => {
    expect(candidate(trend(ZIP.rho112[0] - 0.3, slope), recent(0), ZIP)).toEqual({ label: "estable", reason: null });
  });
});

describe("publication with the two-week rule (option B)", () => {
  const imp = { label: "mejora_sostenida", reason: null } as const;
  const det = { label: "deterioro", reason: "reciente" } as const;
  const stable = { label: "estable", reason: null } as const;
  const insufficient = { label: "datos_insuficientes", reason: "cobertura_insuficiente" } as const;

  it("shouldPublishTheLabelWhenTheSameCandidateHoldsTodayAndAWeekAgo", () => {
    expect(publish(imp, imp)).toEqual({ label: "mejora_sostenida", reason: null, pending: null });
    expect(publish(det, { label: "deterioro", reason: "sostenido" })).toEqual({ label: "deterioro", reason: "reciente", pending: null });
  });

  it("shouldKeepStableAndNamePendingWhenTheCandidateIsNotConfirmed", () => {
    expect(publish(imp, stable)).toEqual({ label: "estable", reason: null, pending: "mejora_sostenida" });
    expect(publish(det, imp)).toEqual({ label: "estable", reason: null, pending: "deterioro" });
  });

  it("shouldNotConfirmAgainstAWeekWithoutEnoughData", () => {
    expect(publish(imp, insufficient)).toEqual({ label: "estable", reason: null, pending: "mejora_sostenida" });
  });

  it("shouldPublishInsufficientDataAndStableAsTheyAre", () => {
    expect(publish(insufficient, imp)).toEqual({ label: "datos_insuficientes", reason: "cobertura_insuficiente", pending: null });
    expect(publish(stable, imp)).toEqual({ label: "estable", reason: null, pending: null });
  });
});

describe("28-day arrow", () => {
  const eff = (value: number | null, nCur = 20, nPrev = 20) => ({ value, nCur, nPrev });
  const [lo, hi] = ZIP["28"];

  it("shouldPointUpOrDownOnlyBeyondTheCalibratedBand", () => {
    expect(arrow28(eff(hi + 0.001), ZIP)).toBe("up");
    expect(arrow28(eff(lo - 0.001), ZIP)).toBe("down");
    expect(arrow28(eff(0.1), ZIP)).toBe("flat");
  });

  it("shouldTreatAValueEqualToABandEdgeAsInsideTheNoise", () => {
    expect(arrow28(eff(hi), ZIP)).toBe("flat");
    expect(arrow28(eff(lo), ZIP)).toBe("flat");
  });

  it("shouldBeNullWithoutCalibrationWithoutAValueOrWithoutBothWindowsCovered", () => {
    expect(arrow28(eff(0.9), null)).toBeNull();
    expect(arrow28(eff(null), ZIP)).toBeNull();
    expect(arrow28(eff(0.9, 16, 20), ZIP)).toBeNull();
    expect(arrow28(eff(0.9, 20, 16), ZIP)).toBeNull();
    expect(arrow28(eff(0.9, 17, 17), ZIP)).toBe("up");
  });
});

describe("composition in the summary", () => {
  const custom = (g: Partial<GameBands>): NoiseBands => ({ calibratedThrough: "2026-11-03", games: { zip: { "28": [-0.3, 0.3], "28v56": [-0.2, 0.2], rho112: [-0.99, 0.99], ...g } } });

  it("shouldMarkAGameWithoutCalibrationAsInsufficientAndGiveItNoArrowOrBand", () => {
    const g = summarize(daily("tango", 170, (i) => 150 + (i % 5)), TODAY).games.tango!;
    expect(g.interpretation).toMatchObject({ label: "datos_insuficientes", reason: "sin_calibracion", bands: null, calibratedThrough: null, pending: null });
    expect(g.windows["28"].delta!.effRel).toMatchObject({ arrow: null, band: null });
    expect(g.regression).toBe(false);
  });

  it("shouldPublishDeteriorationAndSetTheObsoleteRegressionFlagWhenTheDropHoldsTodayAndAWeekAgo", () => {
    const g = summarize(daily("zip", 170, (i) => (i >= 170 - 35 ? 100 : 200)), TODAY, custom({})).games.zip!; // a 50 % drop 35 days ago
    expect(g.interpretation).toMatchObject({ label: "deterioro", reason: "reciente", candidate: "deterioro", previousCandidate: "deterioro", pending: null });
    expect(g.regression).toBe(true);
  });

  it("shouldKeepStableAndReportThePendingCandidateWhenTheDropIsOnlyConfirmedToday", () => {
    const g = summarize(daily("zip", 170, (i) => (i >= 170 - 20 ? 100 : 200)), TODAY, custom({})).games.zip!; // drop started 20 days ago
    expect(g.interpretation).toMatchObject({ label: "estable", candidate: "deterioro", previousCandidate: "estable", pending: "deterioro" });
    expect(g.regression).toBe(false);
  });

  it("shouldPublishSustainedImprovementWhenTheTrendHoldsTodayAndAWeekAgo", () => {
    const g = summarize(daily("zip", 170, (i) => 100 + i), TODAY, custom({ rho112: [-0.2, 0.2], "28v56": [-0.9, 0.9] })).games.zip!;
    expect(g.trend112!.rho).toBeGreaterThan(0.9);
    expect(g.interpretation).toMatchObject({ label: "mejora_sostenida", reason: null, pending: null });
  });

  it("shouldAttachTheArrowAndBandOnlyToTheEffRelOfThe28DayWindow", () => {
    const g = summarize(daily("zip", 170, (i) => 150 + (i % 7)), TODAY).games.zip!;
    expect(g.windows["28"].delta!.effRel).toMatchObject({ arrow: expect.stringMatching(/^(up|down|flat)$/), band: ZIP["28"] });
    for (const k of ["7", "90", "all"] as const) if (g.windows[k].delta) expect(Object.keys(g.windows[k].delta!.effRel).sort()).toEqual(["nCur", "nPrev", "value"]);
    expect(Object.keys(g.windows["28"].delta!.beatPp).sort()).toEqual(["nCur", "nPrev", "value"]);
  });

  it("shouldNotChangeAnyP0MeasureWhenInterpretationIsAdded", () => {
    const days = daily("zip", 170, (i) => 120 + ((i * 37) % 90));
    const withBands = summarize(days, TODAY).games.zip!, without = summarize(days, TODAY, { calibratedThrough: "x", games: {} }).games.zip!;
    const p0 = (g: typeof withBands) => {
      const { interpretation, regression, windows, ...rest } = g; // the interpretation-related fields
      const { "28": w28, ...others } = windows;
      const { delta, ...w28rest } = w28;
      const eff = delta && { ...delta, effRel: { value: delta.effRel.value, nCur: delta.effRel.nCur, nPrev: delta.effRel.nPrev } };
      return { rest, others, w28: { ...w28rest, delta: eff } };
    };
    expect(p0(withBands)).toEqual(p0(without));
  });

  it("shouldBeDeterministic", () => {
    const days = daily("zip", 170, (i) => 120 + ((i * 37) % 90));
    expect(summarize(days, TODAY)).toEqual(summarize(days, TODAY));
  });

  it("shouldReturnNullMeasuresAndInsufficientDataWhenThereIsNoCoverage", () => {
    const g = summarize(daily("zip", 30, () => 150), TODAY).games.zip!;
    expect(g.trend112).toBeNull();
    expect(g.recent28vBase56).toBeNull();
    expect(g.interpretation).toMatchObject({ label: "datos_insuficientes", reason: "cobertura_insuficiente" });
  });
});

// Synthetic check of the calibration (design §5): independent noise at the scale of the games, the real artefact limits.
function prng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function labelRate(game: string, sigma: number, growthPer112: number, series = 20): { improvement: number; deterioration: number } {
  const L = 112 + 7 * 52 - 1, bands = NOISE_BANDS.games[game]!;
  let imp = 0, det = 0, evals = 0;
  for (let s = 0; s < series; s++) {
    const r = prng(1000 + s), z = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
    const obs = Array.from({ length: L }, (_, i) => ({ date: addDays("2025-06-01", i), score: 100, avg: Math.max(1, Math.round(100 * Math.exp(sigma * z()) * Math.pow(growthPer112, i / 112))) }));
    for (let t = 111; t < L; t += 7) {
      const c = candidate(trend112(obs, obs[t]!.date), recent28vBase56(obs, obs[t]!.date), bands);
      evals++; if (c.label === "mejora_sostenida") imp++; if (c.label === "deterioro") det++;
    }
  }
  return { improvement: imp / evals, deterioration: det / evals };
}

describe("calibration on synthetic series", () => {
  it("shouldRaiseFewFalseCandidatesWhenThereIsNoRealChange", () => {
    const r = labelRate("mini_sudoku", 0.28, 1);
    expect(r.improvement).toBeLessThan(0.06);
    expect(r.deterioration).toBeLessThan(0.1);
  }, 60_000);

  it("shouldDetectAnInjectedThirtyPercentTrendInAFairShareOfWeeksAndASixtyPercentOneAlmostAlways", () => {
    expect(labelRate("mini_sudoku", 0.28, 1.3).improvement).toBeGreaterThan(0.25); // ~40 %: a 30 % rise in 16 weeks is not always distinguishable
    expect(labelRate("mini_sudoku", 0.28, 1.6).improvement).toBeGreaterThan(0.9);
  }, 60_000);
});
