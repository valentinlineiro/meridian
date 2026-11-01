import { json } from "./import.ts";
import { readEngineEval, type EngineEvalOk } from "../domain/engineEval.ts";
import type { ThreatPhase } from "../domain/mateThreats.ts";
import { median } from "../analytics/median.ts";

// The player profile, from the per-game engine summaries the scheduled analysis stored. Only well-formed `ok` results count; pending, invalid
// and unreadable ones are reported apart so no denominator is silently shrunk. Everything is descriptive: rates carry their move counts and
// no interval, because the errors of one game are not independent observations.
const BLOCK = 50;       // games per trend block
const REVIEW_MIN = 20;  // own moves a game needs to enter the review lists
const REVIEW_SIZE = 20;

interface Game { matchId: string; result: string | null; color: "white" | "black" | null; playedAt: number; v: EngineEvalOk }
const PHASES: ThreatPhase[] = ["opening", "middlegame", "endgame"];
const rate = (serious: number, moves: number) => (moves ? (100 * serious) / moves : null);
const seriousOf = (v: EngineEvalOk) => PHASES.reduce((a, p) => a + v.byPhase[p][1], 0);
const medianOf = (xs: number[]) => (xs.length ? median(xs) : null);

function totals(games: Game[]) {
  const moves = games.reduce((a, g) => a + g.v.moves, 0), serious = games.reduce((a, g) => a + seriousOf(g.v), 0), loss = games.reduce((a, g) => a + g.v.loss, 0);
  return { games: games.length, moves, serious, ratePer100: rate(serious, moves), acpl: moves ? loss / moves : null };
}
const outcomes = (games: Game[]) => ({
  games: games.length, win: games.filter((g) => g.result === "win").length, draw: games.filter((g) => g.result === "draw").length, loss: games.filter((g) => g.result === "loss").length,
});

function section(games: Game[]) {
  const phase = (p: ThreatPhase) => { const moves = games.reduce((a, g) => a + g.v.byPhase[p][0], 0), serious = games.reduce((a, g) => a + g.v.byPhase[p][1], 0); return { moves, serious, ratePer100: rate(serious, moves) }; };
  const colour = (c: "white" | "black") => { const t = totals(games.filter((g) => g.color === c)); return { games: t.games, moves: t.moves, serious: t.serious, ratePer100: t.ratePer100 }; };
  const lost = games.filter((g) => g.result === "loss");
  const decisive = lost.filter((g) => g.v.decisivePly !== null).map((g) => g.v.decisivePly!);
  const advantage = outcomes(games.filter((g) => g.v.sustainedAdv));
  return {
    ...totals(games),
    byPhase: { opening: phase("opening"), middlegame: phase("middlegame"), endgame: phase("endgame") },
    byColor: { white: colour("white"), black: colour("black") },
    decisive: {
      lossGames: lost.length, withDecisive: decisive.length, medianMove: medianOf(decisive.map((ply) => Math.ceil(ply / 2))),
      byPhase: { opening: decisive.filter((p) => p <= 20).length, middlegame: decisive.filter((p) => p > 20 && p <= 60).length, endgame: decisive.filter((p) => p > 60).length },
    },
    conversion: { advantage, disadvantage: outcomes(games.filter((g) => g.v.sustainedDis)), thrown: advantage.loss },
  };
}

function blocks(games: Game[]) {
  const out = [];
  for (let i = 0; i < games.length; i += BLOCK) {
    const chunk = games.slice(i, i + BLOCK), t = totals(chunk);
    out.push({ games: t.games, moves: t.moves, serious: t.serious, ratePer100: t.ratePer100, acpl: t.acpl, partial: chunk.length < BLOCK });
  }
  return out;
}

function review(games: Game[]) {
  const row = (g: Game) => ({ matchId: g.matchId, result: g.result, moves: g.v.moves, serious: seriousOf(g.v), acpl: g.v.loss / g.v.moves, decisivePly: g.v.decisivePly });
  const eligible = games.filter((g) => g.v.moves >= REVIEW_MIN).map(row);
  return {
    worst: [...eligible].sort((a, b) => b.acpl - a.acpl || a.matchId.localeCompare(b.matchId)).slice(0, REVIEW_SIZE),
    best: [...eligible].sort((a, b) => a.acpl - b.acpl || a.matchId.localeCompare(b.matchId)).slice(0, REVIEW_SIZE),
  };
}

export async function handleStatsProfile(db: D1Database, url: URL): Promise<Response> {
  const userId = url.searchParams.get("userId");
  const sinceId = url.searchParams.get("since");
  const q = `
    SELECT m.match_id, m.result, m.user_color, m.opponent_type, m.played_at, md.engine_eval
    FROM matches m JOIN match_details md ON md.match_id = m.match_id
    ${userId ? "WHERE m.user_id = ?" : ""}
    ORDER BY COALESCE(m.played_at, 0) ASC, m.rowid ASC
  `;
  const rows = (await (userId ? db.prepare(q).bind(userId) : db.prepare(q)).all<{ match_id: string; result: string | null; user_color: string | null; opponent_type: string | null; played_at: number | null; engine_eval: string | null }>()).results ?? [];

  const games: Game[] = []; // oldest first
  let pending = 0, invalid = 0, unknownVersion = 0, bots = 0;
  for (const r of rows) {
    if ((r.opponent_type ?? "").toLowerCase() === "bot") bots++;
    const read = readEngineEval(r.engine_eval);
    if (read.state === "ok") {
      const c = r.user_color?.trim().toLowerCase();
      games.push({ matchId: r.match_id, result: r.result, color: c === "white" || c === "black" ? c : null, playedAt: r.played_at ?? 0, v: read.value });
    } else if (read.state === "pending") pending++;
    else if (read.state === "invalid") invalid++;
    else unknownVersion++;
  }

  // The cut belongs to "before": games played after that game are "after". An unknown or undated cut is reported as null, never as an error.
  const cut = sinceId ? rows.find((r) => r.match_id === sinceId && r.played_at != null) : undefined;
  const since = cut ? { matchId: cut.match_id, playedAt: cut.played_at! } : null;

  return json({
    analysed: games.length, pending, invalid, unknownVersion,
    bots: { games: bots, total: rows.length, share: rows.length ? bots / rows.length : null },
    since,
    all: section(games),
    before: since ? section(games.filter((g) => g.playedAt <= since.playedAt)) : null,
    after: since ? section(games.filter((g) => g.playedAt > since.playedAt)) : null,
    blocks: blocks(games),
    review: review(games),
  });
}
