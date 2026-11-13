import { diagnosisBlock, evidenceLines, evolutionFacts, extraLines, levelRows, MIN_WEEK_N, normalRange, reportSentence, resultSplit, secondsWeeks, weekdayReport, weekdayWins, weeklyBeat, weeklyTimes } from './game-report.model';
import { interpretationLines, type Game } from './games.model';

// Synthetic fixtures: only the fields the report reads.
const cell = (dow: number, n: number, losses: number, lo: number | null = null, hi: number | null = null) => ({ dow, n, losses, rate: n ? losses / n : null, lo, hi });
const weeks = (beats: (number | null)[], n = 7) => beats.map((beat, i) => ({ start: `2026-09-${String(i + 1).padStart(2, '0')}`, n, eff: 1.5, beat }));
const game = (o: Record<string, unknown> = {}) => ({
  best: { seconds: 19, date: '2026-09-28' },
  windows: { '28': { time: { median: 43, p25: 36.75, p75: 52, nTime: 28 }, beat: { rate: 24 / 28, k: 24, nBeat: 28 } } },
  trajectory: { '90': [] },
  losses: { losses: 0, near: 0, cells: [] },
  ...o,
}) as unknown as Game;
// Mon 14/26 (lo .3546), Tue 5/26 (lo .085), Wed 8/24 (lo .17), Thu 2/5 (too few), Fri-Sun none: 29 losses over 157 results (overall .1847)
const lossesQueensLike = { losses: 29, near: 15, cells: [cell(0, 26, 14, .3546, .7124), cell(1, 26, 5, .085, .3787), cell(2, 24, 8, .17, .5), cell(3, 5, 2, null, null), cell(4, 25, 0), cell(5, 25, 0), cell(6, 26, 0)] };

describe('normalRange: the middle half of the results of a period', () => {
  it('shouldGiveTheMedianTheMiddleHalfTheBestTimeAndTheN', () => {
    expect(normalRange(game(), '28')).toEqual({ median: '0:43', low: '0:37', high: '0:52', n: 28, best: { time: '0:19', date: '2026-09-28' } });
  });
  it('shouldSayNothingWhenThereIsNoMedian', () => {
    const g = game({ windows: { '28': { time: { median: null, p25: null, p75: null, nTime: 0 }, beat: { rate: null, k: 0, nBeat: 0 } } } });
    expect(normalRange(g, '28')).toBeNull();
  });
});

describe('weeklyBeat: how many days a week beat the average', () => {
  const g = game({ trajectory: { '90': weeks([.75, .86, 1, .71, .5], 7).map((w, i) => ({ ...w, n: [4, 7, 7, 7, 2][i] })) } });
  it('shouldCountOnlyWeeksWithAtLeastFivePlaysAsComplete', () => {
    expect(MIN_WEEK_N).toBe(5);
    const r = weeklyBeat(g);
    expect(r.completeCount).toBe(3);
    expect(r.weeks.map((w) => w.complete)).toEqual([false, true, true, true, false]);
  });
  it('shouldTakeTheRangeOverCompleteWeeksOnly', () => {
    const r = weeklyBeat(g);
    expect([r.min, r.max]).toEqual([.71, 1]); // the partial .5 and .75 weeks do not count
  });
  it('shouldGiveAnEmptyResultWithoutBuckets', () => {
    expect(weeklyBeat(game())).toEqual({ weeks: [], completeCount: 0, min: null, max: null });
  });
});

describe('weekdayReport: where the results are lost', () => {
  it('shouldSplitEachDayIntoWinsAndLossesAndMarkWhatStandsOut', () => {
    const r = weekdayReport(game({ losses: lossesQueensLike }));
    expect(r.rows.map((x) => x.day)).toEqual(['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']);
    expect(r.rows[0]).toMatchObject({ n: 26, losses: 14, wins: 12, enough: true, stands: true });
    expect(r.rows[1]).toMatchObject({ enough: true, stands: false }); // its interval starts below the overall rate
    expect(r.rows[2]).toMatchObject({ enough: true, stands: false }); // lo .17 < overall .1847
    expect(r.overallRate).toBeCloseTo(29 / 157, 6);
    expect(r.standing).toEqual(['lunes']);
  });
  it('shouldNotJudgeADayWithFewerThanEightResults', () => {
    const r = weekdayReport(game({ losses: lossesQueensLike }));
    expect(r.rows[3]).toMatchObject({ n: 5, losses: 2, wins: 3, enough: false, stands: false });
  });
  it('shouldNotDivideByZeroWhenAGameHasNoLosses', () => {
    const r = weekdayReport(game({ losses: { losses: 0, near: 0, cells: [0, 1, 2, 3, 4, 5, 6].map((d) => cell(d, 20, 0, 0, .16)) } }));
    expect(r.overallRate).toBe(0);
    expect(r.standing).toEqual([]); // lo 0 is not above 0
  });
  it('shouldGiveSevenEmptyDaysWithoutCells', () => {
    const r = weekdayReport(game());
    expect(r.overallRate).toBeNull();
    expect(r.rows).toHaveLength(7);
    expect(r.rows.every((x) => x.n === 0 && !x.enough && !x.stands)).toBe(true);
  });
});

