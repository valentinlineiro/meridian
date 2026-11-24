// The /api/stats/weekly payload. Mirrors src/domain/chessWeekly.ts (the Worker owns the shape; the client only reads it).

/** `l` includes disconnection losses; `disconnections` is that subset; `u` is results that could not be classified. */
export interface Tally { w: number; d: number; l: number; u: number; disconnections: number }

export interface WeekBucket {
  week: string; games: number; total: Tally;
  byColor: Record<string, Tally>; byFamily: Record<string, Tally>; byPhase: Record<string, Tally>;
  eloEnd: number | null;
}

export interface Weekly { weeks: WeekBucket[]; undated: Tally & { games: number } }
