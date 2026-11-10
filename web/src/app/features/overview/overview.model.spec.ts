import { chessRow, eloChange, gamesRow, GamesSummaryIn, headline, isStale, windowStart, xpWeek, xpLine } from './overview.model';
// minimal summaries: only what the Overview reads of each game

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
});

describe('eloChange: the rating between two observed readings', () => {
  const snap = (back: number, elo: number | null) => ({ createdAt: iso(back), elo });
  it('shouldCompareWithTheLastReadingOlderThan28Days', () => {
    expect(eloChange([snap(60, 800), snap(30, 850), snap(10, 880), snap(0, 900)], NOW)).toEqual({ from: 850, to: 900, diff: 50, since: day(30) });
  });
  it('shouldFallBackToTheFirstReadingAndDateIt', () => {
    expect(eloChange([snap(20, 850), snap(5, 870), snap(0, 900)], NOW)).toEqual({ from: 850, to: 900, diff: 50, since: day(20) });
  });
  it('shouldIgnoreReadingsWithoutRating', () => {
    expect(eloChange([snap(40, 800), snap(20, null), snap(0, 820)], NOW)).toMatchObject({ from: 800, to: 820 });
  });
  it('shouldSayNothingWithASingleReading', () => {
    expect(eloChange([snap(0, 900)], NOW)).toBeNull();
    expect(eloChange([], NOW)).toBeNull();
  });
});

describe('chessRow', () => {
  const recent = (delta: { diff: number; lower: number; upper: number } | null, games = 50) =>
    ({ limit: 50, games, decided: games, winRate: 0.6, delta, before: delta ? { games: 100 } : null });
  const matches = Array.from({ length: 60 }, (_, i) => ({ played_at: Math.floor((NOW - i * DAY) / 1000) })); // newest first
  const base = { summary: { currentElo: 900 }, timeline: { snapshots: [{ createdAt: iso(40), elo: 850 }, { createdAt: iso(0), elo: 900 }] }, matches, syncedAt: iso(0), now: NOW };

  it('shouldSayThePeriodTheWindowCovers', () => {
    const r = chessRow({ ...base, recent: recent({ diff: 0.06, lower: 0.01, upper: 0.11 }) });
    expect(r.form).toContain('Últimas 50 partidas (desde el ' + new Date(NOW - 49 * DAY).getUTCDate());
    expect(r.form).toContain('60,0 % de victorias');
    expect(r.form).toContain('+6,0 puntos de % (entre +1,0 y +11,0)');
    expect(r.verdict).toMatchObject({ label: 'Posible subida' });
  });
  it('shouldSayNoClearChangeWhenTheIntervalIncludesZero', () => {
    const r = chessRow({ ...base, recent: recent({ diff: 0.06, lower: -0.08, upper: 0.2 }) });
    expect(r.verdict).toMatchObject({ state: 'no-signal' });
    expect(r.form).toContain('(entre −8,0 y +20,0) frente a las anteriores · sin evidencia suficiente'); // the note closes the sentence
  });
  it('shouldSayFewDataWhenThereAreNoGamesBeforeTheWindow', () => {
    expect(chessRow({ ...base, recent: recent(null) }).verdict).toMatchObject({ state: 'few-data' });
  });
  it('shouldSayThereAreNoGamesInsteadOfAnEmptyWindow', () => {
    for (const games of [0, null]) expect(chessRow({ ...base, recent: { ...recent(null), games } }).form).toBe('Aún sin partidas registradas');
  });
  it('shouldOmitThePeriodWhenTheMatchesDoNotReachTheWindow', () => {
    const r = chessRow({ ...base, matches: matches.slice(0, 10), recent: recent({ diff: 0.06, lower: 0.01, upper: 0.11 }) });
    expect(r.form).toMatch(/^Últimas 50 partidas: /);
  });
  it('shouldGiveTheEloWithItsDatedChange', () => {
    const r = chessRow({ ...base, recent: recent(null) });
    expect(r.elo).toBe(`ELO 900 (+50 desde el ${new Date(NOW - 40 * DAY).getUTCDate()} ${['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][new Date(NOW - 40 * DAY).getUTCMonth()]})`);
  });
  it('shouldGiveOnlyTheEloWhenThereIsNoChangeToDate', () => {
    expect(chessRow({ ...base, timeline: { snapshots: [{ createdAt: iso(0), elo: 900 }] }, recent: recent(null) }).elo).toBe('ELO 900');
  });
  it('shouldFlagTheDataAsOldAfterTwoDays', () => {
    expect(chessRow({ ...base, syncedAt: iso(5), recent: recent(null) }).fresh).toEqual({ text: 'hace 5d', stale: true });
    expect(chessRow({ ...base, recent: recent(null) }).fresh).toEqual({ text: 'hoy', stale: false });
  });
});

