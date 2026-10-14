import { extractObservations } from "../../src/normalization/observations.ts";
import { observationStatements } from "../../src/db/storeObservations.ts";

// Fixtures that insert `snapshots` rows with raw SQL bypass ingestion, so no observation rows exist. This does what the backfill
// does: run the extractor over every snapshot that has none and apply observationStatements. Readers that read observations
// (R4, R5) then see the same data a real ingest would have written.
export async function materializeObservations(db: any, d1: D1Database) {
  const rows = db.prepare(`
    SELECT id, source, user_id, created_at, is_auxiliary, raw_json FROM snapshots
    WHERE id NOT IN (SELECT snapshot_id FROM course_observations UNION SELECT snapshot_id FROM path_observations
                     UNION SELECT snapshot_id FROM account_observations UNION SELECT snapshot_id FROM elo_observations)
  `).all() as Array<{ id: string; source: string; user_id: string; created_at: string; is_auxiliary: number | null; raw_json: string }>;
  for (const r of rows) {
    const x = extractObservations(r.source, r.raw_json, { snapshotId: r.id, userId: r.user_id, observedAt: r.created_at, isAuxiliary: r.is_auxiliary === 1 });
    const stmts = observationStatements(d1, x);
    if (stmts.length) await d1.batch(stmts);
  }
}