describe('reportSentence: facts only, each with its condition', () => {
  const twelve = weeks([.86, .86, 1, .86, 1, .71, .86, .71, .71, .86, 1, .86]);
  const standing = (days: number[]) => ({ losses: 40, near: 0, cells: [0, 1, 2, 3, 4, 5, 6].map((d) => days.includes(d) ? cell(d, 20, 12, .4, .8) : cell(d, 20, 1, 0, .2)) });

  it('shouldSayHowOftenTheAverageIsBeatenWithItsCountAndPeriod', () => {
    expect(reportSentence(game(), '28')[0]).toBe('Le ganas a la media el 86 % de los días (24 de 28, las últimas 4 semanas)');
  });
  it('shouldSayTheWeeklyRangeFromFourCompleteWeeks', () => {
    expect(reportSentence(game({ trajectory: { '90': twelve } }), '28')[1]).toBe('En las 12 semanas completas, entre el 71 % y el 100 % de los días');
  });
  it('shouldOmitTheWeeklyClauseWithFewerThanFourCompleteWeeks', () => {
    const r = reportSentence(game({ trajectory: { '90': weeks([.86, .86, 1]) } }), '28');
    expect(r).toHaveLength(1);
  });
  it('shouldNameTheDaysThatStandOut', () => {
    expect(reportSentence(game({ losses: standing([0, 2]) }), '28').at(-1)).toBe('Se pierde más los lunes y los miércoles');
    expect(reportSentence(game({ losses: standing([0, 1, 3]) }), '28').at(-1)).toBe('Se pierde más los lunes, los martes y los jueves');
  });
  it('shouldOmitTheDaysClauseWhenNoDayStandsOut', () => {
    expect(reportSentence(game({ losses: standing([]) }), '28')).toHaveLength(1);
  });
  it('shouldSayNothingWithoutABeatRate', () => {
    const g = game({ windows: { '28': { time: { median: null, p25: null, p75: null, nTime: 0 }, beat: { rate: null, k: 0, nBeat: 0 } } } });
    expect(reportSentence(g, '28')).toEqual([]);
  });
});

// A whole synthetic game for the level, evolution and evidence blocks.
const win = (median: number, nBeat: number, k: number) => ({
  time: { median, p25: 36.75, p75: 52, nTime: nBeat }, eff: { median: 2.0375, nEff: nBeat }, beat: { rate: k / nBeat, k, nBeat },
});
const BANDS = { '28': [-0.2776, 0.3829], '28v56': [-0.2423, 0.3495], rho112: [-0.1512, 0.1652] };
const full = (o: Record<string, unknown> = {}) => ({
  firstDate: '2026-05-17', n: 177,
  windows: { '7': win(43, 7, 6), '28': win(43, 28, 24), '90': win(43, 89, 75), all: win(46, 177, 146) },
  adjusted: { label: 'sin_cambio', elasticity: .35, n: 177, windows: { '7': { pct: 5.96, n: 7 }, '28': { pct: 6.09, n: 28 }, '90': { pct: 8.1, n: 89 }, all: { pct: 0, n: 177 } }, trend: { pctPer28d: .3, noise: [-4.7, 4.06], weeks: 16 } },
  recent28vBase56: { delta: -0.0676, nCur: 28, nBase: 55 },
  trend112: { rho: .058, slopePctPer28d: 2.32, n: 111, days: 112 },
  interpretation: { label: 'estable', reason: null, pending: null, calibratedThrough: '2026-11-03', bands: BANDS },
  best: { seconds: 19, date: '2026-09-28' }, beatStreak: { current: 1, max: 13 },
  trajectory: { '90': [] }, losses: { losses: 0, near: 0, cells: [] },
  ...o,
}) as unknown as Game;

