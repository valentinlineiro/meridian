import { NotFoundError } from "../../../application/errors.ts";
import { DomainError } from "../../../kernel/errors.ts";
import { assertNotFuture, assertPlayDate, emptyDay, gameEntry, playerToday, sameGames, sortKeys, withGame, type DayRecord, type GameKey } from "../domain/LinkedinGames.ts";
import { parseGamesText, type LineError, type ParsedEntry } from "../domain/GamesText.ts";
import type { DayRecordStore } from "../ports/DayRecordStore.ts";
import type { OwnerLookup } from "../ports/OwnerLookup.ts";

export interface ImportGameResultsCommand { ownerEmail: string; text: string; today: string; tz?: string; apply: boolean }
export interface ImportedGame { game: GameKey; score: string; avg: string | null; status: "new" | "changed" | "same" }
export interface ImportResult { applied: boolean; errors: LineError[]; days: { date: string; games: ImportedGame[] }[] }

// Up to this many dates, read each day; beyond it one read of every day is cheaper than a query per date.
const READ_ONE_BY_ONE_UP_TO = 5;

/**
 * Imports what the owner typed or pasted (see GamesText). The text wins over what is stored for the games it mentions; the rest of the day
 * is kept. One cumulative version per changed date (contract L8). All or nothing: any invalid line writes nothing. With apply=false it only
 * says what would happen.
 */
export class ImportGameResults {
  constructor(private readonly owners: OwnerLookup, private readonly days: DayRecordStore, private readonly now: () => Date) {}

  async execute(c: ImportGameResultsCommand): Promise<ImportResult> {
    const { entries, errors } = parseGamesText(c.text, assertPlayDate(c.today));
    const limit = playerToday(this.now(), c.tz);
    const valid: (ParsedEntry & { entry: ReturnType<typeof gameEntry> })[] = [];
    for (const e of entries) {
      try {
        assertNotFuture(assertPlayDate(e.date), limit);
        valid.push({ ...e, entry: gameEntry(e.game, { score: e.score, avg: e.avg }) });
      } catch (err) {
        if (!(err instanceof DomainError)) throw err;
        errors.push({ line: e.line, text: `${e.date} ${e.game}`, reason: err.message });
      }
    }
    errors.sort((a, b) => a.line - b.line);
    if (errors.length || valid.length === 0) return { applied: false, errors, days: [] };

    const ownerId = await this.owners.resolveOwnerId(c.ownerEmail);
    if (!ownerId) throw new NotFoundError("no owner account");
    const dates = [...new Set(valid.map((e) => e.date))].sort();
    const stored = await this.load(ownerId, dates);

    const result: ImportResult = { applied: c.apply, errors: [], days: [] };
    const instant = this.now().toISOString();
    for (const date of dates) {
      const before = stored.get(date) ?? null;
      let next: DayRecord = before ?? emptyDay(date, c.tz);
      const games = new Map<GameKey, ImportedGame>();
      for (const e of valid.filter((v) => v.date === date)) {
        const prev = before?.games[e.game];
        next = withGame(next, e.game, e.entry);
        const status = prev === undefined ? "new" : JSON.stringify(sortKeys(prev)) === JSON.stringify(sortKeys(next.games[e.game])) ? "same" : "changed";
        games.set(e.game, { game: e.game, score: e.score, avg: e.avg, status });
      }
      result.days.push({ date, games: [...games.values()] });
      if (c.apply && (!before || !sameGames(before, next))) await this.days.append(ownerId, { ...next, capturedAt: instant });
    }
    return result;
  }

  private async load(ownerId: string, dates: string[]): Promise<Map<string, DayRecord>> {
    if (dates.length > READ_ONE_BY_ONE_UP_TO) return new Map((await this.days.all(ownerId)).map((d) => [d.date, d]));
    const found = await Promise.all(dates.map((d) => this.days.latest(ownerId, d)));
    return new Map(found.filter((d): d is DayRecord => d !== null).map((d) => [d.date, d]));
  }
}
