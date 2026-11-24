import { eloTrend, MIN_GAMES, PERIODS, periodSummary, rankPoints, sliceWeeks, sumTally, winRate } from './periods';
import { Tally, WeekBucket } from './weekly.model';

const T = (w = 0, d = 0, l = 0, u = 0, disconnections = 0): Tally => ({ w, d, l, u, disconnections });
const sum = (...ts: Tally[]) => sumTally(ts);
/** A week whose total is the sum of its colour tallies. */
const wk = (week: string, parts: { white?: Tally; black?: Tally; families?: Record<string, Tally>; endgame?: Tally } = {}): WeekBucket => {
  const byColor: Record<string, Tally> = {};
  if (parts.white) byColor['white'] = parts.white;
  if (parts.black) byColor['black'] = parts.black;
  const total = sum(...Object.values(byColor));
  return { week, games: total.w + total.d + total.l + total.u, total, byColor, byFamily: parts.families ?? {}, byPhase: parts.endgame ? { endgame: parts.endgame } : {}, eloEnd: null };
};
const NOW = new Date('2026-11-24T12:00:00Z');

describe('sliceWeeks', () => {
  it('shouldIncludeWeeksStartingOnOrAfterTheCutoffWhenSlicing30d', () => {
    const weeks = ['2026-10-19', '2026-10-26', '2026-11-23'].map((w) => wk(w));
    expect(sliceWeeks(weeks, '30d', NOW).current.map((w) => w.week)).toEqual(['2026-10-26', '2026-11-23']);
    // cutoff exactly on a Monday: that Monday is in
    expect(sliceWeeks(weeks, '30d', new Date('2026-11-25T12:00:00Z')).current.map((w) => w.week)).toEqual(['2026-10-26', '2026-11-23']);
    expect(sliceWeeks(weeks, '30d', new Date('2026-11-26T12:00:00Z')).current.map((w) => w.week)).toEqual(['2026-11-23']);
  });

  it('shouldReturnTheSameLengthWindowBeforeAsPreviousWhenSlicing90d', () => {
    const weeks = ['2026-05-25', '2026-06-01', '2026-08-24', '2026-08-31'].map((w) => wk(w));
    const { current, previous } = sliceWeeks(weeks, '90d', NOW);
    expect(current.map((w) => w.week)).toEqual(['2026-08-31']);
    expect(previous.map((w) => w.week)).toEqual(['2026-06-01', '2026-08-24']);
  });

  it('shouldReturnAllWeeksAndNoPreviousWhenKeyIsAll', () => {
    const weeks = ['2020-01-06', '2026-11-23'].map((w) => wk(w));
    const out = sliceWeeks(weeks, 'all', NOW);
    expect(out.current).toHaveLength(2);
    expect(out.previous).toEqual([]);
  });

  it('shouldOfferTheFourPeriodsInOrderWhenListingChoices', () => {
    expect(PERIODS.map((p) => p.k)).toEqual(['30d', '90d', '1y', 'all']);
  });
});

describe('tallies', () => {
  it('shouldAddEveryFieldWhenSummingTallies', () => {
    expect(sumTally([T(1, 2, 3, 4, 1), T(1, 1, 1, 1, 1)])).toEqual(T(2, 3, 4, 5, 2));
  });

  it('shouldReturnNullRateWhenNoDecidedGames', () => {
    expect(winRate(T(0, 0, 0, 3))).toEqual({ n: 0, rate: null });
  });

  it('shouldExcludeDisconnectionLossesWhenCompetitive', () => {
    const t = T(2, 0, 3, 0, 2);
    expect(winRate(t)).toEqual({ n: 5, rate: 0.4 });
    expect(winRate(t, true)).toEqual({ n: 3, rate: 2 / 3 });
  });
});

