import type { DayRecord } from "../domain/LinkedinGames.ts";

export interface DayRecordStore {
  // The current version of the day (latest created_at, insertion order as tie-breaker), or null.
  latest(ownerId: string, date: string): Promise<DayRecord | null>;
  // The current version of every date, ascending by date.
  all(ownerId: string): Promise<DayRecord[]>;
  // Appends a new version; versions are never rewritten.
  append(ownerId: string, record: DayRecord): Promise<void>;
}