describe('gamesRow: what needs a look first across the games', () => {
  const g = (label: string, pending: string | null = null) => ({ interpretation: { label, pending } });
  const sum = (games: Record<string, ReturnType<typeof g>>, extra: Partial<GamesSummaryIn> = {}): GamesSummaryIn => ({ games, to: day(0), playStreak: { current: 3, max: 9 }, ...extra });

  it('shouldHeadWithTheWorstVerdictAndCountTheRest', () => {
    const r = gamesRow(sum({ zip: g('mejora_sostenida'), tango: g('deterioro'), queens: g('estable'), patches: g('datos_insuficientes') }));
    expect(r!.verdict).toMatchObject({ state: 'confirmed', dir: 'down' });
    expect(r!.line).toBe('Tango: A la baja · 1 al alza · 1 sin señales de cambio · 1 con pocos datos'); // the others, not the head again
  });
  it('shouldRankAPossibleFallAboveAConfirmedRise', () => {
    const r = gamesRow(sum({ zip: g('mejora_sostenida'), tango: g('estable', 'deterioro') }));
    expect(r!.verdict).toMatchObject({ state: 'possible', dir: 'down' });
    expect(r!.line).toBe('Tango: Posible bajada · 1 al alza');
  });
  it('shouldJustCountWhenNoGameSaysAnything', () => {
    const r = gamesRow(sum({ zip: g('estable'), tango: g('estable'), queens: g('datos_insuficientes') }));
    expect(r!.line).toBe('2 sin señales de cambio · 1 con pocos datos');
  });
  it('shouldSayFewDataWhenNoGameHasHistory', () => {
    expect(gamesRow(sum({ zip: g('datos_insuficientes') }))!.verdict).toMatchObject({ state: 'few-data' });
  });
  it('shouldGiveTheStreakOrTheLastRecordDate', () => {
    expect(gamesRow(sum({ zip: g('estable') }))!.streak).toBe('Racha: 3 días seguidos');
    expect(gamesRow(sum({ zip: g('estable') }, { playStreak: { current: 1, max: 9 } }))!.streak).toBe('Racha: 1 día seguido');
    expect(gamesRow(sum({ zip: g('estable') }, { playStreak: { current: 0, max: 9 }, to: '2026-11-03' }))!.streak).toBe('Sin registro desde 3 nov 2026 · registro manual');
  });
  it('shouldSayTheLogIsEmptyAndGiveNoVerdict', () => {
    expect(gamesRow(sum({}))).toEqual({ verdict: null, line: 'Sin partidas registradas aún', streak: '' });
  });
});

describe('headline', () => {
  const v = (state: string, dir: 'up' | 'down' | null, label: string) => ({ state, dir, label, pill: '', sentence: '' }) as never;
  it('shouldNameWhatNeedsALookWorstFirst', () => {
    expect(headline([{ name: 'Ajedrez', verdict: v('possible', 'up', 'Posible subida') }, { name: 'Games', verdict: v('confirmed', 'down', 'A la baja') }]))
      .toBe('A la baja en Games · Posible subida en Ajedrez');
  });
  it('shouldSayNoClearChangeWhenNothingStandsOut', () => {
    expect(headline([{ name: 'Ajedrez', verdict: v('no-signal', null, 'x') }, { name: 'Games', verdict: v('few-data', null, 'y') }])).toBe('Sin cambios claros respecto a tu ritmo.');
  });
  it('shouldNotPretendWhenThereIsNoVerdictAtAll', () => {
    expect(headline([{ name: 'Ajedrez', verdict: null }, { name: 'Games', verdict: v('few-data', null, 'y') }])).toBe('Aún no hay datos suficientes para valorar tu ritmo.');
  });
});

describe('windowStart', () => {
  it('shouldGiveTheOldestDateOfTheNewestN', () => {
    const m = [{ played_at: 1_700_000_300 }, { played_at: 1_700_000_200 }, { played_at: 1_700_000_100 }];
    expect(windowStart(m, 2)).toBe(new Date(1_700_000_200 * 1000).toISOString().slice(0, 10));
    expect(windowStart(m, 5)).toBeNull();
  });
});