describe('levelRows: the same figures for 7 days, 4 weeks, 3 months and all', () => {
  it('shouldGiveOneRowPerPeriodWithTheLabelOfThePeriod', () => {
    const rows = levelRows(full());
    expect(rows.map((r) => [r.range, r.label])).toEqual([['7', 'Semana'], ['28', '4 semanas'], ['90', '3 meses'], ['all', 'Todo']]);
    expect(rows[1]).toEqual({ range: '28', label: '4 semanas', median: '0:43', band: '0:37–0:52', speed: '×2,04', beat: '24 de 28 (86 %)' });
  });
  it('shouldNeverPrintAZeroForAPeriodWithoutResults', () => {
    const empty = { time: { median: null, p25: null, p75: null, nTime: 0 }, eff: { median: null, nEff: 0 }, beat: { rate: null, k: 0, nBeat: 0 } };
    expect(levelRows(full({ windows: { '7': empty, '28': empty, '90': empty, all: empty } }))[0]).toMatchObject({ median: '—', band: '—', speed: '—', beat: '—' });
  });
});

describe('evolutionFacts: an estimate is not a detectable change', () => {
  it('shouldTakeTheAdjustedFormFromTheLabelThatIsAlreadyPublished', () => {
    expect(evolutionFacts(full(), '28').adjusted).toMatchObject({ value: '+6 %', detectable: false, note: 'sin cambio detectable · ruido −5 % a +4 % · las últimas 4 semanas · n = 28' });
    const up = full(); (up as unknown as { adjusted: { label: string } }).adjusted.label = 'mejora';
    expect(evolutionFacts(up, '28').adjusted).toMatchObject({ detectable: true, note: expect.stringContaining('mejora detectable · ruido') });
    const few = full(); (few as unknown as { adjusted: { label: string; trend: null } }).adjusted.label = 'pocos_datos'; (few as unknown as { adjusted: { trend: null } }).adjusted.trend = null;
    expect(evolutionFacts(few, '28').adjusted).toMatchObject({ detectable: null, note: 'aún pocos datos' });
  });
  it('shouldCompareTheLast28DaysWithTheBandOfTheGame', () => {
    expect(evolutionFacts(full(), '28').recent).toEqual({ title: 'Últimos 28 días frente a los 56 anteriores', value: '−7 %', detectable: false, note: 'dentro del ruido de este juego (−24 % a +35 %) · n = 28 y 55' });
    const out = evolutionFacts(full({ recent28vBase56: { delta: -0.3, nCur: 28, nBase: 55 } }), '28').recent;
    expect(out).toMatchObject({ value: '−30 %', detectable: true, note: 'fuera del ruido de este juego (−24 % a +35 %) · n = 28 y 55' });
  });
  it('shouldSayThereAreNoCalibratedLimitsInsteadOfJudging', () => {
    const g = full({ interpretation: { label: 'datos_insuficientes', reason: 'sin_calibracion', pending: null, calibratedThrough: null, bands: null } });
    expect(evolutionFacts(g, '28').recent).toMatchObject({ detectable: null, note: 'sin límites calibrados' });
    expect(evolutionFacts(g, '28').trend).toMatchObject({ detectable: null, note: expect.stringContaining('sin límites calibrados') });
  });
  it('shouldCallATrendDetectableOnlyWhenRhoIsBeyondItsLimitWithTheSameSignedSlope', () => {
    expect(evolutionFacts(full(), '28').trend).toEqual({ title: 'Tendencia a 112 días', value: '+2,3 % cada 4 semanas', detectable: false, note: 'estimada · sin cambio detectable · n = 111' });
    expect(evolutionFacts(full({ trend112: { rho: .3, slopePctPer28d: 4, n: 111, days: 112 } }), '28').trend).toMatchObject({ detectable: true, note: 'estimada · detectable · n = 111' });
    expect(evolutionFacts(full({ trend112: { rho: .3, slopePctPer28d: -4, n: 111, days: 112 } }), '28').trend).toMatchObject({ detectable: false }); // the server needs both to agree
    expect(evolutionFacts(full({ trend112: { rho: -.3, slopePctPer28d: -4, n: 111, days: 112 } }), '28').trend).toMatchObject({ value: '−4,0 % cada 4 semanas', detectable: true });
  });
});

