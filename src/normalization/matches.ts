import type { MatchRow } from "../types.ts";

const MIN_REASONABLE_EPOCH = 1577836800; // 2020-01-01T00:00:00Z
const MAX_REASONABLE_EPOCH = 2051222400; // 2035-01-01T00:00:00Z

export function extractPlayedAt(matchId: unknown): number | null {
  if (typeof matchId !== "string") return null;
  const parts = matchId.split("|");
  if (parts.length < 2 || (parts[0] !== "bot" && parts[0] !== "pvp")) return null;
  const rawTs = parts[1];
  if (rawTs && /^\d{9,11}$/.test(rawTs)) {
    const ts = Number(rawTs);
    if (Number.isFinite(ts) && ts >= MIN_REASONABLE_EPOCH && ts <= MAX_REASONABLE_EPOCH) {
      return Math.trunc(ts);
    }
  }
  return null;
}

// Normalize one raw match. Never coerce null elo to 0.
export function normalizeMatch(raw: any, ctx: { userId: string; pageNumber: number | null; indexInPage: number; pageElo: number | null }): MatchRow | null {
  const id = raw?.matchId ?? raw?.match_id ?? raw?.id;
  if (typeof id !== "string" && typeof id !== "number") return null;
  const strId = String(id);
  const eloRaw = raw?.opponentEloRating ?? raw?.opponent_elo ?? null;
  const opponentElo = typeof eloRaw === "number" && Number.isFinite(eloRaw) ? Math.trunc(eloRaw) : null;
  const num = (v: any): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null);
  return {
    match_id: strId,
    user_id: ctx.userId,
    opponent_id: raw?.opponentId != null ? String(raw.opponentId) : null,
    opponent_name: typeof raw?.opponentName === "string" ? raw.opponentName : null,
    opponent_type: typeof raw?.opponentType === "string" ? raw.opponentType : null,
    opponent_elo: opponentElo,
    opponent_suspected_cheating: typeof raw?.opponentSuspectedCheating === "boolean" ? (raw.opponentSuspectedCheating ? 1 : 0) : null,
    user_color: typeof raw?.userColor === "string" ? raw.userColor : null,
    result: typeof raw?.result === "string" ? raw.result : null,
    outcome: typeof raw?.outcome === "string" ? raw.outcome : null,
    reviewed: typeof raw?.reviewed === "boolean" ? (raw.reviewed ? 1 : 0) : null,
    pvp_match_type: typeof raw?.pvpMatchType === "string" ? raw.pvpMatchType : null,
    page_number: ctx.pageNumber,
    index_in_page: ctx.indexInPage,
    page_elo: num(raw?.pageElo) ?? ctx.pageElo,
    played_at: extractPlayedAt(strId),
  };
}

// Find candidate match arrays inside unknown source JSON.
export function collectPages(data: any): Array<{ matches: any[]; pageElo: number | null; pageNumber: number | null }> {
  if (!data || typeof data !== "object") return [];
  if (Array.isArray(data)) {
    return looksLikeMatches(data) ? [{ matches: data, pageElo: null, pageNumber: 0 }] : [];
  }
  if (Array.isArray((data as any).pages)) {
    return (data as any).pages.map((p: any, i: number) => ({
      matches: Array.isArray(p?.matches) ? p.matches : Array.isArray(p?.matchHistory) ? p.matchHistory : looksLikeMatches(p) && Array.isArray(p) ? p : [],
      pageElo: typeof p?.eloRating === "number" ? p.eloRating : typeof p?.pageElo === "number" ? p.pageElo : null,
      pageNumber: typeof p?.pageNumber === "number" ? p.pageNumber : i,
    }));
  }
  for (const key of ["matchHistory", "matches", "completedMatches", "match_history"]) {
    if (Array.isArray((data as any)[key]) && looksLikeMatches((data as any)[key])) {
      const elo = typeof (data as any).eloRating === "number" ? (data as any).eloRating : null;
      return [{ matches: (data as any)[key], pageElo: elo, pageNumber: 0 }];
    }
  }
  // Fallback: scan all values for match-like arrays.
  const out: Array<{ matches: any[]; pageElo: number | null; pageNumber: number | null }> = [];
  let n = 0;
  const scan = (v: any) => {
    if (Array.isArray(v) && looksLikeMatches(v)) out.push({ matches: v, pageElo: null, pageNumber: n++ });
    else if (v && typeof v === "object" && !Array.isArray(v)) Object.values(v).forEach(scan);
  };
  scan(data);
  return out;
}

function looksLikeMatches(arr: any[]): boolean {
  if (arr.length === 0) return false;
  const first = arr[0];
  return !!first && typeof first === "object" && ("matchId" in first || "match_id" in first);
}

export function extractMatches(data: any, userId: string): Array<{ row: MatchRow; raw: any }> {
  const pages = collectPages(data);
  const out: Array<{ row: MatchRow; raw: any }> = [];
  for (const p of pages) {
    p.matches.forEach((m, i) => {
      const row = normalizeMatch(m, { userId, pageNumber: p.pageNumber, indexInPage: i, pageElo: p.pageElo });
      if (row) out.push({ row, raw: m });
    });
  }
  return out;
}
