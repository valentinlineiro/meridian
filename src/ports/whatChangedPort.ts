export interface ChessPointInTime {
  // `observedAt` and the lifetime counters describe the last game at or before `since`. `rating` is a different observation:
  // the ELO of the last anchor (A4) at or before `since`, placed at `ratingAt` = that anchor game's played_at. They can differ.
  // The ELO was read from a snapshot at or after `ratingAt`; it is not claimed to be the exact ELO right after that game (S1).
  rating: number | null;
  ratingAt: string | null;
  lifetimeGames: number; // observed
  lifetimeDecided: number; // win + loss + draw: the denominator of lifetime rates
  lifetimeWins: number;
  observedAt: string;
}

export interface ChessIntervalData {
  gamesCount: number; // observed
  decidedCount: number; // win + loss + draw: usable evidence and denominator of the rates
  wins: number;
  whiteGames: number;
  whiteDecided: number;
  whiteWins: number;
  blackGames: number;
  blackDecided: number;
  blackWins: number;
  latestRating: number | null;
  latestRatingAt: string | null; // played_at of the anchor game that carries latestRating
}

export interface LanguagesPointInTime {
  totalXp: number | null;
  activeCourseId: string | null;
  streak: number | null;
  observedAt: string;
}

export interface LanguagesIntervalData {
  xpGained: number;
  sessionsCount: number;
  totalSessionMinutes: number;
  daysWithActivity: number;
}

export interface WhatChangedPort {
  resolveUserId(explicitUserId?: string | null): Promise<string | null>;
  getChessBaseline(userId: string, since: string): Promise<{ data: ChessPointInTime | null; status: "exactOrPrevious" | "firstHistorical" | "unavailable" }>;
  getChessInterval(userId: string, since: string, until: string): Promise<ChessIntervalData>;
  getLanguagesBaseline(userId: string, since: string): Promise<{ data: LanguagesPointInTime | null; status: "exactOrPrevious" | "firstHistorical" | "unavailable" }>;
  getLanguagesTarget(userId: string, until: string): Promise<{ data: LanguagesPointInTime | null; status: "exactOrPrevious" | "unavailable" }>;
  getLanguagesInterval(userId: string, since: string, until: string): Promise<LanguagesIntervalData>;
  getHistoricalDailyXpRate(userId: string, before: string): Promise<number>;
}

