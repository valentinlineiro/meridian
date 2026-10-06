import type { MatchRow } from "../types.ts";

export async function insertSnapshot(db: D1Database, s: { id: string; createdAt: string; source: string; userId: string; rawJson: string; gamesCount: number; pagesCount: number; checksum: string; sizeBytes: number }) {
  await db.prepare("INSERT INTO snapshots (id, created_at, source, user_id, raw_json, games_count, pages_count, checksum, size_bytes) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(s.id, s.createdAt, s.source, s.userId, s.rawJson, s.gamesCount, s.pagesCount, s.checksum, s.sizeBytes).run();
}

// Writes only what is new. A match already stored is never rewritten: ingesting re-sends the whole history, and the old
// per-match upsert cost 2 rows and a match_snapshots row (4 with indexes) per match on every ingest. The one change a known
// match can still receive is a different `played_at`. `last_seen_at` and the snapshot membership of
// known matches are no longer recorded (nothing reads them; `matches.snapshot_id` keeps the first sighting).
export async function upsertMatches(db: D1Database, items: Array<{ row: MatchRow; raw: any }>, snapshotId: string, now: string): Promise<{ added: number }> {
  // One entry per match: its first occurrence supplies the stored values, the last non-null `played_at` wins (as the old upsert did).
  const byId = new Map<string, { first: { row: MatchRow; raw: any }; playedAt: number | null }>();
  for (const it of items) {
    const e = byId.get(it.row.match_id);
    if (!e) byId.set(it.row.match_id, { first: it, playedAt: it.row.played_at ?? null });
    else if (it.row.played_at != null) e.playedAt = it.row.played_at;
  }
  const ids = [...byId.keys()];
  const known = new Map<string, number | null>(); // match_id -> stored played_at
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const rows = await db.prepare(`SELECT match_id, played_at FROM matches WHERE match_id IN (${chunk.map(() => "?").join(",")})`).bind(...chunk).all<{ match_id: string; played_at: number | null }>();
    for (const r of rows.results ?? []) known.set(r.match_id, r.played_at ?? null);
  }
  const stmts: D1PreparedStatement[] = [];
  let added = 0;
  for (const [id, { first: { row, raw }, playedAt }] of byId) {
    if (known.has(id)) {
      // as before: a non-null incoming `played_at` replaces the stored one, but only a real change is written
      if (playedAt != null && known.get(id) !== playedAt) stmts.push(db.prepare("UPDATE matches SET played_at = ? WHERE match_id = ?").bind(playedAt, id));
      continue;
    }
    added++;
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
      row.page_number, row.index_in_page, row.page_elo, JSON.stringify(raw), now, now, playedAt));
    stmts.push(db.prepare("INSERT OR IGNORE INTO match_snapshots (match_id, snapshot_id) VALUES (?,?)").bind(id, snapshotId));
  }
  // Batch in chunks of 50 to stay under D1 limits.
  for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50));
  return { added };
}

// A path already observed is not rewritten (it used to bump a counter on every ingest; nothing reads occurrence_count).
export async function recordObservations(db: D1Database, obs: Array<{ path: string; valueType: string; example: string | null }>, now: string) {
  for (let i = 0; i < obs.length; i += 50) {
    const chunk = obs.slice(i, i + 50);
    await db.batch(chunk.map((o) => db.prepare(`INSERT OR IGNORE INTO schema_observations (path,value_type,first_seen_at,last_seen_at,occurrence_count,example_value)
      VALUES (?,?,?, ?,1,?)`)
      .bind(o.path, o.valueType, now, now, o.example)));
  }
}
