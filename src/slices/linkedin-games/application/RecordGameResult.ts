import { NotFoundError } from "../../../application/errors.ts";
import { assertNotFuture, assertPlayDate, emptyDay, gameEntry, sameGames, withGame, playerToday, type DayRecord } from "../domain/LinkedinGames.ts";
import type { DayRecordStore } from "../ports/DayRecordStore.ts";
import type { OwnerLookup } from "../ports/OwnerLookup.ts";

export interface RecordGameResultCommand {
  ownerEmail: string;
  date: string;
  game: string;
  score: string;
  avg?: string | null;
  number?: number | null;
  tz?: string;
}

export class RecordGameResult {
  constructor(private readonly owners: OwnerLookup, private readonly days: DayRecordStore, private readonly now: () => Date) {}

  async execute(c: RecordGameResultCommand): Promise<DayRecord> {
    const date = assertNotFuture(assertPlayDate(c.date), playerToday(this.now(), c.tz));
    const entry = gameEntry(c.game, c);
    const ownerId = await this.owners.resolveOwnerId(c.ownerEmail);
    if (!ownerId) throw new NotFoundError("no owner account");
    const stored = await this.days.latest(ownerId, date);
    const current = stored ?? emptyDay(date, c.tz);
    const next = withGame(current, c.game, entry);
    if (stored && sameGames(stored, next)) return stored; // nothing changed: no duplicate version
    // One instant per operation. A retry of a request that already succeeded finds the games unchanged and appends nothing.
    // capturedAt keeps every version's checksum distinct, so correcting a value back to an earlier one is not deduplicated away.
    const saved = { ...next, capturedAt: this.now().toISOString() };
    await this.days.append(ownerId, saved);
    return saved;
  }
}
