import type { LanguagePort } from "../ports/languagePort.ts";

export interface LanguageXpResult {
  userId: string;
  days: number;
  summaries: Array<{
    date: string | number;
    gainedXp: number;
    numSessions: number;
    totalSessionTime: number;
    streakExtended: boolean;
    frozen: boolean;
    repaired: boolean;
    updatedAt: string;
  }>;
}

export async function getLanguageXp(
  port: LanguagePort,
  days: number,
  isAsc: boolean,
  explicitUserId?: string | null
): Promise<LanguageXpResult | null> {
  const userId = await port.resolveUserId(explicitUserId);
  if (!userId) return null;

  const rows = await port.getXpSummaries(userId, days);

  const summaries = rows.map((s) => ({
    date: s.date,
    gainedXp: s.gained_xp,
    numSessions: s.num_sessions,
    totalSessionTime: s.total_session_time,
    streakExtended: Boolean(s.streak_extended),
    frozen: Boolean(s.frozen),
    repaired: Boolean(s.repaired),
    updatedAt: s.updated_at,
  }));

  if (isAsc) {
    summaries.reverse();
  }

  return {
    userId,
    days,
    summaries,
  };
}
