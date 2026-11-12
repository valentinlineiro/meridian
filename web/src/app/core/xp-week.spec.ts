import { isStale, xpLine, xpSummary, xpWeek } from './xp-week';


// "Now" is 2026-11-10 09:00 UTC (a Tuesday). Every date below is relative to it.
const NOW = Date.parse('2026-11-10T09:00:00Z');
const DAY = 864e5;
const day = (back: number) => new Date(NOW - back * DAY).toISOString().slice(0, 10);
const iso = (back: number, extra = 0) => new Date(NOW - back * DAY - extra).toISOString();
const rows = (from: number, to: number, xp: (back: number) => number) =>
  Array.from({ length: from - to + 1 }, (_, i) => from - i).map((b) => ({ date: day(b), gainedXp: xp(b), numSessions: 1 }));

describe('isStale: the sync is older than two days', () => {
  it('shouldNotBeStaleAtExactlyTwoDaysAndBeStaleJustAfter', () => {
    expect(isStale(iso(2), NOW)).toBe(false);
    expect(isStale(iso(2, 60_000), NOW)).toBe(true);
  });
  it('shouldNotBeStaleWhenThereIsNoDate', () => {
    expect(isStale(null, NOW)).toBe(false);
  });
});

describe('xpWeek: the last seven complete days against the four weeks before', () => {
  // synced today 06:00: complete days are 1..7 days back; the baseline is 8..35 days back
  const syncedToday = iso(0, 3 * 3600_000);

  it('shouldSumTheSevenCompleteDaysAndAverageThePrecedingFourWeeks', () => {
    const w = xpWeek([...rows(7, 1, () => 300), ...rows(35, 8, () => 100)], syncedToday, NOW);
    expect(w).toMatchObject({ state: 'ok', through: day(1), total: 2100, sessions: 7, avgWeek: 700 });
    expect(w.state === 'ok' && w.pct).toBeCloseTo(200); // 2100 vs 700 a week
    expect(w.state === 'ok' && w.days.map((d) => d.date)).toEqual([7, 6, 5, 4, 3, 2, 1].map(day));
  });

  it('shouldAnchorTheWindowToTheSyncDayNotToToday', () => {
    const w = xpWeek([...rows(9, 3, () => 50), ...rows(37, 10, () => 50)], iso(2), NOW); // synced two days ago
    expect(w).toMatchObject({ state: 'ok', through: day(3), total: 350 });
  });

  it('shouldLeaveTheTodayPartialDayOut', () => {
    const w = xpWeek([...rows(7, 1, () => 10), { date: day(0), gainedXp: 999 }, ...rows(35, 8, () => 10)], syncedToday, NOW);
    expect(w).toMatchObject({ state: 'ok', total: 70 });
  });

  it('shouldCountADayMissingInsideTheCoveredSpanAsZero', () => {
    const data = [...rows(7, 1, () => 100), ...rows(35, 8, () => 100)].filter((r) => r.date !== day(3));
    expect(xpWeek(data, syncedToday, NOW)).toMatchObject({ state: 'ok', total: 600 });
  });

  it('shouldReportStaleWithItsAgeInsteadOfZerosWhenTheSyncIsOlderThanTwoDays', () => {
    const w = xpWeek(rows(60, 33, () => 100), iso(32), NOW);
    expect(w).toEqual({ state: 'stale', ageDays: 32 });
  });

  it('shouldCountTheStaleAgeInCalendarDaysLikeTheSyncChip', () => {
    const synced = iso(32, DAY / 2); // 32.5 elapsed days: 32 elapsed, but 33 calendar days ago
    expect(xpWeek(rows(60, 33, () => 100), synced, NOW)).toEqual({ state: 'stale', ageDays: 33 });
  });

  it('shouldSayNothingWhenThereAreNoRowsOrNoSyncDate', () => {
    expect(xpWeek([], syncedToday, NOW)).toEqual({ state: 'none' });
    expect(xpWeek(rows(7, 1, () => 5), null, NOW)).toEqual({ state: 'none' });
  });

  it('shouldNotCompareWhenTheHistoryDoesNotReachBackFourWeeks', () => {
    const w = xpWeek(rows(20, 1, () => 100), syncedToday, NOW);
    expect(w).toMatchObject({ state: 'ok', total: 700, avgWeek: null, pct: null });
  });

  it('shouldNotDivideByZeroWhenThePrecedingWeeksHadNoXp', () => {
    const w = xpWeek([...rows(7, 1, () => 100), ...rows(35, 8, () => 0)], syncedToday, NOW);
    expect(w).toMatchObject({ state: 'ok', avgWeek: 0, pct: null });
  });

  describe('xpLine', () => {
    const ok = (data: ReturnType<typeof rows>) => { const w = xpWeek(data, syncedToday, NOW); if (w.state !== 'ok') throw new Error('not ok'); return w; };
    it('shouldWriteTheComparisonWithItsSign', () => {
      expect(xpLine(ok([...rows(7, 1, () => 271), ...rows(35, 8, () => 343)]), day(0)))
        .toBe('Últimos 7 días completos (hasta ayer): 1897 XP · media de las 4 semanas anteriores: 2401 XP por semana (−21 %)');
    });
    it('shouldSayThereIsNothingToCompareWhenThereAreNoFourWeeks', () => {
      expect(xpLine(ok(rows(20, 1, () => 100)), day(0))).toBe('Últimos 7 días completos (hasta ayer): 700 XP · aún sin 4 semanas de historial para comparar');
    });
    it('shouldNameTheDateWhenTheWindowDoesNotEndYesterday', () => {
      const w = xpWeek([...rows(9, 3, () => 50), ...rows(37, 10, () => 50)], iso(2), NOW);
      if (w.state !== 'ok') throw new Error('not ok');
      expect(xpLine(w, day(0))).toContain('(hasta 7 nov)');
    });
  });

  describe('xpSummary: the same week as a number, a change and a note', () => {
    const ok = (data: ReturnType<typeof rows>) => { const w = xpWeek(data, syncedToday, NOW); if (w.state !== 'ok') throw new Error('not ok'); return w; };
    it('shouldGiveTheTotalTheSignedChangeAndTheBaseline', () => {
      expect(xpSummary(ok([...rows(7, 1, () => 271), ...rows(35, 8, () => 343)]), day(0)))
        .toEqual({ big: '1897', delta: '−21 % frente a tu media', note: 'Hasta ayer · media de las 4 semanas anteriores: 2401 XP por semana' });
    });
    it('shouldGiveNoChangeWhenThereAreNoFourWeeksOrTheyHadNoXp', () => {
      expect(xpSummary(ok(rows(20, 1, () => 100)), day(0))).toEqual({ big: '700', delta: '', note: 'Hasta ayer · aún sin 4 semanas de historial para comparar' });
      expect(xpSummary(ok([...rows(7, 1, () => 100), ...rows(35, 8, () => 0)]), day(0)).note).toBe('Hasta ayer · sin XP en las 4 semanas anteriores');
    });
  });
});
