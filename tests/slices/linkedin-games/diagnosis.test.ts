import { describe, it, expect } from "vitest";
import { adjust, diagnose, diagnosisStats, MAX_AGE_DAYS, parseDiagnosisThresholds, publishable, DIAGNOSIS_THRESHOLDS, type DiagnosisThresholds, type Finding } from "../../../src/slices/linkedin-games/domain/GameDiagnosis.ts";
import { summarize } from "../../../src/slices/linkedin-games/domain/GameStats.ts";
import type { Obs } from "../../../src/slices/linkedin-games/domain/GameAnalysis.ts";
import type { DayRecord } from "../../../src/slices/linkedin-games/domain/LinkedinGames.ts";

// Phase 3, delivery 2: the diagnosis of one game (docs/superpowers/specs/2026-11-11-games-report-phase3-methodology.md; calibration in
// docs/audits/linkedin-games-phase3-calibration). The statistics must equal the Python reference (calibrate.py) on the same synthetic data.
// Synthetic game: 135 recorded days from 2026-03-02 (a Monday) to 2026-07-29, some days unrecorded and some results without an average.
const ROWS: Array<[string, number, number | null]> = [["2026-03-02",29,30],["2026-03-04",22,30],["2026-03-05",37,30],["2026-03-06",34,38],["2026-03-07",30,38],["2026-03-08",32,38],["2026-03-09",12,30],["2026-03-10",21,30],["2026-03-11",23,30],["2026-03-12",28,30],["2026-03-13",26,38],["2026-03-14",31,38],["2026-03-15",32,38],["2026-03-17",43,30],["2026-03-18",20,30],["2026-03-20",26,38],["2026-03-21",45,null],["2026-03-22",20,38],["2026-03-23",8,30],["2026-03-25",23,30],["2026-03-26",42,30],["2026-03-27",33,null],["2026-03-28",54,38],["2026-03-30",28,30],["2026-03-31",39,30],["2026-04-01",18,30],["2026-04-02",35,30],["2026-04-03",31,38],["2026-04-04",64,38],["2026-04-05",28,38],["2026-04-06",20,30],["2026-04-07",27,30],["2026-04-08",32,30],["2026-04-09",25,30],["2026-04-10",56,38],["2026-04-11",59,38],["2026-04-12",36,38],["2026-04-13",28,30],["2026-04-14",21,30],["2026-04-15",25,30],["2026-04-16",43,30],["2026-04-17",29,38],["2026-04-18",20,38],["2026-04-19",44,38],["2026-04-21",41,30],["2026-04-22",21,30],["2026-04-23",22,30],["2026-04-24",30,38],["2026-04-25",38,38],["2026-04-26",27,38],["2026-04-27",23,30],["2026-04-28",20,30],["2026-04-29",34,30],["2026-04-30",29,30],["2026-05-02",26,null],["2026-05-03",45,38],["2026-05-04",19,30],["2026-05-05",26,30],["2026-05-06",26,30],["2026-05-07",35,30],["2026-05-08",26,38],["2026-05-09",28,38],["2026-05-10",23,38],["2026-05-11",17,30],["2026-05-12",15,30],["2026-05-13",33,30],["2026-05-14",31,30],["2026-05-15",39,38],["2026-05-16",37,38],["2026-05-17",33,38],["2026-05-18",23,null],["2026-05-19",32,30],["2026-05-20",22,30],["2026-05-21",26,30],["2026-05-22",38,38],["2026-05-23",19,38],["2026-05-25",32,30],["2026-05-28",29,30],["2026-05-29",39,null],["2026-05-30",19,38],["2026-05-31",30,38],["2026-06-01",14,30],["2026-06-03",42,30],["2026-06-04",62,30],["2026-06-05",15,38],["2026-06-06",58,38],["2026-06-07",65,38],["2026-06-08",17,30],["2026-06-09",32,30],["2026-06-10",23,30],["2026-06-11",31,30],["2026-06-12",35,null],["2026-06-13",56,38],["2026-06-14",43,38],["2026-06-15",31,30],["2026-06-16",32,null],["2026-06-17",21,null],["2026-06-18",47,30],["2026-06-19",32,38],["2026-06-21",41,38],["2026-06-22",19,null],["2026-06-24",17,30],["2026-06-25",53,30],["2026-06-26",112,38],["2026-06-27",34,38],["2026-06-28",37,38],["2026-06-29",48,30],["2026-06-30",26,30],["2026-07-01",26,30],["2026-07-02",39,30],["2026-07-03",40,38],["2026-07-04",30,38],["2026-07-05",34,38],["2026-07-06",13,30],["2026-07-07",41,30],["2026-07-08",42,30],["2026-07-10",32,38],["2026-07-11",73,38],["2026-07-12",14,38],["2026-07-13",25,30],["2026-07-15",33,30],["2026-07-16",33,30],["2026-07-17",35,38],["2026-07-18",28,38],["2026-07-19",33,38],["2026-07-20",13,30],["2026-07-21",30,30],["2026-07-22",22,30],["2026-07-23",11,30],["2026-07-24",41,38],["2026-07-25",65,38],["2026-07-26",40,38],["2026-07-27",15,30],["2026-07-28",25,30],["2026-07-29",22,30]];
const OBS: Obs[] = ROWS.map(([date, score, avg]) => ({ date, score, avg }));
const LAST = "2026-07-29";
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// What the Python reference computed on these same rows at each cut (Monday = 0): [weekday stat, weekday dow, regularity change].
const REF: Record<number, [number, number, number]> = { 0: [0.2506265664160401, 3, 0.12065454216191651], 7: [0.28851540616246496, 3, 0.1613309878875424], 15: [0.2687, 3, 0.1342], 21: [0.2639, 3, -0.0299], 22: [0.2697, 3, -0.1651], 28: [0.255, 3, -0.0762] };

