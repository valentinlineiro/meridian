import { extractObservations } from "../../src/normalization/observations.ts";
import { observationStatements } from "../../src/db/storeObservations.ts";

// Fixtures that insert `snapshots` rows with raw SQL bypass ingestion, so no observation rows exist. This does what the backfill
// does: for EVERY snapshot, run the extractor and apply observationStatements. The statements are `ON CONFLICT DO NOTHING`, so
// snapshots that already have some families (partial materialisation) are completed and complete ones are left as they are.
export async function materializeObservations(db: any, d1: D1Database) {
  const rows = db.prepare("SELECT id, source, user_id, created_at, is_auxiliary, raw_json FROM snapshots ORDER BY created_at, id").all() as Array<{ id: string; source: string; user_id: string; created_at: string; is_auxiliary: number | null; raw_json: string }>;
  for (const r of rows) {
    const x = extractObservations(r.source, r.raw_json, { snapshotId: r.id, userId: r.user_id, observedAt: r.created_at, isAuxiliary: r.is_auxiliary === 1 });
    const stmts = observationStatements(d1, x);
    if (stmts.length) await d1.batch(stmts);
  }
}
