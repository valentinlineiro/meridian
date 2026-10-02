-- 0009_course_sections_pk.sql
-- Fix primary key of course_sections to (user_id, course_id, section_index) to prevent duplicate zombie sections when the source rotates internal section_id UUIDs

CREATE TABLE course_sections_new (
  user_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  section_index INTEGER NOT NULL,
  section_id TEXT NOT NULL,
  type TEXT,
  cefr_level TEXT,
  cefr_sublevel INTEGER,
  completed_units INTEGER,
  total_units INTEGER,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (user_id, course_id, section_index)
);

INSERT OR REPLACE INTO course_sections_new (
  user_id, course_id, section_index, section_id, type, cefr_level, cefr_sublevel, completed_units, total_units, last_seen_at
)
SELECT user_id, course_id, section_index, section_id, type, cefr_level, cefr_sublevel, completed_units, total_units, max(last_seen_at)
FROM course_sections
GROUP BY user_id, course_id, section_index;

DROP TABLE course_sections;
ALTER TABLE course_sections_new RENAME TO course_sections;

CREATE INDEX IF NOT EXISTS idx_course_sections_course ON course_sections(user_id, course_id);