// An artefact whose replicates are fixed pairs (weekday, regularity): the p-values are then known by hand.
const R = 999;
const artefact = (rep: (i: number) => [number, number], ev: Partial<DiagnosisThresholds["games"][string]["evaluable"]> = {}, calibratedThrough = LAST): DiagnosisThresholds => ({
  version: 2, calibratedThrough, replicates: R, alpha: 0.05, entropy: 1, dimensions: ["weekday", "regularity"],
  games: { zip: { evaluable: { weekday: true, regularity: true, weekdayReason: null, losses: 48, ...ev }, replicates: Array.from({ length: R }, (_, i) => rep(i)) } },
});
const FAR = 0.9, TINY = 0.001; // a statistic far above / far below what the data show
const flat = (wk: number, reg: number) => artefact(() => [wk, reg]);

describe("statistics: the same numbers as the Python reference", () => {
  it.each([[0], [7], [15], [21], [22], [28]])("shouldMatchTheReferenceWhenTheCutIsTodayMinus%iDays", (k) => {
    const s = diagnosisStats(OBS, addDays(LAST, -k));
    const [wk, dow, reg] = REF[k]!;
    const digits = k === 0 || k === 7 ? 12 : 4;
    expect(s.weekday!.stat).toBeCloseTo(wk, digits);
    expect(s.weekday!.dow).toBe(dow);
    expect(s.regularity!.diff).toBeCloseTo(reg, digits);
    expect(s.regularity!.stat).toBeCloseTo(Math.abs(reg), digits);
  });

  it("shouldCountTheLossesOfTheDaysWithAnAverage", () => {
    expect(diagnosisStats(OBS, LAST).losses).toBe(48);
  });

  it("shouldNeverChooseADayWithFewerResultsThanTheMinimumEvenIfAllOfThemAreLosses", () => {
    // Saturdays: three results, all losses (efficiency .5); every other recorded day beats the average. Only Saturday would stand out.
    const obs: Obs[] = [];
    for (let i = 0; i < 20 * 7; i++) {
      const date = addDays("2026-03-02", i), dow = i % 7;
      if (dow === 5) { if (Math.floor(i / 7) < 3) obs.push({ date, score: 20, avg: 10 }); continue; }
      obs.push({ date, score: 10, avg: 15 });
    }
    const s = diagnosisStats(obs, addDays("2026-03-02", 20 * 7 - 1));
    expect(s.weekday?.dow).not.toBe(5);
  });

  it("shouldHaveNoWeekdayWhenNoDayReachesTheMinimumOfResults", () => {
    const few = OBS.filter((o) => o.date <= "2026-04-01");
    expect(diagnosisStats(few, "2026-04-01").weekday).toBeNull();
    expect(diagnosisStats(few, "2026-04-01").regularity).toBeNull(); // not even 112 days
  });
});

