import { NotFoundError } from "../../../application/errors.ts";
import { DomainError } from "../../../kernel/errors.ts";
import { assertNotFuture, assertPlayDate, emptyDay, gameEntry, InvalidGameResult, playerToday, sameGames, sortKeys, withGame, type DayRecord, type GameField } from "../domain/LinkedinGames.ts";
import type { DayRecordStore } from "../ports/DayRecordStore.ts";
import type { OwnerLookup } from "../ports/OwnerLookup.ts";

export interface SaveDayCommand {
  ownerEmail: string;
  date: string;
  tz?: string;
  // avg: undefined keeps the stored average, null clears it (contract L14).
  set: { game: string; score: string; avg?: string | null }[];
  remove: string[];
}
export interface FieldError { game: string; field: GameField; reason: string }
export interface SaveDayResult {
  errors: FieldError[];
  games: { game: string; score: string; avg: string | null; status: "new" | "changed" | "same" }[];
  removed: string[];
}

/**
 * The register sheet's save: the games it touched, as one cumulative version of the day (L8). `set` merges into the stored day and
 * `remove` deletes a game's key (L14); everything the sheet did not touch is kept. All or nothing: any invalid entry writes nothing and
 * comes back with its game and field. Sending the same save again appends nothing.
 */
export class SaveDay {
  constructor(private readonly owners: OwnerLookup, private readonly days: DayRecordStore, private readonly now: () => Date) {}

  async execute(c: SaveDayCommand): Promise<SaveDayResult> {
    const errors: FieldError[] = [];
    const fail = (e: unknown, game: string) => {
      if (!(e instanceof DomainError)) throw e;
      errors.push({ game, field: e instanceof InvalidGameResult ? e.field : "date", reason: e.message });
    };
    let date = c.date;
    try {
      date = assertNotFuture(assertPlayDate(c.date), playerToday(this.now(), c.tz));
    } catch (e) { fail(e, ""); }
    const entries = c.set.flatMap((s) => {
      if (c.remove.includes(s.game)) { errors.push({ game: s.game, field: "game", reason: "the game is both set and removed" }); return []; }
      try { return [{ ...s, entry: gameEntry(s.game, s) }]; } catch (e) { fail(e, s.game); return []; }
    });
    if (errors.length) return { errors, games: [], removed: [] };

    const ownerId = await this.owners.resolveOwnerId(c.ownerEmail);
    if (!ownerId) throw new NotFoundError("no owner account");
    const before = await this.days.latest(ownerId, date);
    let next: DayRecord = before ?? emptyDay(date, c.tz);
    const games: SaveDayResult["games"] = [];
    for (const { game, score, avg, entry } of entries) {
      const prev = before?.games[game];
      next = withGame(next, game, entry);
      if (avg === null) { const { avg: _a, avgSeconds: _s, ...rest } = next.games[game] as Record<string, unknown>; next = { ...next, games: { ...next.games, [game]: rest } }; }
      const kept = next.games[game] as { avg?: string };
      const status = prev === undefined ? "new" : JSON.stringify(sortKeys(prev)) === JSON.stringify(sortKeys(next.games[game])) ? "same" : "changed";
      games.push({ game, score: entry.score, avg: kept.avg ?? null, status });
    }
    const removed = c.remove.filter((g) => g in next.games);
    if (removed.length) next = { ...next, games: Object.fromEntries(Object.entries(next.games).filter(([g]) => !removed.includes(g))) };
    if (!before || !sameGames(before, next)) await this.days.append(ownerId, { ...next, capturedAt: this.now().toISOString() });
    return { errors: [], games, removed };
  }
}
