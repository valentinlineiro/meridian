-- 0016_user_view_state.sql
-- Meridian-owned view state: what the user has SEEN. NOT an observation of the source and NOT a setting.
-- changes_seen_through = "the changes up to this instant have been seen" (the `until` of the window that was shown).
-- user_id is the provider user id, the same key as user_settings. One current value per user, no history.
-- Additive: the code without this table keeps working; the code that reads it needs it (apply before merging it).
CREATE TABLE user_view_state (
  user_id              TEXT PRIMARY KEY,
  changes_seen_through TEXT NOT NULL,
  updated_at           TEXT NOT NULL
) WITHOUT ROWID;
