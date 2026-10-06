import type { MatchRow } from "../../src/types.ts";

export async function insertSnapshot(db: D1Database, s: { id: string; createdAt: string; source: string; userId: string; rawJson: string; gamesCount: number; pagesCount: number; checksum: string; sizeBytes: number }) {
  await db.prepare("INSERT INTO snapshots (id, created_at, source, user_id, raw_json, games_count, pages_count, checksum, size_bytes) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(s.id, s.createdAt, s.source, s.userId, s.rawJson, s.gamesCount, s.pagesCount, s.checksum, s.sizeBytes).run();
}

export async function upsertMatches(db: D1Database, items: Array<{ row: MatchRow; raw: any }>, snapshotId: string, now: string): Promise<{ added: number }> {
  // D1 reports meta.changes=1 for ON CONFLICT DO UPDATE as well, so true inserts
  // are measured with a prior SELECT instead of upsert metadata.
  const distinctIds = [...new Set(items.map((i) => i.row.match_id))];
  const existing = new Set<string>();
  for (let i = 0; i < distinctIds.length; i += 50) {
    const chunk = distinctIds.slice(i, i + 50);
    const rows = await db.prepare(`SELECT match_id FROM matches WHERE match_id IN (${chunk.map(() => "?").join(",")})`).bind(...chunk).all<{ match_id: string }>();
    for (const r of rows.results ?? []) existing.add(r.match_id);
  }
  let added = 0;
  const counted = new Set<string>();
  for (const { row } of items) {
    if (!existing.has(row.match_id) && !counted.has(row.match_id)) { added++; counted.add(row.match_id); }
  }
  // Batch in chunks of 50 to stay under D1 limits.
  for (let i = 0; i < items.length; i += 50) {
    const chunk = items.slice(i, i + 50);
    const stmts: D1PreparedStatement[] = [];
    for (const { row, raw } of chunk) {
      stmts.push(db.prepare(`INSERT INTO matches (
        match_id, user_id, snapshot_id, opponent_id, opponent_name, opponent_type,
        opponent_elo, opponent_suspected_cheating, user_color, result, outcome,
        reviewed, pvp_match_type, page_number, index_in_page, page_elo, raw_json,
        first_seen_at, last_seen_at, played_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(match_id) DO UPDATE SET
        last_seen_at = excluded.last_seen_at,
        played_at = COALESCE(excluded.played_at, matches.played_at)`).bind(
        row.match_id, row.user_id, snapshotId, row.opponent_id, row.opponent_name, row.opponent_type, row.opponent_elo,
        row.opponent_suspected_cheating, row.user_color, row.result, row.outcome, row.reviewed, row.pvp_match_type,
        row.page_number, row.index_in_page, row.page_elo, JSON.stringify(raw), now, now, row.played_at));
      stmts.push(db.prepare("INSERT OR IGNORE INTO match_snapshots (match_id, snapshot_id) VALUES (?,?)").bind(row.match_id, snapshotId));
    }
    await db.batch(stmts);
  }
  return { added };
}

export async function recordObservations(db: D1Database, obs: Array<{ path: string; valueType: string; example: string | null }>, now: string) {
  for (let i = 0; i < obs.length; i += 50) {
    const chunk = obs.slice(i, i + 50);
    await db.batch(chunk.map((o) => db.prepare(`INSERT INTO schema_observations (path,value_type,first_seen_at,last_seen_at,occurrence_count,example_value)
      VALUES (?,?,?, ?,1,?) ON CONFLICT(path,value_type) DO UPDATE SET last_seen_at=excluded.last_seen_at, occurrence_count=occurrence_count+1`)
      .bind(o.path, o.valueType, now, now, o.example)));
  }
}
