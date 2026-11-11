import { chessRow, eloChange, gamesRow, GamesSummaryIn, headline, syncChip, windowStart } from './overview.model';
// minimal summaries: only what the Overview reads of each game

// "Now" is 2026-11-10 09:00 UTC (a Tuesday). Every date below is relative to it.
const NOW = Date.parse('2026-11-10T09:00:00Z');
const DAY = 864e5;
const day = (back: number) => new Date(NOW - back * DAY).toISOString().slice(0, 10);
const iso = (back: number, extra = 0) => new Date(NOW - back * DAY - extra).toISOString();

// Local calendar days: "ayer" is the previous calendar day even when it was less than 24 hours ago.
describe('syncChip: when the data was synced, in calendar days', () => {
  const at = (day: number, h: number, min = 0) => new Date(2026, 10, day, h, min).toISOString(); // 10 nov 2026 local = today
  const now = new Date(2026, 10, 10, 10, 0).getTime();
  it('shouldSayTodayForTheSameCalendarDay', () => {
    expect(syncChip(at(10, 0, 30), now)).toEqual({ text: 'datos de hoy', stale: false });
  });
  it('shouldSayYesterdayForTheCalendarDayBeforeEvenWhenItWasLessThan24HoursAgo', () => {
    expect(syncChip(at(9, 23, 30), now)).toEqual({ text: 'datos de ayer', stale: false }); // 10.5 hours ago, but yesterday
    expect(syncChip(at(9, 10, 1), now)).toEqual({ text: 'datos de ayer', stale: false });
  });
  it('shouldCountCalendarDaysWhenOlder', () => {
    expect(syncChip(at(8, 12), now)).toEqual({ text: 'datos de hace 2 días', stale: false });
    expect(syncChip(at(5, 12), now)).toEqual({ text: 'datos de hace 5 días', stale: true });
  });
  it('shouldKeepTheFreshnessRuleOfTwoDaysUntouched', () => {
    expect(syncChip(new Date(now - 2 * 864e5).toISOString(), now)?.stale).toBe(false);
    expect(syncChip(new Date(now - 2 * 864e5 - 60_000).toISOString(), now)?.stale).toBe(true);
  });
  it('shouldSayTodayForATimestampInTheFuture', () => {
    expect(syncChip(at(10, 23), now)?.text).toBe('datos de hoy'); // clock skew
  });
  it('shouldSayNothingWithoutADate', () => {
    expect(syncChip(null, now)).toBeNull();
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
  const base = { summary: { currentElo: 900 }, timeline: { snapshots: [{ createdAt: iso(40), elo: 850 }, { createdAt: iso(0), elo: 900 }] }, matches, now: NOW };

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
});

describe('gamesRow: what needs a look first across the games', () => {
  const g = (label: string, pending: string | null = null) => ({ interpretation: { label, pending } });
  const sum = (games: Record<string, ReturnType<typeof g>>, extra: Partial<GamesSummaryIn> = {}): GamesSummaryIn => ({ games, to: day(0), playStreak: { current: 3, max: 9 }, ...extra });

  it('shouldHeadWithTheWorstVerdictAndCountTheRest', () => {
    const r = gamesRow(sum({ zip: g('mejora_sostenida'), tango: g('deterioro'), queens: g('estable'), patches: g('datos_insuficientes') }));
    expect(r!.verdict).toMatchObject({ state: 'confirmed', dir: 'down' });
    expect(r!.name).toBe('Tango'); // the game that originates the verdict
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
  it('shouldLinkToTheReportOfTheGameBehindTheVerdict', () => {
    expect(gamesRow(sum({ zip: g('mejora_sostenida'), tango: g('deterioro'), queens: g('estable') }))!.link).toBe('/games/tango');
    expect(gamesRow(sum({ zip: g('estable'), tango: g('estable', 'deterioro') }))!.link).toBe('/games/tango'); // a possible fall also says something
    expect(gamesRow(sum({ zip: g('estable'), mini_sudoku: g('mejora_sostenida') }))!.link).toBe('/games/mini_sudoku');
  });
  it('shouldLinkToGamesWhenNoGameSaysAnything', () => {
    expect(gamesRow(sum({ zip: g('estable'), tango: g('estable'), queens: g('datos_insuficientes') }))!.link).toBe('/games');
    expect(gamesRow(sum({ zip: g('datos_insuficientes') }))!.link).toBe('/games');
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
    expect(gamesRow(sum({}))).toEqual({ verdict: null, name: null, link: '/games', line: 'Sin partidas registradas aún', streak: '' });
  });
});

describe('headline', () => {
  const v = (state: string, dir: 'up' | 'down' | null, label: string) => ({ state, dir, label, pill: '', sentence: '' }) as never;
  it('shouldNameWhatNeedsALookWorstFirst', () => {
    expect(headline([{ name: 'Ajedrez', verdict: v('possible', 'up', 'Posible subida') }, { name: 'Games', verdict: v('confirmed', 'down', 'A la baja') }]))
      .toBe('Games: a la baja · Ajedrez: posible subida');
  });
  it('shouldSayNoClearChangeWhenNothingStandsOut', () => {
    expect(headline([{ name: 'Ajedrez', verdict: v('no-signal', null, 'x') }, { name: 'Games', verdict: v('few-data', null, 'y') }])).toBe('Sin cambios claros en tus resultados recientes.');
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
