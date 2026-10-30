import type { MatchDetailRecord } from "../types.ts";
import type { StoredMateThreats } from "../domain/mateThreats.ts";

export interface EnrichedMatchDetailRecord extends MatchDetailRecord {
  opening_key: string | null;
  opening_family?: string | null;
  mate_type?: string | null;
  phase_key: string | null;
  ply_count: number | null;
}

export interface MatchPort {
  getMatchUserAndColor(matchId: string): Promise<{ userId: string; userColor: string | null } | null>;
  saveMatchDetail(detail: EnrichedMatchDetailRecord): Promise<void>;
  getMatchDetail(matchId: string): Promise<MatchDetailRecord | null>;
  getPendingMatchIds(limit: number): Promise<{
    items: { match_id: string }[];
    totalPending: number;
    next: boolean;
  }>;
  // Games with a stored detail and no mate-threat result yet, newest first (ties by match_id).
  getPendingThreats(limit: number): Promise<{
    items: { match_id: string; user_color: string | null; move_history: string }[];
    totalPending: number;
  }>;
  // What a result must be consistent with; null when the game has no detail or the owner's colour is unknown.
  getThreatTarget(matchId: string): Promise<{ plyCount: number; userColor: "white" | "black" } | null>;
  saveMateThreats(matchId: string, stored: StoredMateThreats): Promise<void>;
}
