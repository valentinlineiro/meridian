-- 0014_course_path_state.sql
-- P2 piece 2b, K5 (contract §3.2 + amendment A1): CURRENT state of each course's Path tree, overwritten by newer
-- snapshots. Written by row-level diff, so an unchanged tree writes nothing and a changed one writes only its changed rows.
-- Read by nothing yet. WITHOUT ROWID: one D1 row written per row, no secondary indexes.
-- No FK on snapshot_id: the pointer may be written before the snapshot row (which is written last, see ingestSnapshot).

CREATE TABLE course_path_state (
  user_id     TEXT NOT NULL,
  course_id   TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,   -- snapshot the stored tree comes from
  observed_at TEXT NOT NULL,   -- that snapshot's created_at
  tree_hash   TEXT NOT NULL,   -- sha256 of the canonical tree, only what K5 persists (A1 §3)
  PRIMARY KEY (user_id, course_id)
) WITHOUT ROWID;

CREATE TABLE course_path_units (
  user_id           TEXT NOT NULL,
  course_id         TEXT NOT NULL,
  unit_index        INTEGER NOT NULL,  -- position in the whole course
  section_index     INTEGER NOT NULL,
  teaching_objective TEXT,
  cefr_level        TEXT,
  is_unlocked       INTEGER,           -- raw flag, not progress
  levels_captured   INTEGER NOT NULL,  -- 0 = levels not in the snapshot, 1 = captured (possibly empty)
  PRIMARY KEY (user_id, course_id, unit_index)
) WITHOUT ROWID;

CREATE TABLE course_path_levels (
  user_id            TEXT NOT NULL,
  course_id          TEXT NOT NULL,
  unit_index         INTEGER NOT NULL,
  level_ordinal      INTEGER NOT NULL,  -- position in the payload's levels array
  state              TEXT NOT NULL,     -- free text, no CHECK: the source may add states
  finished_sessions  INTEGER,
  total_sessions     INTEGER,
  skill_id           TEXT,
  crown_level_index  INTEGER,
  tree_id            TEXT,
  reached_score      REAL,
  learning_score     REAL,
  reached_progress   REAL,
  completed_progress REAL,
  PRIMARY KEY (user_id, course_id, unit_index, level_ordinal)
) WITHOUT ROWID;
