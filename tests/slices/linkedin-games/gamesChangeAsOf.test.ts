import { describe, it, expect } from "vitest";
import { summarize } from "../../../src/slices/linkedin-games/domain/GameStats.ts";
import { statesAt } from "../../../src/slices/linkedin-games/application/GetGamesChange.ts";
import type { DayRecord } from "../../../src/slices/linkedin-games/domain/LinkedinGames.ts";

const SINCE = "2026-10-08";
const UNTIL = "2026-11-13";
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const entry = (score: number, avg: number) => ({ number: null, score: `0:${score}`, scoreSeconds: score, avg: `0:${avg}`, avgSeconds: avg });
// one record per day ending on `end`: eff = avg / score
const run = (game: string, end: string, count: number, avgAt: (i: number) => number, score = 100): DayRecord[] =>
  Array.from({ length: count }, (_, i) => ({ schema: 1, date: addDays(end, i - count + 1), games: { [game]: entry(score, avgAt(i)) } }));
const upTo = (days: DayRecord[], date: string) => days.filter((d) => d.date <= date);

describe("the interpretation at a date", () => {
  it("shouldIgnoreObservationsAfterTodayWhenSummarizing", () => {
    const before = run("zip", SINCE, 170, (i) => 120 + ((i * 37) % 90));
    const later = run("zip", UNTIL, 36, () => 400); // very slow days after SINCE
    const all = [...before, ...later];
    expect(summarize(all, SINCE).games.zip!.interpretation).toEqual(summarize(upTo(all, SINCE), SINCE).games.zip!.interpretation);
  });
});

// Zip is calibrated. A stable history to SINCE (eff ~1.2-2.1) followed by 36 slow days (eff 0.825) is "estable" at SINCE and a confirmed "deterioro" at UNTIL.
const stable = (end: string, n = 170) => run("zip", end, n, (i) => 120 + ((i * 37) % 90));
const slow = (end: string, n: number) => run("zip", end, n, () => 165, 200);

describe("the state of every game at a date", () => {
  const history = [...stable(SINCE), ...slow(UNTIL, 36)];

  it("shouldGiveTheSameStateAtSinceWithFullAndTruncatedHistory", () => {
    expect(statesAt(history, SINCE)).toEqual(statesAt(upTo(history, SINCE), SINCE));
  });

  it("shouldDifferBetweenSinceAndUntilOnTheAdversarialFixture", () => {
    expect(statesAt(history, SINCE).get("zip")).toEqual({ kind: "estable" });
    expect(statesAt(history, UNTIL).get("zip")).toEqual({ kind: "bajando" });
  });

  it("shouldOnlyConfirmAtSinceWhenTheCandidateHeldSevenDaysEarlier", () => {
    // nine slow days: the candidate is already "deterioro" at SINCE but was not seven days earlier, so it is only a senal
    const h = [...stable(addDays(SINCE, -9)), ...slow(SINCE, 9)];
    expect(statesAt(h, addDays(SINCE, -7)).get("zip")).toEqual({ kind: "estable" });
    expect(statesAt(h, SINCE).get("zip")).toEqual({ kind: "senal", dir: "bajando" });
  });

  it("shouldCountARecordOnSinceButNotOnSincePlusOne", () => {
    const one = (date: string): DayRecord[] => [{ schema: 1, date, games: { queens: entry(100, 150) } }];
    expect(statesAt(one(SINCE), SINCE).has("queens")).toBe(true); // closing day SINCE, inclusive
    expect(statesAt(one(addDays(SINCE, 1)), SINCE).has("queens")).toBe(false);
  });
});
