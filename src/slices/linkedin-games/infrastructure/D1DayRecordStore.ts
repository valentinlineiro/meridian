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
       ORDER BY created_at DESC, rowid DESC LIMIT 1`).bind(SOURCE, ownerId, date).first<{ raw_json: string }>();
    return row ? (JSON.parse(row.raw_json) as DayRecord) : null;
  }

  async all(ownerId: string): Promise<DayRecord[]> {
    // Latest version wins (L2): rows come oldest first, so a later row for the same date overwrites. A few hundred small rows;
    // a SQL "latest per date" would be quadratic without an index on the date.
    const { results } = await this.db.prepare("SELECT raw_json FROM snapshots WHERE source = ? AND user_id = ? ORDER BY created_at, rowid")
      .bind(SOURCE, ownerId).all<{ raw_json: string }>();
    const byDate = new Map<string, DayRecord>();
    for (const r of results) { const d = JSON.parse(r.raw_json) as DayRecord; byDate.set(d.date, d); }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  async append(ownerId: string, record: DayRecord): Promise<void> {
    await this.ingest({ source: SOURCE, userId: ownerId, data: record });
  }
}
