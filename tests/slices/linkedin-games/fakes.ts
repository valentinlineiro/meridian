import type { DayRecord } from "../../../src/slices/linkedin-games/domain/LinkedinGames.ts";
import type { DayRecordStore } from "../../../src/slices/linkedin-games/ports/DayRecordStore.ts";
import type { OwnerLookup } from "../../../src/slices/linkedin-games/ports/OwnerLookup.ts";

export class InMemoryDayRecordStore implements DayRecordStore {
  readonly versions: Array<{ ownerId: string; record: DayRecord }> = [];
  async latest(ownerId: string, date: string) {
    return [...this.versions].reverse().find((v) => v.ownerId === ownerId && v.record.date === date)?.record ?? null;
  }
  async all(ownerId: string) {
    const byDate = new Map<string, DayRecord>();
    for (const v of this.versions) if (v.ownerId === ownerId) byDate.set(v.record.date, v.record);
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
  async append(ownerId: string, record: DayRecord) { this.versions.push({ ownerId, record }); }
}

export const owners = (byEmail: Record<string, string>): OwnerLookup => ({ resolveOwnerId: async (e) => byEmail[e] ?? null });
