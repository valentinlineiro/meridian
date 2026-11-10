import { MIN_WEEK_N, normalRange, reportSentence, weekdayReport, weeklyBeat } from './game-report.model';
import type { Game } from './games.model';

// Synthetic fixtures: only the fields the report reads.
const cell = (dow: number, n: number, losses: number, lo: number | null = null, hi: number | null = null) => ({ dow, n, losses, rate: n ? losses / n : null, lo, hi });
const weeks = (beats: (number | null)[], n = 7) => beats.map((beat, i) => ({ start: `2026-09-${String(i + 1).padStart(2, '0')}`, n, eff: 1.5, beat }));
const game = (o: Partial<Record<'windows' | 'trajectory' | 'losses' | 'best', unknown>> = {}) => ({
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
