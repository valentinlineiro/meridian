-- 0017_a7_compact_xp_events.sql
-- A7 K10: rebuildable per-course XP state-change events. raw_json remains source of truth.
-- Repair uses a fixed watermark and a separate repair_version so later-than-watermark arrivals
-- do not invalidate the prefix being repaired.

CREATE TABLE IF NOT EXISTS observation_series_status (
  user_id TEXT NOT NULL,
  source TEXT NOT NULL,
  head_at TEXT,
  head_id TEXT,
  dirty_at TEXT,
  dirty_id TEXT,
  repair_cursor_at TEXT,
  repair_cursor_id TEXT,
  repair_watermark_at TEXT,
  repair_watermark_id TEXT,
  version INTEGER NOT NULL DEFAULT 0,
  repair_version INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, source)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS course_xp_events (
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
  course_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('value', 'invalid', 'absent')),
  xp REAL,
  prev_state TEXT,
  last_xp REAL,
  extractor_version INTEGER NOT NULL,
  CHECK ((state = 'value' AND xp IS NOT NULL) OR (state <> 'value' AND xp IS NULL)),
  PRIMARY KEY (snapshot_id, course_id)
) WITHOUT ROWID;

-- Latest state per course during ingestion and ordered repair by user/source.
CREATE INDEX IF NOT EXISTS idx_course_xp_events_latest
  ON course_xp_events(user_id, source, course_id, observed_at DESC, snapshot_id DESC);

-- Ordered snapshot timeline for bounded repair ranges.
CREATE INDEX IF NOT EXISTS idx_snapshots_user_source_created
  ON snapshots(user_id, source, created_at, id);
