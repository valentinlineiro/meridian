import { json } from "./import.ts";
import { mapErrorToResponse } from "./errors.ts";
import { resolveProviderUserId } from "../db/users.ts";
import { replayGame, type GameHeaders } from "../domain/gameReplay.ts";

interface Row { user_color: string | null; result: string | null; opponent_name: string | null; played_at: number | null; move_history: string; move_timestamps: string }

const PGN_RESULT: Record<string, GameHeaders["result"]> = { win: "1-0", loss: "0-1", draw: "1/2-1/2" };

const notFound = () => json({ ok: false, error: "game not found", code: "GAME_NOT_FOUND" }, 404);

// The owner's full game: validated plies for the viewer, or the same game as a PGN download.
export async function handleMatchGame(db: D1Database, email: string | null, matchId: string, format: "json" | "pgn"): Promise<Response> {
  if (!email) return json({ ok: false, error: "unauthorized", code: "UNAUTHORIZED" }, 401);
  const userId = await resolveProviderUserId(db, email, "duolingo");
  if (!userId) return json({ ok: false, error: "no provider account", code: "NO_PROVIDER_ACCOUNT" }, 404);

  const row = await db.prepare(
    `SELECT m.user_color, m.result, m.opponent_name, m.played_at, md.move_history, md.move_timestamps
     FROM matches m JOIN match_details md ON md.match_id = m.match_id
     WHERE m.match_id = ? AND m.user_id = ?`,
  ).bind(matchId, userId).first<Row>();
  if (!row) return notFound();

  const me = "Yo";
  const opponent = row.opponent_name ?? "?";
  const white = row.user_color === "black" ? opponent : me;
  const black = row.user_color === "black" ? me : opponent;
  const date = row.played_at ? new Date(row.played_at * 1000).toISOString().slice(0, 10).replaceAll("-", ".") : null;
  try {
    const game = replayGame(JSON.parse(row.move_history), JSON.parse(row.move_timestamps), {
      event: "Duolingo Chess", date, white, black, result: PGN_RESULT[row.result ?? ""] ?? "*",
    });
    if (format === "pgn") {
      return new Response(game.pgn + "\n", {
        headers: {
          "content-type": "application/x-chess-pgn; charset=utf-8",
          "content-disposition": `attachment; filename="meridian-${matchId.replace(/[^\w-]/g, "_")}.pgn"`,
          "cache-control": "no-store",
        },
      });
    }
    return json({ ok: true, matchId, userColor: row.user_color, opponent: row.opponent_name, result: row.result, playedAt: row.played_at, plies: game.plies, pgn: game.pgn });
  } catch (e) {
    const mapped = mapErrorToResponse(e);
    if (mapped) return mapped;
    throw e;
  }
}