describe("adjust: exact permutation p-values over the pool of data plus replicates", () => {
  const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const naive = (obs: [number, number], reps: [number, number][]) => {
    const pool = [obs, ...reps], N = pool.length;
    const p = pool.map((a) => [0, 1].map((k) => pool.filter((b) => b[k]! >= a[k]!).length / N));
    const U = p.map((r) => Math.min(r[0]!, r[1]!));
    return { p: p[0]!, adjusted: [0, 1].map((k) => U.filter((u) => u <= p[0]![k]!).length / N) };
  };

  it("shouldEqualTheNaiveDefinitionOnRandomData", () => {
    const r = rng(7);
    for (let t = 0; t < 20; t++) {
      const reps = Array.from({ length: 200 }, () => [Math.round(r() * 20) / 20, Math.round(r() * 20) / 20] as [number, number]); // rounded: many ties
      const obs: [number, number] = [Math.round(r() * 20) / 20, Math.round(r() * 20) / 20];
      const got = adjust(obs, reps, [true, true]), want = naive(obs, reps);
      expect(got.p).toEqual(want.p);
      expect(got.adjusted).toEqual(want.adjusted);
    }
  });

  it("shouldCountTiesWithTheDataSoTheTestIsConservative", () => {
    const r = adjust([0.5, 0.5], Array.from({ length: 99 }, () => [0.5, 0.5] as [number, number]), [true, true]);
    expect(r.p).toEqual([1, 1]);
    expect(r.adjusted).toEqual([1, 1]);
  });

  it("shouldGiveAnExtremeStatisticTheSmallestPossiblePAndFlagNothingForADimensionThatCannotBeTested", () => {
    const reps = Array.from({ length: 999 }, () => [0.01, 0.01] as [number, number]);
    const r = adjust([0.5, 0.5], reps, [true, false]);
    expect(r.p).toEqual([0.001, 1]); // weekday: only the data are at least as extreme; regularity not testable: constant, p = 1
    expect(r.adjusted).toEqual([0.001, 1]);
  });
});

describe("diagnose: findings, what to watch, expiry", () => {
  const dx = (th: DiagnosisThresholds, cutBack = 0, today = LAST) => diagnose("zip", OBS, addDays(LAST, -cutBack), today, th);

  it("shouldPublishAFindingOnlyWhenTheSameOneStoodAWeekEarlier", () => {
    const d = dx(flat(FAR, TINY)); // regularity extreme at both cuts (+ and +); the weekday cannot stand out
    expect(d.status).toBe("vigente");
    expect(d.findings).toEqual([{ dimension: "regularity", sign: 1, kind: "debilidad", dow: null, pAdjusted: 0.001 }]);
    expect(d.watch).toBeNull();
  });

  it("shouldNotPublishAFindingWhoseSignChangedSinceAWeekEarlierAndOfferItAsUnconfirmed", () => {
    const d = dx(flat(FAR, TINY), 15); // regularity +0.134 now, -0.165 a week earlier
    expect(d.findings).toEqual([]);
    expect(d.watch).toEqual({ dimension: "regularity", p: 0.001, unconfirmed: true });
  });

  it("shouldCallANarrowerSpreadAStrengthWhenItIsConfirmed", () => {
    const d = dx(flat(FAR, TINY), 21); // -0.030 now and -0.076 a week earlier
    expect(d.findings.map((f) => [f.dimension, f.sign, f.kind])).toEqual([["regularity", -1, "fortaleza"]]);
  });

  it("shouldCallMoreLossesOnADayAWeaknessAndNameTheDay", () => {
    const d = dx(flat(TINY, FAR));
    expect(d.findings.map((f) => [f.dimension, f.sign, f.kind, f.dow])).toEqual([["weekday", 1, "debilidad", 3]]);
  });

  it("shouldOfferAnUnconfirmedDimensionWithPUpToOneFifthAndNothingBeyond", () => {
    const at = (reps: number) => artefact((i) => [i < reps ? FAR : 0, FAR]);
    expect(dx(at(199)).watch).toEqual({ dimension: "weekday", p: 0.2, unconfirmed: false }); // 1 - p = 0.8: included
    expect(dx(at(200)).watch).toBeNull(); // p = 0.201: not
  });

  it("shouldNotWatchTheDimensionThatAlreadyHasAPublishedFinding", () => {
    const d = dx(flat(TINY, TINY));
    expect(d.findings.map((f) => f.dimension).sort()).toEqual(["regularity", "weekday"]);
    expect(d.watch).toBeNull();
  });

  it("shouldSayWhyADimensionCannotBeTestedAndNeverFlagItEvenWhenTheDataLookExtreme", () => {
    const d = dx(artefact(() => [TINY, FAR], { weekday: false, weekdayReason: "sin_derrotas_suficientes" }));
    expect(d.dimensions!.weekday).toEqual({ evaluable: false, reason: "sin_derrotas_suficientes", p: null });
    expect(d.findings).toEqual([]);
    expect(d.watch).toBeNull();
  });

  it("shouldNotPublishWhenTheCutAWeekEarlierHadFewerThanTheMinimumOfObservations", () => {
    // Monday to Thursday for 15 weeks plus the next Monday: 61 results today and 57 a week earlier (< MIN_FIT = 60, as in the calibration),
    // yet every logged weekday has at least 8 results at both cuts. Mondays are losses, the other days wins: the weekday stands out at both.
    const obs: Obs[] = [];
    for (let w = 0; w <= 15; w++) for (let dow = 0; dow < (w === 15 ? 1 : 4); dow++) obs.push({ date: addDays("2026-03-02", 7 * w + dow), score: dow === 0 ? 20 : 10, avg: dow === 0 ? 10 : 15 });
    const to = obs[obs.length - 1]!.date;
    expect(obs.length).toBe(61);
    expect(diagnosisStats(obs, addDays(to, -7)).weekday).not.toBeNull(); // testable a week earlier too: only the minimum of results is missing
    const d = diagnose("zip", obs, to, to, flat(TINY, FAR));
    expect(d.findings).toEqual([]);
    expect(d.watch).toEqual({ dimension: "weekday", p: 0.001, unconfirmed: true });
  });

  it("shouldHideEverythingOnceTheCalibrationIsOlderThan28Days", () => {
    const th = flat(TINY, TINY);
    expect(MAX_AGE_DAYS).toBe(28);
    expect(dx(th, 0, addDays(LAST, 28)).status).toBe("vigente");
    const old = dx(th, 0, addDays(LAST, 29));
    expect(old).toEqual({ status: "caducada", calibratedThrough: LAST, dimensions: null, findings: [], watch: null });
  });

  it("shouldReportNoCalibrationForAGameThatIsNotInTheArtefact", () => {
    expect(diagnose("wend", OBS, LAST, LAST, flat(TINY, TINY))).toEqual({ status: "sin_calibracion", calibratedThrough: LAST, dimensions: null, findings: [], watch: null });
  });
});

