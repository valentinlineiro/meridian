import { describe, it, expect } from "vitest";
import { summarize } from "../../../src/slices/linkedin-games/domain/GameStats.ts";
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
