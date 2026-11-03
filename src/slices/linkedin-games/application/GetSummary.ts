import { NotFoundError } from "../../../application/errors.ts";
import { assertPlayDate } from "../domain/LinkedinGames.ts";
import { summarize, type Summary } from "../domain/GameStats.ts";
import type { DayRecordStore } from "../ports/DayRecordStore.ts";
import type { OwnerLookup } from "../ports/OwnerLookup.ts";

export class GetSummary {
  constructor(private readonly owners: OwnerLookup, private readonly days: DayRecordStore) {}

  async execute(q: { ownerEmail: string; today: string }): Promise<Summary> {
    const today = assertPlayDate(q.today);
    const ownerId = await this.owners.resolveOwnerId(q.ownerEmail);
    if (!ownerId) throw new NotFoundError("no owner account");
    return summarize(await this.days.all(ownerId), today);
  }
}
