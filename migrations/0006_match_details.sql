CREATE TABLE IF NOT EXISTS match_details (
  match_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  opponent_id TEXT,
  is_hard_match INTEGER,
  is_placement_match INTEGER,
  is_revenge_match INTEGER,
  predicted_elo_win INTEGER,
  predicted_elo_loss INTEGER,
  predicted_elo_draw INTEGER,
  elo_after INTEGER,
  outcome TEXT,
  end_condition TEXT,
  status TEXT NOT NULL,
  move_history TEXT NOT NULL,
  move_timestamps TEXT NOT NULL,
  final_fen TEXT,
  reaction TEXT,
  session_duration REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_match_details_user_id ON match_details (user_id);
