import { courseRows, periodSummary } from './scoreboard';

const course = (courseId: string, o: Record<string, unknown> = {}) => ({ courseId, title: courseId, xp: 100, fromLanguage: 'en', learningLanguage: 'es', ...o });
const cur = (courseId: string, groups: [string | null, number, number][]) => ({
  courseId, completedUnits: groups.reduce((a, g) => a + g[1], 0), totalUnits: groups.reduce((a, g) => a + g[2], 0),
  cefrBreakdown: groups.map(([cefrLevel, completedUnits, totalUnits]) => ({ cefrLevel, completedUnits, totalUnits })),
});

describe('courseRows', () => {
  it('shouldGiveTheFirstUnfinishedLevelWhenEveryGroupHasALevel', () => {
    const [r] = courseRows([course('a')], [cur('a', [['A1', 10, 10], ['A2', 5, 10], ['B1', 0, 10]])], []);
    expect(r!.level).toBe('A2');
    expect(r!.pct).toBeCloseTo(50, 5);
    expect(r!.state).toBe('progress');
  });

  it('shouldIgnoreAGroupWithoutLevelAndWithoutUnitsWhenFindingTheLevel', () => {
    const [r] = courseRows([course('a')], [cur('a', [['A1', 4, 10], [null, 0, 0]])], []);
    expect(r!.level).toBe('A1');
  });

  it('shouldShowNoLevelAndTheUnitsWhenAGroupWithUnitsHasNoLevel', () => {
    const [r] = courseRows([course('a')], [cur('a', [['A1', 4, 10], [null, 3, 10]])], []);
    expect(r!.level).toBeNull();
    expect(r!.units).toBe('7 de 20 unidades');
  });

  it('shouldMarkACourseDoneWhenAllUnitsAreCompleted', () => {
    expect(courseRows([course('a')], [cur('a', [['B2', 10, 10]])], [])[0]!.state).toBe('done');
  });

  it('shouldMarkACourseNotStartedWhenNoUnitIsCompleted', () => {
    expect(courseRows([course('a')], [cur('a', [['A1', 0, 10]])], [])[0]!.state).toBe('new');
  });

  it('shouldSayTheUnitsWereNotReadWhenTheCourseHasNoCurriculumData', () => {
    const [r] = courseRows([course('a')], [], []);
    expect(r!.state).toBe('unread');
    expect(r!.units).toBe('Unidades sin leer');
    expect(r!.pct).toBeNull();
  });

  it('shouldShowTheAdvanceSinceTheLastObservationWhenTheDeltaIsComparable', () => {
    const delta = { courseId: 'a', status: 'comparable', deltaTotalUnits: 0, deltaCompletedUnits: 3, previousObservedAt: '2026-11-10T00:00:00Z' };
    const [r] = courseRows([course('a')], [cur('a', [['A1', 5, 10]])], [delta]);
    expect(r!.change).toContain('+3 unidades');
  });

  it('shouldKeepTheCatalogueOrderAndFlagAndXpOfEachCourse', () => {
    const rows = courseRows([course('a', { xp: 15000 }), course('b', { learningLanguage: 'ru' })], [], []);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
    expect(rows[0]!.xp).toBe('15.000 XP');
    expect(rows[1]!.flag).toBe('🇷🇺');
  });
});

describe('periodSummary', () => {
  const NOW = new Date('2026-11-24T12:00:00Z');
  const day = (back: number, gainedXp: number) => ({ date: Math.floor(Date.UTC(2026, 10, 24 - back) / 1000), gainedXp });
  const xp = [...Array.from({ length: 7 }, (_, i) => day(i, 100)), ...Array.from({ length: 7 }, (_, i) => day(7 + i, i % 2 ? 0 : 50))];

  it('shouldSumTheXpAndCountTheActiveDaysOfThePeriod', () => {
    const s = periodSummary(xp, 7, NOW);
    expect(s.xp).toBe(700);
    expect(s.activeDays).toBe(7);
  });

  it('shouldMeasureTheChangeAgainstThePreviousPeriodOfTheSameLength', () => {
    expect(periodSummary(xp, 7, NOW).delta).toBeCloseTo((700 - 200) / 200 * 100, 5);
  });

  it('shouldGiveNoChangeWhenThePreviousPeriodHadNoXp', () => {
    expect(periodSummary([day(0, 100)], 7, NOW).delta).toBeNull();
  });

  it('shouldGiveNoChangeWhenTheRecordDoesNotReachBackToThePreviousPeriod', () => {
    const ninety = Array.from({ length: 90 }, (_, i) => day(i, 10));
    expect(periodSummary(ninety, 90, NOW).delta).toBeNull();
  });
});
