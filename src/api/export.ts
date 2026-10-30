import { json } from "./import.ts";
import { resolveProviderUserId } from "../db/users.ts";
import { toCsv } from "../domain/matchExport.ts";

const COLUMNS = [
  "match_id", "played_at", "user_color", "result", "outcome", "opponent_name", "opponent_type", "opponent_elo",
  "pvp_match_type", "elo_after", "end_condition", "opening_key", "phase_key", "ply_count", "session_duration",
] as const;

export async function handleExportMatches(db: D1Database, email: string | null, today: string): Promise<Response> {
  if (!email) return json({ ok: false, error: "unauthorized", code: "UNAUTHORIZED" }, 401);
  const userId = await resolveProviderUserId(db, email, "duolingo");
  if (!userId) return json({ ok: false, error: "no provider account", code: "NO_PROVIDER_ACCOUNT" }, 404);

  const { results } = await db.prepare(
    `SELECT m.match_id, strftime('%Y-%m-%dT%H:%M:%SZ', m.played_at, 'unixepoch') AS played_at,
            m.user_color, m.result, m.outcome, m.opponent_name, m.opponent_type, m.opponent_elo, m.pvp_match_type,
            md.elo_after, md.end_condition, md.opening_key, md.phase_key, md.ply_count, md.session_duration
     FROM matches m LEFT JOIN match_details md ON md.match_id = m.match_id
     WHERE m.user_id = ?
     ORDER BY COALESCE(m.played_at, 0) ASC, m.rowid ASC`,
  ).bind(userId).all<Record<(typeof COLUMNS)[number], string | number | null>>();

  // BOM: without it Excel reads UTF-8 as ANSI and mangles accents in opponent names
  const body = "﻿" + toCsv(COLUMNS, (results ?? []).map((r) => COLUMNS.map((c) => r[c] ?? null)));
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="meridian-partidas-${today}.csv"`,
      "cache-control": "no-store",
    },
  });
}