describe("publishable: the same aspect, sign and day a week earlier", () => {
  const f = (o: Partial<Finding> = {}): Finding => ({ dimension: "weekday", sign: 1, kind: "debilidad", dow: 0, pAdjusted: 0.01, ...o });
  it.each([
    ["the same finding", f(), [f()], true],
    ["a different day (Monday then Friday)", f({ dow: 4 }), [f()], false],
    ["a different sign", f({ sign: -1, kind: "fortaleza" }), [f()], false],
    ["a different dimension", f({ dimension: "regularity", dow: null }), [f()], false],
    ["nothing a week earlier", f(), [], false],
  ])("shouldBePublishableWhen%s", (_n, today, before, ok) => { expect(publishable(today as Finding, before as Finding[])).toBe(ok); });
});

describe("the artefact", () => {
  it("shouldParseTheCalibratedArtefactAndLeaveOutGamesWithNoTestableDimension", () => {
    expect(Object.keys(DIAGNOSIS_THRESHOLDS.games).sort()).toEqual(["mini_sudoku", "patches", "queens", "tango", "zip"]);
    expect(DIAGNOSIS_THRESHOLDS.games.queens!.replicates).toHaveLength(1000);
    expect(DIAGNOSIS_THRESHOLDS.games.mini_sudoku!.evaluable).toMatchObject({ weekday: false, weekdayReason: "sin_derrotas_suficientes", regularity: true });
  });
  it.each([[{ version: 1 }], [{ version: 2, calibratedThrough: "x", replicates: 1, alpha: 0.05, games: {} }], [null]])("shouldRejectAMalformedArtefact%#", (bad) => {
    expect(() => parseDiagnosisThresholds(bad)).toThrow();
  });
  it("shouldRejectAReplicateThatIsNotAFinitePair", () => {
    const good = artefact(() => [0.1, 0.1]);
    expect(() => parseDiagnosisThresholds({ ...good, games: { zip: { ...good.games.zip, replicates: [[0.1]] } } })).toThrow();
    expect(() => parseDiagnosisThresholds({ ...good, games: { zip: { ...good.games.zip, replicates: [[0.1, Number.NaN]] } } })).toThrow();
  });
});

describe("summarize carries the diagnosis and never changes the verdict", () => {
  const day = (date: string, avg: number, score: number): DayRecord => ({ schema: 1, date, games: { zip: { number: null, score: `0:${score}`, scoreSeconds: score, avg: `0:${avg}`, avgSeconds: avg } } });
  const days = ROWS.filter(([, , a]) => a !== null).map(([d, s, a]) => day(d, a!, s));

  it("shouldAddADiagnosisToEachGameWithoutTouchingItsInterpretation", () => {
    const withIt = summarize(days, LAST, undefined, flat(TINY, TINY)).games.zip!;
    const without = summarize(days, LAST, undefined, { ...flat(TINY, TINY), games: {} }).games.zip!;
    expect(withIt.diagnosis.status).toBe("vigente");
    expect(without.diagnosis.status).toBe("sin_calibracion");
    expect(withIt.interpretation).toEqual(without.interpretation);
  });

  it("shouldAnchorTheCutOnTheLastRecordedDateNotOnToday", () => {
    const a = summarize(days, LAST, undefined, flat(TINY, TINY)).games.zip!.diagnosis;
    const b = summarize(days, addDays(LAST, 10), undefined, flat(TINY, TINY)).games.zip!.diagnosis;
    expect(b.findings).toEqual(a.findings);
  });
});
