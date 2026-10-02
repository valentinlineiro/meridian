import type { MatchDetailRecord } from "../types.ts";

export interface EnrichedMatchDetailRecord extends MatchDetailRecord {
  opening_key: string | null;
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
}
