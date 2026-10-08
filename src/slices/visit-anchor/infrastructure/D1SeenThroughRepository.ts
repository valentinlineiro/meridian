import { SeenThrough } from "../domain/SeenThrough.ts";
import type { SeenThroughRepository } from "../ports/SeenThroughRepository.ts";

export class D1SeenThroughRepository implements SeenThroughRepository {
  constructor(private readonly db: D1Database) {}

  async find(ownerId: string): Promise<SeenThrough | null> {
    const row = await this.db.prepare("SELECT changes_seen_through FROM user_view_state WHERE user_id = ?").bind(ownerId).first<{ changes_seen_through: string }>();
    return row ? SeenThrough.restore(row.changes_seen_through) : null;
  }

  async advance(ownerId: string, to: SeenThrough, at: string): Promise<void> {
    await this.db.prepare(`INSERT INTO user_view_state (user_id, changes_seen_through, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET changes_seen_through = excluded.changes_seen_through, updated_at = excluded.updated_at
      WHERE excluded.changes_seen_through > user_view_state.changes_seen_through`).bind(ownerId, to.iso, at).run();
  }
}
