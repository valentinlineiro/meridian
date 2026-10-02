-- 0001_init.sql
CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  source TEXT NOT NULL,
  user_id TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  games_count INTEGER NOT NULL,
  pages_count INTEGER NOT NULL,
  checksum TEXT NOT NULL UNIQUE,
  size_bytes INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_user ON snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_created ON snapshots(created_at);

CREATE TABLE IF NOT EXISTS matches (
  match_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  opponent_id TEXT,
  opponent_name TEXT,
  opponent_type TEXT,
  opponent_elo INTEGER,
  opponent_suspected_cheating INTEGER,
  user_color TEXT,
  result TEXT,
  outcome TEXT,
  reviewed INTEGER,
  pvp_match_type TEXT,
  page_number INTEGER,
  index_in_page INTEGER,
  page_elo INTEGER,
  raw_json TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_matches_user ON matches(user_id);
CREATE INDEX IF NOT EXISTS idx_matches_otype ON matches(opponent_type);
CREATE INDEX IF NOT EXISTS idx_matches_result ON matches(result);
CREATE INDEX IF NOT EXISTS idx_matches_color ON matches(user_color);
CREATE INDEX IF NOT EXISTS idx_matches_elo ON matches(opponent_elo);
CREATE INDEX IF NOT EXISTS idx_matches_firstseen ON matches(first_seen_at);

CREATE TABLE IF NOT EXISTS match_snapshots (
  match_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  PRIMARY KEY (match_id, snapshot_id)
);
CREATE INDEX IF NOT EXISTS idx_ms_snapshot ON match_snapshots(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_ms_match ON match_snapshots(match_id);

CREATE TABLE IF NOT EXISTS schema_observations (
  path TEXT NOT NULL,
  value_type TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  example_value TEXT,
  PRIMARY KEY (path, value_type)
);
