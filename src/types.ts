export interface Env {
  DB: D1Database;
  IMPORT_TOKEN?: string;
  // Owner login (read policy). All three must be set or every user-read request is denied.
  ADMIN_EMAIL?: string;         // the only identity allowed
  ADMIN_PASSWORD_HASH?: string; // pbkdf2-sha256$iterations$salt$hash (scripts/hash-password.mjs)
  SESSION_SECRET?: string;      // >= 32 bytes, signs the session cookie
  GITHUB_ACTIONS_TOKEN?: string; // dispatches the collector workflow ("Sincronizar")
  COLLECTOR_REPO?: string;       // "owner/name" of the repo that holds collector.yml
  COLLECTOR_REF?: string;        // branch to dispatch it on (default "main")
}

export interface MatchRow {
  match_id: string;
  user_id: string;
  snapshot_id?: string;
  opponent_id: string | null;
  opponent_name: string | null;
  opponent_type: string | null;
  opponent_elo: number | null;
  opponent_suspected_cheating: number | null;
  user_color: string | null;
  result: string | null;
  outcome: string | null;
  reviewed: number | null;
  pvp_match_type: string | null;
  page_number: number | null;
  index_in_page: number | null;
  page_elo: number | null;
  played_at: number | null;
  first_seen_at?: string;
  last_seen_at?: string;
}

export interface MatchDetailPayload {
  matchId: string;
  userId: string;
  opponentId?: string | null;
  isHardMatch?: boolean | null;
  isPlacementMatch?: boolean | null;
  isRevengeMatch?: boolean | null;
  predictedEloAfterResult?: {
    win?: number | null;
    loss?: number | null;
    draw?: number | null;
  } | null;
  eloAfter?: number | null;
  outcome?: string | null;
  endCondition?: string | null;
  status: string;
  moveHistory: string[];
  moveTimestamps: number[];
  finalFen?: string | null;
  reaction?: any;
  sessionDuration?: number | null;
}

export interface MatchDetailRecord {
  match_id: string;
  user_id: string;
  opponent_id: string | null;
  is_hard_match: number | null;
  is_placement_match: number | null;
  is_revenge_match: number | null;
  predicted_elo_win: number | null;
  predicted_elo_loss: number | null;
  predicted_elo_draw: number | null;
  elo_after: number | null;
  outcome: string | null;
  end_condition: string | null;
  status: string;
  move_history: string;
  move_timestamps: string;
  final_fen: string | null;
  reaction: string | null;
  session_duration: number | null;
  created_at?: string;
  updated_at?: string;
  opening_key?: string | null;
  phase_key?: string | null;
  ply_count?: number | null;
  user_color?: string | null;
}
