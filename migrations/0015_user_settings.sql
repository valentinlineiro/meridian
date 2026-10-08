-- 0015_user_settings.sql
-- Meridian-owned user settings. NOT an observation: the goal is chosen by the user in this app and is never read from,
-- or defaulted to, the source's xp_summaries.daily_goal_xp (K7, what Duolingo reports).
-- user_id is the provider user id, the same key as xp_summaries / user_state. One current value per user, no history.
CREATE TABLE user_settings (
  user_id       TEXT PRIMARY KEY,
  daily_goal_xp INTEGER CHECK (daily_goal_xp IS NULL OR (daily_goal_xp BETWEEN 1 AND 10000)),
  updated_at    TEXT NOT NULL
) WITHOUT ROWID;
