-- 0002_collection_runs.sql
CREATE TABLE IF NOT EXISTS collection_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  pages INTEGER,
  matches_received INTEGER,
  new_matches INTEGER,
  existing_matches INTEGER,
  snapshot_id TEXT,
  error TEXT,
  auth_status TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_started ON collection_runs(started_at);

