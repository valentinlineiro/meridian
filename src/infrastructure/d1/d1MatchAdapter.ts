import type { MatchPort, EnrichedMatchDetailRecord } from "../../ports/matchPort.ts";
import type { MatchDetailRecord } from "../../types.ts";
import type { StoredMateThreats } from "../../domain/mateThreats.ts";

async function saveMatchDetail(db: D1Database, d: MatchDetailRecord): Promise<void> {
  let moves: string[] = [];
  if (typeof d.move_history === "string") {
    try {
      const parsed = JSON.parse(d.move_history);
      if (Array.isArray(parsed)) {
        moves = parsed.map(String);
      }
    } catch {
      moves = [];
    }
  } else if (Array.isArray(d.move_history)) {
    moves = (d.move_history as any[]).map(String);
  }

  const plyCount = d.ply_count ?? moves.length;
  const phaseKey = d.phase_key ?? null;
  const openingKey = d.opening_key ?? null;

  const sql = `
    INSERT INTO match_details (
      match_id, user_id, opponent_id, is_hard_match, is_placement_match, is_revenge_match,
      predicted_elo_win, predicted_elo_loss, predicted_elo_draw, elo_after, outcome,
      end_condition, status, move_history, move_timestamps, final_fen, reaction,
      session_duration, opening_key, phase_key, ply_count, opening_family, mate_type, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(match_id) DO UPDATE SET
      user_id = excluded.user_id,
      opponent_id = excluded.opponent_id,
      is_hard_match = excluded.is_hard_match,
      is_placement_match = excluded.is_placement_match,
      is_revenge_match = excluded.is_revenge_match,
      predicted_elo_win = excluded.predicted_elo_win,
      predicted_elo_loss = excluded.predicted_elo_loss,
      predicted_elo_draw = excluded.predicted_elo_draw,
      elo_after = excluded.elo_after,
      outcome = excluded.outcome,
      end_condition = excluded.end_condition,
      status = excluded.status,
      move_history = excluded.move_history,
      move_timestamps = excluded.move_timestamps,
      final_fen = excluded.final_fen,
      reaction = excluded.reaction,
      session_duration = excluded.session_duration,
      opening_key = excluded.opening_key,
      phase_key = excluded.phase_key,
      ply_count = excluded.ply_count,
      opening_family = excluded.opening_family,
      mate_type = excluded.mate_type,
      updated_at = datetime('now')
  `;

  await db.prepare(sql).bind(
    d.match_id,
    d.user_id,
    d.opponent_id ?? null,
    d.is_hard_match ?? null,
    d.is_placement_match ?? null,
    d.is_revenge_match ?? null,
    d.predicted_elo_win ?? null,
    d.predicted_elo_loss ?? null,
    d.predicted_elo_draw ?? null,
    d.elo_after ?? null,
    d.outcome ?? null,
    d.end_condition ?? null,
    d.status,
    typeof d.move_history === "string" ? d.move_history : JSON.stringify(d.move_history ?? []),
    typeof d.move_timestamps === "string" ? d.move_timestamps : JSON.stringify(d.move_timestamps ?? []),
    d.final_fen ?? null,
    typeof d.reaction === "string" ? d.reaction : (d.reaction ? JSON.stringify(d.reaction) : null),
    d.session_duration ?? null,
    openingKey,
    phaseKey,
    plyCount,
    d.opening_family ?? null,
    d.mate_type ?? null
  ).run();
}

async function getMatchDetail(db: D1Database, matchId: string): Promise<MatchDetailRecord | null> {
  const row = await db.prepare("SELECT * FROM match_details WHERE match_id = ?").bind(matchId).first<MatchDetailRecord>();
  return row ?? null;
}

export function createD1MatchAdapter(db: D1Database): MatchPort {
  return {
    async getMatchUserAndColor(matchId: string): Promise<{ userId: string; userColor: string | null } | null> {
      const row = await db.prepare("SELECT user_id, user_color FROM matches WHERE match_id = ?")
        .bind(matchId)
        .first<{ user_id: string; user_color: string | null }>();
      if (!row) return null;
      return { userId: row.user_id, userColor: row.user_color ?? null };
    },

    async saveMatchDetail(detail: EnrichedMatchDetailRecord): Promise<void> {
      await saveMatchDetail(db, detail);
    },

    async getMatchDetail(matchId: string): Promise<MatchDetailRecord | null> {
      return getMatchDetail(db, matchId);
    },

    async getPendingMatchIds(limit: number): Promise<{
      items: { match_id: string }[];
      totalPending: number;
      next: boolean;
    }> {
      const countRow = await db.prepare(`
        SELECT COUNT(*) as count
        FROM matches m
        WHERE NOT EXISTS (
          SELECT 1 FROM match_details md WHERE md.match_id = m.match_id
        )
      `).bind().first<{ count: number }>();

      const totalPending = countRow?.count ? Number(countRow.count) : 0;

      const { results } = await db.prepare(`
        SELECT m.match_id
        FROM matches m
        WHERE NOT EXISTS (
          SELECT 1 FROM match_details md WHERE md.match_id = m.match_id
        )
        ORDER BY m.played_at DESC
        LIMIT ?
      `).bind(limit).all<{ match_id: string }>();

      const items = (results ?? []).map((r) => ({ match_id: r.match_id }));
      const next = totalPending > items.length;

      return {
        items,
        totalPending,
        next,
      };
    },

    async getPendingThreats(limit: number) {
      const countRow = await db.prepare(`
        SELECT COUNT(*) AS count FROM match_details md JOIN matches m ON m.match_id = md.match_id
        WHERE md.mate_threats IS NULL AND LOWER(TRIM(m.user_color)) IN ('white', 'black')
      `).bind().first<{ count: number }>();
      const { results } = await db.prepare(`
        SELECT md.match_id, m.user_color, md.move_history
        FROM match_details md
        JOIN matches m ON m.match_id = md.match_id
        WHERE md.mate_threats IS NULL AND LOWER(TRIM(m.user_color)) IN ('white', 'black')
        ORDER BY m.played_at IS NULL, m.played_at DESC, md.match_id ASC
        LIMIT ?
      `).bind(limit).all<{ match_id: string; user_color: string | null; move_history: string }>();
      return { items: results ?? [], totalPending: Number(countRow?.count ?? 0) };
    },

    async getThreatTarget(matchId: string) {
      const row = await db.prepare(`
        SELECT md.ply_count, m.user_color FROM match_details md JOIN matches m ON m.match_id = md.match_id WHERE md.match_id = ?
      `).bind(matchId).first<{ ply_count: number | null; user_color: string | null }>();
      const color = row?.user_color?.trim().toLowerCase();
      if (!row || (color !== "white" && color !== "black")) return null;
      return { plyCount: Number(row.ply_count ?? 0), userColor: color };
    },

    async saveMateThreats(matchId: string, stored: StoredMateThreats): Promise<void> {
      await db.prepare("UPDATE match_details SET mate_threats = ? WHERE match_id = ?").bind(JSON.stringify(stored), matchId).run();
    },
  };
}
