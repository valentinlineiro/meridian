-- 0008_languages.sql
-- Relational model and auxiliary auditing for Languages

-- 1. Snapshot auxiliary audit columns
ALTER TABLE snapshots ADD COLUMN sync_id TEXT;
ALTER TABLE snapshots ADD COLUMN is_auxiliary INTEGER DEFAULT 0;
ALTER TABLE snapshots ADD COLUMN original_course_id TEXT;
ALTER TABLE snapshots ADD COLUMN observed_course_id TEXT;

CREATE INDEX IF NOT EXISTS idx_snapshots_sync ON snapshots(sync_id);

-- 2. User account progress state (mutable observation)
CREATE TABLE IF NOT EXISTS user_state (
  user_id TEXT PRIMARY KEY,
  total_xp INTEGER,
  streak INTEGER,
  current_course_id TEXT,
  updated_at TEXT NOT NULL
);

-- 3. Course catalog and cumulative progress per user
CREATE TABLE IF NOT EXISTS courses (
  user_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  title TEXT,
  learning_language TEXT,
  from_language TEXT,
  subject TEXT,
  topic TEXT,
  xp INTEGER,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (user_id, course_id)
);
CREATE INDEX IF NOT EXISTS idx_courses_user ON courses(user_id);

-- 4. Course sections curriculum and unit completion
CREATE TABLE IF NOT EXISTS course_sections (
  user_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  section_index INTEGER NOT NULL,
  type TEXT,
  cefr_level TEXT,
  cefr_sublevel INTEGER,
  completed_units INTEGER,
  total_units INTEGER,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (user_id, course_id, section_index)
);
CREATE INDEX IF NOT EXISTS idx_course_sections_course ON course_sections(user_id, course_id);

-- 5. Daily activity time-series
CREATE TABLE IF NOT EXISTS xp_summaries (
  user_id TEXT NOT NULL,
  date INTEGER NOT NULL,
  gained_xp INTEGER NOT NULL,
  num_sessions INTEGER NOT NULL,
  total_session_time INTEGER NOT NULL,
  streak_extended INTEGER,
  frozen INTEGER,
  repaired INTEGER,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_xp_summaries_user_date ON xp_summaries(user_id, date);
