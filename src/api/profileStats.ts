import { json } from "./import.ts";
import type { EngineEvalOk } from "../domain/engineEval.ts";
import type { ThreatPhase } from "../domain/mateThreats.ts";
import { median } from "../analytics/median.ts";

// The player profile, from the per-game engine summaries the scheduled analysis stored. Only well-formed `ok` results count; pending, invalid
// and unreadable ones are reported apart so no denominator is silently shrunk. Everything is descriptive: rates carry their move counts and
// no interval, because the errors of one game are not independent observations.
const BLOCK = 50;       // games per trend block
const REVIEW_MIN = 20;  // own moves a game needs to enter the review lists
const REVIEW_SIZE = 20;

// The only parts of a stored summary the profile needs. They are extracted in SQL: shipping and parsing every game's whole JSON would cost the Worker more CPU than its plan allows.
type Summary = Pick<EngineEvalOk, "moves" | "loss" | "byPhase" | "decisivePly" | "sustainedAdv" | "sustainedDis">;
interface Game { matchId: string; result: string | null; color: "white" | "black" | null; playedAt: number; v: Summary }
const PHASES: ThreatPhase[] = ["opening", "middlegame", "endgame"];
const rate = (serious: number, moves: number) => (moves ? (100 * serious) / moves : null);
const seriousOf = (v: Summary) => PHASES.reduce((a, p) => a + v.byPhase[p][1], 0);
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

const REASONS = new Set(["illegal_game", "corrupt_game", "engine_error"]);
const isCount = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;
// json_extract raises on malformed JSON, so one corrupt row would fail the whole read: extract only from valid JSON.
const EXTRACT = (path: string) => `CASE WHEN json_valid(md.engine_eval) THEN json_extract(md.engine_eval, '${path}') END`;
interface ProfileRow {
  match_id: string; result: string | null; user_color: string | null; opponent_type: string | null; played_at: number | null;
  engine_eval: string | null; valid: number; v: unknown; status: unknown; reason: unknown;
  moves: unknown; loss: unknown; o_m: unknown; o_s: unknown; m_m: unknown; m_s: unknown; e_m: unknown; e_s: unknown; dec: unknown; adv: unknown; dis: unknown;
}

// Same verdicts as readEngineEval, from the extracted scalars: NULL is pending; broken JSON, an unknown version or contradictory figures are "unknown".
function summaryOf(r: ProfileRow): { state: "pending" | "invalid" | "unknown" } | { state: "ok"; value: Summary } {
  if (r.engine_eval === null) return { state: "pending" };
  if (!r.valid || r.v !== 1) return { state: "unknown" };
  if (r.status === "invalid") return typeof r.reason === "string" && REASONS.has(r.reason) ? { state: "invalid" } : { state: "unknown" };
  if (r.status !== "ok") return { state: "unknown" };
  const ph = [[r.o_m, r.o_s], [r.m_m, r.m_s], [r.e_m, r.e_s]];
  if (!isCount(r.moves) || !isCount(r.loss) || !ph.every(([m, x]) => isCount(m) && isCount(x) && x <= m)) return { state: "unknown" };
  if (ph.reduce((a, [m]) => a + (m as number), 0) !== r.moves) return { state: "unknown" };
  if (r.dec !== null && !(Number.isInteger(r.dec) && (r.dec as number) >= 1)) return { state: "unknown" };
  if (![0, 1].includes(r.adv as number) || ![0, 1].includes(r.dis as number)) return { state: "unknown" };
  const t = (i: number) => [ph[i]![0] as number, ph[i]![1] as number] as [number, number];
  return { state: "ok", value: { moves: r.moves, loss: r.loss, byPhase: { opening: t(0), middlegame: t(1), endgame: t(2) }, decisivePly: (r.dec as number | null), sustainedAdv: r.adv === 1, sustainedDis: r.dis === 1 } };
}

export async function handleStatsProfile(db: D1Database, url: URL): Promise<Response> {
  const userId = url.searchParams.get("userId");
  const sinceId = url.searchParams.get("since");
  const q = `
    SELECT m.match_id, m.result, m.user_color, m.opponent_type, m.played_at,
      CASE WHEN md.engine_eval IS NULL THEN NULL ELSE '' END AS engine_eval, COALESCE(json_valid(md.engine_eval), 0) AS valid,
      ${EXTRACT("$.v")} AS v, ${EXTRACT("$.status")} AS status, ${EXTRACT("$.reason")} AS reason,
      ${EXTRACT("$.moves")} AS moves, ${EXTRACT("$.loss")} AS loss,
      ${EXTRACT("$.byPhase.opening[0]")} AS o_m, ${EXTRACT("$.byPhase.opening[1]")} AS o_s,
      ${EXTRACT("$.byPhase.middlegame[0]")} AS m_m, ${EXTRACT("$.byPhase.middlegame[1]")} AS m_s,
      ${EXTRACT("$.byPhase.endgame[0]")} AS e_m, ${EXTRACT("$.byPhase.endgame[1]")} AS e_s,
      ${EXTRACT("$.decisivePly")} AS dec, ${EXTRACT("$.sustainedAdv")} AS adv, ${EXTRACT("$.sustainedDis")} AS dis
    FROM matches m JOIN match_details md ON md.match_id = m.match_id
    ${userId ? "WHERE m.user_id = ?" : ""}
    ORDER BY COALESCE(m.played_at, 0) ASC, m.rowid ASC
  `;
  const rows = (await (userId ? db.prepare(q).bind(userId) : db.prepare(q)).all<ProfileRow>()).results ?? [];

  const games: Game[] = []; // oldest first
  let pending = 0, invalid = 0, unknownVersion = 0, bots = 0;
  for (const r of rows) {
    if ((r.opponent_type ?? "").toLowerCase() === "bot") bots++;
    const read = summaryOf(r);
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