describe('evidenceLines: what the data show, and nothing they do not', () => {
  it('shouldStartWithTheCountSinceTheFirstResultAndKeepTheInterpretationLines', () => {
    const g = full();
    const lines = evidenceLines(g);
    expect(lines[0]).toBe('146 de 177 días mejor que la media (82 %), desde el 17 may 2026');
    for (const l of interpretationLines(g)) expect(lines).toContain(l);
  });
  it('shouldSaySomethingIsMissingInsteadOfNoChangeWhenThereIsTooLittleData', () => {
    const g = full({ interpretation: { label: 'datos_insuficientes', reason: 'cobertura_insuficiente', pending: null, calibratedThrough: '2026-11-03', bands: BANDS } });
    const lines = evidenceLines(g);
    for (const l of interpretationLines(g)) expect(lines).toContain(l);
    expect(lines.join(' ')).toContain('Faltan observaciones');
    expect(lines.join(' ')).not.toMatch(/sin cambio|Ninguna señal supera/i);
  });
  it('shouldOmitTheDateWhenTheFirstResultIsUnknown', () => {
    expect(evidenceLines(full({ firstDate: undefined }))[0]).toBe('146 de 177 días mejor que la media (82 %)');
  });
});

describe('secondsWeeks: the weekly series in seconds against the published average', () => {
  const wk = (weekStart: string, n: number, medianSec: number, medianAvgSec: number | null, medianEff: number | null) => ({ weekStart, n, nWithAvg: medianAvgSec == null ? 0 : n, medianSec, medianAvgSec, medianEff });
  it('shouldListTheNewestWeeksFirstWithTheirOwnAndTheReferenceTime', () => {
    const g = game({ weekly: [wk('2026-10-26', 7, 43, 61, 1.42), wk('2026-11-02', 2, 50, null, null)] });
    expect(secondsWeeks(g)).toEqual([
      { start: '2026-11-02', own: '0:50', ref: '—', speed: '—', n: 2, complete: false },
      { start: '2026-10-26', own: '0:43', ref: '1:01', speed: '×1,42', n: 7, complete: true },
    ]);
  });
  it('shouldKeepOnlyTheLastEightWeeks', () => {
    const many = Array.from({ length: 12 }, (_, i) => wk(`2026-09-${String(i + 1).padStart(2, '0')}`, 7, 40, 60, 1.5));
    expect(secondsWeeks(game({ weekly: many }))).toHaveLength(8);
  });
  it('shouldBeNullWithoutTheField', () => {
    expect(secondsWeeks(game())).toBeNull();
    expect(secondsWeeks(game({ weekly: [] }))).toBeNull();
  });
});

describe('extraLines: savings, spread and outlier days, as statements with their n', () => {
  const outliers = (o: object = {}) => ({ n: 40, minN: 20, good: [], bad: [], ...o });
  it('shouldSayTheSavingsWithMedianTotalAndNAndThatItIsNotAdjustedForDifficulty', () => {
    const l = extraLines(game({ savings: { medianSec: 12, totalSec: 5400, n: 150 } }));
    expect(l[0]).toBe('Frente a la media de LinkedIn: ahorras 12 s en la partida mediana (n = 150); acumulado, ahorras 90 min en 150 partidas (suma histórica, sin descontar la dificultad)');
  });
  it('shouldSayLosesWhenTheSavingsAreNegative', () => {
    expect(extraLines(game({ savings: { medianSec: -5, totalSec: -100, n: 10 } }))[0]).toBe('Frente a la media de LinkedIn: pierdes 5 s en la partida mediana (n = 10); acumulado, pierdes 100 s en 10 partidas (suma histórica, sin descontar la dificultad)');
  });
  it('shouldGiveTheSpreadOfEfficiencyWithItsN', () => {
    expect(extraLines(game({ effSpread: { p25: 1.5, p75: 3, ratio: 2, n: 40 } }))[0]).toBe('Amplitud de la velocidad: de ×1,50 a ×3,00 la media en la mitad central de tus partidas (P75/P25 = 2,0; n = 40)');
  });
  it('shouldSayTooFewDaysWhenThereAreNotEnoughForOutliers', () => {
    expect(extraLines(game({ outliers: outliers({ n: 12 }) }))[0]).toBe('Días atípicos: aún pocos datos (n = 12; hacen falta 20)');
  });
  it('shouldSayNoneWhenNoDayStandsOutWithEnoughData', () => {
    expect(extraLines(game({ outliers: outliers() }))[0]).toBe('Días atípicos por velocidad: ninguno en 40 partidas (convención estadística, no diagnóstico)');
  });
  it('shouldListGoodAndBadDaysByDateAndCapTheListAtFive', () => {
    const d = (n: number, eff: number) => Array.from({ length: n }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, eff }));
    const l = extraLines(game({ outliers: outliers({ good: d(7, 3), bad: d(1, 0.5) }) }));
    expect(l[0]).toBe('Días atípicos por velocidad (convención estadística, no calibrada con estos datos): 7 muy buenos (los 5 más recientes: 3 oct 2026, 4 oct 2026, 5 oct 2026, 6 oct 2026, 7 oct 2026) y 1 muy flojo (1 oct 2026)');
  });
  it('shouldGiveNothingWhenTheContractCarriesNoneOfThem', () => {
    expect(extraLines(game())).toEqual([]);
  });
});