describe('rankPoints', () => {
  it('shouldPutPointsBelowMinGamesInSparseWhenRanking', () => {
    expect(MIN_GAMES).toBe(8);
    const out = rankPoints([wk('2026-11-16', { white: T(7, 0, 3), black: T(0, 0, 4) })]);
    expect(out.sparse.map((p) => p.label)).toEqual(['Con negras']);
    expect(out.all.map((p) => p.label).sort()).toEqual(['Con blancas', 'Con negras']);
  });

  it('shouldOrderStrongDescendingAndWeakAscendingByDelta', () => {
    const fam = (w: number, l: number) => T(w, 0, l);
    const out = rankPoints([wk('2026-11-16', { white: T(200, 0, 200), families: { A: fam(90, 10), B: fam(70, 30), C: fam(30, 70), D: fam(10, 90) } })]);
    expect(out.strong.map((p) => p.label)).toEqual(['A', 'B']);
    expect(out.weak.map((p) => p.label)).toEqual(['D', 'C']);
    expect(out.strong[0]!.delta).toBeCloseTo(40, 5); // 90 % vs the 50 % period average
    expect(out.weak[0]!.delta).toBeCloseTo(-40, 5);
  });

  it('shouldNotCallAPointStrongWhenItsIntervalIncludesThePeriodAverage', () => {
    // 8/10 against a 76 % average is +4 points on ten games: noise, not a strength (real case: four_knights, 30 days)
    const out = rankPoints([wk('2026-11-16', { white: T(76, 0, 24), families: { Noise: T(8, 0, 2), Clear: T(95, 0, 5) } })]);
    expect(out.strong.map((p) => p.label)).toEqual(['Clear']);
    expect(out.all.map((p) => p.label)).toContain('Noise'); // still listed in its own block
  });

  it('shouldNotCallAPointWeakWhenItsIntervalIncludesThePeriodAverage', () => {
    const out = rankPoints([wk('2026-11-16', { white: T(60, 0, 40), families: { Noise: T(5, 0, 5), Clear: T(15, 0, 85) } })]);
    expect(out.weak.map((p) => p.label)).toEqual(['Clear']);
  });

  it('shouldKeepDisconnectionLossesOutOfTheRateWhenRanking', () => {
    const out = rankPoints([wk('2026-11-16', { white: T(5, 0, 5, 0, 5), endgame: T(5, 0, 5, 0, 5) })]);
    const long = [...out.strong, ...out.weak].find((p) => p.kind === 'long');
    expect(long).toBeUndefined(); // competitive n = 5 < MIN_GAMES → sparse, not ranked
    expect(out.sparse.find((p) => p.kind === 'long')!.rate).toBe(1);
  });

  it('shouldKeepAPointAtThePeriodAverageInTheFullListWhenItsDeltaIsZero', () => {
    const out = rankPoints([wk('2026-11-16', { white: T(5, 0, 5), black: T(5, 0, 5) })]);
    expect([...out.strong, ...out.weak]).toEqual([]); // at the average: neither strong nor weak
    expect(out.all.map((p) => p.label).sort()).toEqual(['Con blancas', 'Con negras']);
    expect(out.all.every((p) => p.delta === 0)).toBe(true);
  });

  it('shouldListEveryPointInTheFullListIncludingSparseWhenRanking', () => {
    const out = rankPoints([wk('2026-11-16', { white: T(9, 0, 1), black: T(1, 0, 2) })]);
    expect(out.all.map((p) => p.label).sort()).toEqual(['Con blancas', 'Con negras']);
  });

  it('shouldReturnNothingWhenThePeriodHasNoDecidedGames', () => {
    expect(rankPoints([])).toEqual({ strong: [], weak: [], sparse: [], all: [] });
  });
});

describe('eloTrend', () => {
  const elo = (week: string, eloEnd: number | null): WeekBucket => ({ ...wk(week), eloEnd });

  it('shouldMeasureTheDeltaFromTheEndOfThePreviousPeriodWhenBothAreKnown', () => {
    const out = eloTrend([elo('2026-11-09', 910), elo('2026-11-16', 925)], [elo('2026-10-26', 880), elo('2026-11-02', 900)]);
    expect(out).toEqual({ now: 925, delta: 25 });
  });

  it('shouldFallBackToTheFirstEloOfThePeriodWhenThereIsNoPrevious', () => {
    expect(eloTrend([elo('2026-11-02', 900), elo('2026-11-09', null), elo('2026-11-16', 925)], [])).toEqual({ now: 925, delta: 25 });
  });

  it('shouldReturnNullDeltaWhenOnlyOneEloPointExists', () => {
    expect(eloTrend([elo('2026-11-16', 925)], [])).toEqual({ now: 925, delta: null });
  });

  it('shouldReturnNullsWhenNoWeekHasElo', () => {
    expect(eloTrend([elo('2026-11-16', null)], [elo('2026-11-09', null)])).toEqual({ now: null, delta: null });
    expect(eloTrend([], [])).toEqual({ now: null, delta: null });
  });
});

describe('periodSummary', () => {
  it('shouldMeasureTheWinRateAgainstThePreviousPeriodWhenBothHaveGames', () => {
    const cur = [wk('2026-11-16', { white: T(8, 0, 2) })], prev = [wk('2026-10-05', { white: T(6, 0, 4) })];
    const s = periodSummary(cur, prev);
    expect(s.n).toBe(10);
    expect(s.rate).toBeCloseTo(0.8, 5);
    expect(s.delta).toBeCloseTo(20, 5); // percentage points
  });

  it('shouldReturnNullDeltaWhenThePreviousPeriodHasNoDecidedGames', () => {
    expect(periodSummary([wk('2026-11-16', { white: T(8, 0, 2) })], []).delta).toBeNull();
  });

  it('shouldReturnNullRateWhenThePeriodHasNoDecidedGames', () => {
    expect(periodSummary([], [wk('2026-10-05', { white: T(6, 0, 4) })])).toEqual({ n: 0, rate: null, delta: null });
  });
});
