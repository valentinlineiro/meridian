import { NotFoundError } from "../../../application/errors.ts";
import { assertPlayDate, emptyDay, type DayRecord } from "../domain/LinkedinGames.ts";
import type { DayRecordStore } from "../ports/DayRecordStore.ts";
import type { OwnerLookup } from "../ports/OwnerLookup.ts";

export class GetDay {
  constructor(private readonly owners: OwnerLookup, private readonly days: DayRecordStore) {}

  async execute(q: { ownerEmail: string; date: string }): Promise<DayRecord> {
    const date = assertPlayDate(q.date);
    const ownerId = await this.owners.resolveOwnerId(q.ownerEmail);
    if (!ownerId) throw new NotFoundError("no owner account");
    return (await this.days.latest(ownerId, date)) ?? emptyDay(date);
  }
}