describe('diagnosisBlock: what stands out, as an association and never a cause', () => {
  const dim = (evaluable = true, reason: string | null = null) => ({ evaluable, reason, p: evaluable ? 0.5 : null });
  const diag = (o: Record<string, unknown> = {}) => ({ status: 'vigente', calibratedThrough: '2026-11-11', dimensions: { weekday: dim(), regularity: dim() }, findings: [], watch: null, ...o });
  const g = (d: unknown) => game({ n: 157, diagnosis: d, losses: lossesQueensLike });

  it('shouldHideTheBlockWhenThereIsNoDiagnosisOrNoCalibrationForTheGame', () => {
    expect(diagnosisBlock(game())).toBeNull();
    expect(diagnosisBlock(g(diag({ status: 'sin_calibracion', dimensions: null })))).toBeNull();
  });
  it('shouldOnlySayTheCalibrationIsStaleAndShowNoFindingWhenExpired', () => {
    const f = { dimension: 'weekday', sign: 1, kind: 'debilidad', dow: 0, pAdjusted: 0.01 };
    expect(diagnosisBlock(g(diag({ status: 'caducada', dimensions: null, findings: [f] })))).toEqual({ stale: true, notes: ['Calibración caducada; pendiente de actualizar'], highlights: [], watch: null });
  });
  it('shouldPublishAWeakWeekdayWithTheDayAndItsNumberOfResults', () => {
    const b = diagnosisBlock(g(diag({ findings: [{ dimension: 'weekday', sign: 1, kind: 'debilidad', dow: 0, pAdjusted: 0.01 }] })))!;
    expect(b.highlights).toEqual([{ kind: 'debilidad', text: 'Los lunes se pierde más que el resto de la semana (14 derrotas en 26 partidas)' }]);
  });
  it('shouldPublishAStrongWeekdayAsStrength', () => {
    const b = diagnosisBlock(g(diag({ findings: [{ dimension: 'weekday', sign: -1, kind: 'fortaleza', dow: 5, pAdjusted: 0.01 }] })))!;
    expect(b.highlights[0]).toEqual({ kind: 'fortaleza', text: 'Los sábados se pierde menos que el resto de la semana (0 derrotas en 25 partidas)' });
  });
  it('shouldPublishRegularityBothWays', () => {
    const w = diagnosisBlock(g(diag({ findings: [{ dimension: 'regularity', sign: 1, kind: 'debilidad', dow: null, pAdjusted: 0.02 }] })))!;
    const s = diagnosisBlock(g(diag({ findings: [{ dimension: 'regularity', sign: -1, kind: 'fortaleza', dow: null, pAdjusted: 0.02 }] })))!;
    expect(w.highlights[0]!.text).toBe('Tus tiempos se han vuelto menos regulares en las últimas 8 semanas (157 partidas en total)');
    expect(s.highlights[0]!.text).toBe('Tus tiempos se han vuelto más regulares en las últimas 8 semanas (157 partidas en total)');
  });
  it('shouldKeepAWatchApartAndMarkItUnconfirmed', () => {
    const b = diagnosisBlock(g(diag({ watch: { dimension: 'weekday', p: 0.048, unconfirmed: true } })))!;
    expect(b.highlights).toEqual([]);
    expect(b.watch).toEqual({ text: 'Para observar: una posible asociación con el día de la semana, aún sin confirmar', unconfirmed: true });
    expect(diagnosisBlock(g(diag({ watch: { dimension: 'regularity', p: 0.15, unconfirmed: false } })))!.watch!.text).toBe('Para observar: una posible variación de la regularidad de tus tiempos');
  });
  it('shouldSayExactlyWhyTheWeekdayCannotBeTestedInsteadOfNothingStandsOut', () => {
    const b = diagnosisBlock(g(diag({ dimensions: { weekday: dim(false, 'sin_derrotas_suficientes'), regularity: dim(false, 'historial_insuficiente') } })))!;
    expect(b.notes).toEqual(['Sin derrotas suficientes para contrastar el día', 'Historial insuficiente para contrastar la regularidad']);
  });
  it('shouldNeverUseCausalWords', () => {
    const f = [{ dimension: 'weekday', sign: 1, kind: 'debilidad', dow: 0, pAdjusted: 0.01 }, { dimension: 'regularity', sign: 1, kind: 'debilidad', dow: null, pAdjusted: 0.01 }];
    const all = JSON.stringify(diagnosisBlock(g(diag({ findings: f, watch: { dimension: 'weekday', p: .1, unconfirmed: true } }))));
    expect(all).not.toMatch(/efecto|causa|por culpa|debido/i);
  });
});

