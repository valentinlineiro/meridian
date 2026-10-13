import type { DayRecord } from "../domain/LinkedinGames.ts";
import type { DayRecordStore } from "../ports/DayRecordStore.ts";

export type IngestSnapshot = (args: { source: string; userId: string; data: unknown }) => Promise<unknown>;

const SOURCE = "linkedin-games";

export class D1DayRecordStore implements DayRecordStore {
  // ingest is the shared snapshot pipeline (checksum dedup, raw_json), injected by the composition root.
  constructor(private readonly db: D1Database, private readonly ingest: IngestSnapshot) {}

  async latest(ownerId: string, date: string): Promise<DayRecord | null> {
    const row = await this.db.prepare(
      `SELECT raw_json FROM snapshots WHERE source = ? AND user_id = ? AND json_extract(raw_json, '$.date') = ?
       ORDER BY created_at DESC, id DESC LIMIT 1`).bind(SOURCE, ownerId, date).first<{ raw_json: string }>();
    return row ? (JSON.parse(row.raw_json) as DayRecord) : null;
  }

  async append(ownerId: string, record: DayRecord): Promise<void> {
    await this.ingest({ source: SOURCE, userId: ownerId, data: record });
  }
}
