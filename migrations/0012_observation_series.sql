-- 0012_observation_series.sql
-- P2 piece 1 (contract 2026-10-05-observation-model-contract.md, frozen 2026-10-06), §3.1.
-- Immutable series, one row per observation, children of a snapshot. They are written next to the snapshot and
-- read by nothing yet: raw_json stays the source of truth until each read is switched with its parity gate (§7).
--
-- WITHOUT ROWID: the composite primary key IS the table, so a row costs one D1 "row written" instead of two
-- (table + autoindex). No secondary indexes yet: the reads that need them arrive with the read switch.
-- A column is NULL when the payload did not carry it, never 0 (§4.6). extractor_version says which rule wrote the row.

-- K1: account state. A row exists only if the snapshot carried account fields (D-b); absence is not NULL.
CREATE TABLE account_observations (
  snapshot_id        TEXT PRIMARY KEY REFERENCES snapshots(id),
  user_id            TEXT NOT NULL,
  observed_at        TEXT NOT NULL,
  total_xp           INTEGER,
  streak             INTEGER,
  declared_course_id TEXT,
  extractor_version  INTEGER NOT NULL
) WITHOUT ROWID;

-- K2: entry of courses[] as observed. Membership of "language course" is decided when reading (D4), not here.
CREATE TABLE course_observations (
  snapshot_id       TEXT NOT NULL REFERENCES snapshots(id),
  course_id         TEXT NOT NULL,
  user_id           TEXT NOT NULL,
  observed_at       TEXT NOT NULL,
  subject           TEXT,
  learning_language TEXT,
  from_language     TEXT,
  title             TEXT,
  xp                INTEGER,
  extractor_version INTEGER NOT NULL,
  PRIMARY KEY (snapshot_id, course_id)
) WITHOUT ROWID;

-- K4 header: one row per snapshot that carried currentCourse. format_error keeps CourseProgressFormatError's text
-- (and there are then no section rows); course_id is NULL only when currentCourse.id itself was unusable.
CREATE TABLE path_observations (
  snapshot_id       TEXT PRIMARY KEY REFERENCES snapshots(id),
  user_id           TEXT NOT NULL,
  observed_at       TEXT NOT NULL,
  course_id         TEXT,
  active_section_id TEXT,
  format_error      TEXT,
  extractor_version INTEGER NOT NULL
) WITHOUT ROWID;

-- K4: one row per Path section (including daily_refresh). section_id is only stable inside its snapshot (migration 0009).
CREATE TABLE section_observations (
  snapshot_id     TEXT NOT NULL REFERENCES snapshots(id),
  section_index   INTEGER NOT NULL,
  section_id      TEXT NOT NULL,
  type            TEXT,
  cefr_level      TEXT,
  cefr_sublevel   INTEGER,
  completed_units INTEGER,
  total_units     INTEGER,
  PRIMARY KEY (snapshot_id, section_index)
) WITHOUT ROWID;

-- K3: snapshot-level Chess rating ($.eloRating). NOT match_details.elo_after; nothing merges the two (§4).
CREATE TABLE elo_observations (
  snapshot_id       TEXT PRIMARY KEY REFERENCES snapshots(id),
  user_id           TEXT NOT NULL,
  observed_at       TEXT NOT NULL,
  elo               REAL NOT NULL,
  extractor_version INTEGER NOT NULL
) WITHOUT ROWID;