describe('weeklyTimes: your time and the published average, week by week', () => {
  const wk = (i: number, o: Record<string, unknown> = {}) => ({ weekStart: `2026-08-${String(i).padStart(2, '0')}`, n: 7, nWithAvg: 7, medianSec: 50 + i, medianAvgSec: 60, medianEff: 1.2, ...o });
  it('shouldGiveTheLastTwelveWeeksOldestFirst', () => {
    const g = game({ weekly: Array.from({ length: 14 }, (_, i) => wk(14 - i)) }); // given newest first
    const r = weeklyTimes(g)!;
    expect(r).toHaveLength(12);
    expect([r[0]!.start, r[11]!.start]).toEqual(['2026-08-03', '2026-08-14']);
    expect(r[11]).toEqual({ start: '2026-08-14', own: 64, ref: 60, n: 7, complete: true });
  });
  it('shouldKeepAWeekWithoutAverageAndMarkAThinWeekAsIncomplete', () => {
    const r = weeklyTimes(game({ weekly: [wk(1, { medianAvgSec: null }), wk(2, { n: 2 })] }))!;
    expect(r.map((w) => [w.ref, w.complete])).toEqual([[null, true], [60, false]]);
  });
  it('shouldSayNothingWithoutTheWeeklySeries', () => {
    expect(weeklyTimes(game())).toBeNull();
    expect(weeklyTimes(game({ weekly: [] }))).toBeNull();
  });
});

describe('weekdayWins: how often you beat the average each weekday', () => {
  it('shouldGiveTheShareOfWinsPerDayAndTheGamesOverallShare', () => {
    const r = weekdayWins(game({ losses: lossesQueensLike }));
    expect(r.rows.map((d) => d.letter)).toEqual(['L', 'M', 'X', 'J', 'V', 'S', 'D']);
    expect(r.rows[0]).toMatchObject({ n: 26, stands: true });
    expect(r.rows[0]!.rate).toBeCloseTo(12 / 26, 10);
    expect(r.overall).toBeCloseTo(1 - 29 / 157, 5);
  });
  it('shouldNotGiveAShareForADayWithTooFewResults', () => {
    expect(weekdayWins(game({ losses: lossesQueensLike })).rows[3]).toMatchObject({ n: 5, rate: null, stands: false });
  });
});

describe('resultSplit: results above, in line with and below the average', () => {
  const eff = (date: string, v: number) => ({ date, eff: v, roll: 1 });
  const series = [eff('2026-09-01', 0.5), eff('2026-10-20', 1.2), eff('2026-10-25', 1.03), eff('2026-10-28', 0.96), eff('2026-11-01', 0.8), eff('2026-11-05', 1.5)];
  it('shouldCountTheResultsOfThePeriodWithAFivePercentBandAsInLine', () => {
    expect(resultSplit(game({ series }), '28', '2026-11-10')).toEqual({ above: 2, line: 2, below: 1, n: 5 });
  });
  it('shouldTakeTheWholeHistoryForAll', () => {
    expect(resultSplit(game({ series }), 'all', '2026-11-10')).toEqual({ above: 2, line: 2, below: 2, n: 6 });
  });
  it('shouldSayNothingWhenThePeriodHasNoResults', () => {
    expect(resultSplit(game({ series }), '7', '2026-11-30')).toBeNull();
  });
});
