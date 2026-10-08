-- 0011_user_state_observed_at.sql
-- user_state.updated_at only says "a snapshot was applied". It says nothing about whether XP, streak or the
-- course were actually observed in it, so a stale value looked fresh. Record when each field was last observed.
ALTER TABLE user_state ADD COLUMN total_xp_observed_at TEXT;
ALTER TABLE user_state ADD COLUMN streak_observed_at TEXT;
ALTER TABLE user_state ADD COLUMN current_course_observed_at TEXT;

-- Backfill from what the stored snapshots actually contain (NULL when the field was never observed).
UPDATE user_state SET
  total_xp_observed_at = (SELECT MAX(s.created_at) FROM snapshots s
    WHERE s.user_id = user_state.user_id AND s.source = 'duolingo-lang'
      AND COALESCE(json_extract(s.raw_json, '$.user.totalXp'), json_extract(s.raw_json, '$.totalXp')) IS NOT NULL),
  streak_observed_at = (SELECT MAX(s.created_at) FROM snapshots s
    WHERE s.user_id = user_state.user_id AND s.source = 'duolingo-lang'
      AND COALESCE(json_extract(s.raw_json, '$.user.streak'), json_extract(s.raw_json, '$.streak')) IS NOT NULL),
  current_course_observed_at = (SELECT MAX(s.created_at) FROM snapshots s
    WHERE s.user_id = user_state.user_id AND s.source = 'duolingo-lang' AND s.is_auxiliary = 0
      AND COALESCE(json_extract(s.raw_json, '$.user.currentCourseId'), json_extract(s.raw_json, '$.currentCourseId')) IS NOT NULL);
