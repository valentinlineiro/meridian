import { json } from "./import.ts";
import { median } from "../analytics/median.ts";

// The player profile, from the per-game engine summaries the scheduled analysis stored. All of it is aggregated in SQL: parsing and summing
// every game's summary in the Worker would cost more CPU than its plan allows, so the Worker only receives a handful of small rows.
// Only well-formed `ok` results count; pending, invalid and unreadable ones are reported apart so no denominator is silently shrunk.
// Everything is descriptive: rates carry their move counts and no interval, because the errors of one game are not independent observations.
const BLOCK = 50;       // games per trend block
const REVIEW_MIN = 20;  // own moves a game needs to enter the review lists
const REVIEW_SIZE = 20;

// json_extract raises on malformed JSON, so one corrupt row would fail the whole read: extract only from valid JSON.
const X = (path: string) => `CASE WHEN json_valid(md.engine_eval) THEN json_extract(md.engine_eval, '${path}') END`;

// `c` has one row per game with its verdict in `state` (the same verdicts as readEngineEval: NULL is pending; broken JSON, an unknown
// version or contradictory figures are "unknown"). `serious` is the game's serious errors over the three phases.
const CTE = (where: string) => `
  WITH x AS (
    SELECT m.match_id, m.result, LOWER(TRIM(m.user_color)) AS color, LOWER(m.opponent_type) AS otype, m.opponent_name AS oname, m.played_at, COALESCE(m.played_at, 0) AS t, m.rowid AS rid,
      md.match_id IS NULL AS no_detail, md.end_condition AS ec, md.engine_eval IS NULL AS is_null, COALESCE(json_valid(md.engine_eval), 0) AS valid,
      ${X("$.v")} AS v, ${X("$.status")} AS status, ${X("$.reason")} AS reason, ${X("$.moves")} AS moves, ${X("$.loss")} AS loss,
      ${X("$.byPhase.opening[0]")} AS o_m, ${X("$.byPhase.opening[1]")} AS o_s,
      ${X("$.byPhase.middlegame[0]")} AS m_m, ${X("$.byPhase.middlegame[1]")} AS m_s,
      ${X("$.byPhase.endgame[0]")} AS e_m, ${X("$.byPhase.endgame[1]")} AS e_s,
      ${X("$.decisivePly")} AS dec, ${X("$.sustainedAdv")} AS adv, ${X("$.sustainedDis")} AS dis
    FROM matches m LEFT JOIN match_details md ON md.match_id = m.match_id ${where}
  ), c AS (
    SELECT x.*, o_s + m_s + e_s AS serious, CASE
      WHEN no_detail THEN 'no_detail'
      WHEN is_null THEN 'pending'
      WHEN NOT valid OR v IS NOT 1 THEN 'unknown'
      WHEN status = 'invalid' THEN CASE WHEN reason IN ('illegal_game', 'corrupt_game', 'engine_error') THEN 'invalid' ELSE 'unknown' END
      WHEN status = 'ok'
        AND typeof(moves) = 'integer' AND moves >= 0 AND typeof(loss) = 'integer' AND loss >= 0
        AND typeof(o_m) = 'integer' AND typeof(o_s) = 'integer' AND o_s BETWEEN 0 AND o_m
        AND typeof(m_m) = 'integer' AND typeof(m_s) = 'integer' AND m_s BETWEEN 0 AND m_m
        AND typeof(e_m) = 'integer' AND typeof(e_s) = 'integer' AND e_s BETWEEN 0 AND e_m
        AND o_m + m_m + e_m = moves
        AND (dec IS NULL OR (typeof(dec) = 'integer' AND dec >= 1))
        AND adv IN (0, 1) AND dis IN (0, 1)
      THEN 'ok' ELSE 'unknown' END AS state
    FROM x
  )`;

// P3: a loss by the owner's disconnection is where the game ended, not a moment the owner lost it. The decisive-moment figures keep every loss (`decisive`
// as before) and add the same figures for competitive losses (`competitive`) and the disconnections apart (`disconnection`); nothing is removed.
const DISC = "ec = 'disconnection'";
const rate = (serious: number, moves: number) => (moves ? (100 * serious) / moves : null);
const n = (v: unknown) => Number(v ?? 0);

// One section of the profile (all games, or before / after the cut), from a single aggregate row and the decisive moves of the lost games.
function section(r: Record<string, unknown>, decisiveMoves: number[], competitiveMoves: number[]) {
  const phase = (m: unknown, s: unknown) => ({ moves: n(m), serious: n(s), ratePer100: rate(n(s), n(m)) });
  const colour = (g: unknown, m: unknown, s: unknown) => ({ games: n(g), moves: n(m), serious: n(s), ratePer100: rate(n(s), n(m)) });
  const out = (g: unknown, w: unknown, d: unknown, l: unknown) => ({ games: n(g), win: n(w), draw: n(d), loss: n(l) });
  const serious = n(r.o_s) + n(r.m_s) + n(r.e_s), moves = n(r.moves);
  return {
    games: n(r.games), moves, serious, ratePer100: rate(serious, moves), acpl: moves ? n(r.loss) / moves : null,
    byPhase: { opening: phase(r.o_m, r.o_s), middlegame: phase(r.m_m, r.m_s), endgame: phase(r.e_m, r.e_s) },
    byColor: { white: colour(r.w_g, r.w_m, r.w_s), black: colour(r.b_g, r.b_m, r.b_s) },
    decisive: {
      lossGames: n(r.lost), withDecisive: n(r.with_dec), medianMove: decisiveMoves.length ? median(decisiveMoves) : null,
      byPhase: { opening: n(r.d_open), middlegame: n(r.d_mid), endgame: n(r.d_end) },
      competitive: {
        lossGames: n(r.lost) - n(r.disc_lost), withDecisive: n(r.with_dec) - n(r.disc_dec), medianMove: competitiveMoves.length ? median(competitiveMoves) : null,
        byPhase: { opening: n(r.d_open) - n(r.disc_open), middlegame: n(r.d_mid) - n(r.disc_mid), endgame: n(r.d_end) - n(r.disc_end) },
      },
      disconnection: { lossGames: n(r.disc_lost), withDecisive: n(r.disc_dec), byPhase: { opening: n(r.disc_open), middlegame: n(r.disc_mid), endgame: n(r.disc_end) } },
    },
    conversion: { advantage: out(r.adv_g, r.adv_w, r.adv_d, r.adv_l), disadvantage: out(r.dis_g, r.dis_w, r.dis_d, r.dis_l), thrown: n(r.adv_l) },
  };
}

const SECTION_SELECT = `
  SELECT COUNT(*) AS games, SUM(moves) AS moves, SUM(loss) AS loss,
    SUM(o_m) AS o_m, SUM(o_s) AS o_s, SUM(m_m) AS m_m, SUM(m_s) AS m_s, SUM(e_m) AS e_m, SUM(e_s) AS e_s,
    SUM(color = 'white') AS w_g, SUM(CASE WHEN color = 'white' THEN moves END) AS w_m, SUM(CASE WHEN color = 'white' THEN serious END) AS w_s,
    SUM(color = 'black') AS b_g, SUM(CASE WHEN color = 'black' THEN moves END) AS b_m, SUM(CASE WHEN color = 'black' THEN serious END) AS b_s,
    SUM(result = 'loss') AS lost, SUM(result = 'loss' AND dec IS NOT NULL) AS with_dec,
    SUM(result = 'loss' AND ${DISC}) AS disc_lost, SUM(result = 'loss' AND ${DISC} AND dec IS NOT NULL) AS disc_dec,
    SUM(result = 'loss' AND ${DISC} AND dec <= 20) AS disc_open, SUM(result = 'loss' AND ${DISC} AND dec > 20 AND dec <= 60) AS disc_mid, SUM(result = 'loss' AND ${DISC} AND dec > 60) AS disc_end,
    SUM(result = 'loss' AND dec <= 20) AS d_open, SUM(result = 'loss' AND dec > 20 AND dec <= 60) AS d_mid, SUM(result = 'loss' AND dec > 60) AS d_end,
    SUM(adv = 1) AS adv_g, SUM(adv = 1 AND result = 'win') AS adv_w, SUM(adv = 1 AND result = 'draw') AS adv_d, SUM(adv = 1 AND result = 'loss') AS adv_l,
    SUM(dis = 1) AS dis_g, SUM(dis = 1 AND result = 'win') AS dis_w, SUM(dis = 1 AND result = 'draw') AS dis_d, SUM(dis = 1 AND result = 'loss') AS dis_l
  FROM c WHERE state = 'ok'`;

export async function handleStatsProfile(db: D1Database, url: URL): Promise<Response> {
  const userId = url.searchParams.get("userId");
  const sinceId = url.searchParams.get("since");
  const where = userId ? "WHERE m.user_id = ?" : "";
  const base = userId ? [userId] : [];
  const run = async <T>(sql: string, ...extra: unknown[]) => (await db.prepare(CTE(where) + sql).bind(...base, ...extra).all<T>()).results ?? [];
  const sectionAt = async (cond: string, ...extra: unknown[]) => {
    const [rows, dec, comp] = await Promise.all([
      run<Record<string, unknown>>(SECTION_SELECT + cond, ...extra),
      run<{ mv: number }>(`SELECT (dec + 1) / 2 AS mv FROM c WHERE state = 'ok' AND result = 'loss' AND dec IS NOT NULL${cond}`, ...extra),
      run<{ mv: number }>(`SELECT (dec + 1) / 2 AS mv FROM c WHERE state = 'ok' AND result = 'loss' AND dec IS NOT NULL AND NOT COALESCE(${DISC}, 0)${cond}`, ...extra),
    ]);
    return section(rows[0] ?? {}, dec.map((d) => d.mv), comp.map((d) => d.mv));
  };

  // The cut belongs to "before". Games are totally ordered by (played_at, rowid) — the same order as the trend blocks — so games sharing the cut's timestamp fall on the side their position says; undated games are in neither side. An unknown or undated cut is reported as null, never as an error.
  let since: { matchId: string; playedAt: number } | null = null;
  let cutRid = 0;
  if (sinceId) {
    const cut = await db.prepare(`SELECT match_id, played_at, rowid AS rid FROM matches WHERE match_id = ? AND played_at IS NOT NULL${userId ? " AND user_id = ?" : ""}`)
      .bind(sinceId, ...base).first<{ match_id: string; played_at: number; rid: number }>();
    if (cut) { since = { matchId: cut.match_id, playedAt: cut.played_at }; cutRid = cut.rid; }
  }

  const reviewSql = (dir: "DESC" | "ASC") => `
    SELECT match_id AS matchId, result, oname AS opponent, played_at AS playedAt, color, moves, serious, loss * 1.0 / moves AS acpl, dec AS decisivePly
    FROM c WHERE state = 'ok' AND moves >= ${REVIEW_MIN} ORDER BY acpl ${dir}, match_id ASC LIMIT ${REVIEW_SIZE}`;
  // Independent reads, issued together: D1 does the scanning, so waiting on them costs the Worker no CPU.
  const [counts, all, before, after, blockRows, worst, best] = await Promise.all([
    run<Record<string, unknown>>(`SELECT COUNT(*) AS total, SUM(state = 'ok') AS ok, SUM(state = 'pending') AS pending, SUM(state = 'no_detail') AS no_detail, SUM(state = 'invalid') AS invalid,
      SUM(state = 'unknown') AS unknown_v, SUM(otype = 'bot') AS bots FROM c`).then((r) => r[0]),
    sectionAt(""),
    since ? sectionAt(" AND played_at IS NOT NULL AND (t < ? OR (t = ? AND rid <= ?))", since.playedAt, since.playedAt, cutRid) : null,
    since ? sectionAt(" AND played_at IS NOT NULL AND (t > ? OR (t = ? AND rid > ?))", since.playedAt, since.playedAt, cutRid) : null,
    run<Record<string, unknown>>(`
      SELECT (rn - 1) / ${BLOCK} AS b, COUNT(*) AS games, SUM(moves) AS moves, SUM(serious) AS serious, SUM(loss) AS loss
      FROM (SELECT moves, serious, loss, ROW_NUMBER() OVER (ORDER BY t, rid) AS rn FROM c WHERE state = 'ok') GROUP BY b ORDER BY b`),
    run(reviewSql("DESC")),
    run(reviewSql("ASC")),
  ]);
  const total = n(counts?.total), bots = n(counts?.bots);

  return json({
    analysed: n(counts?.ok), pending: n(counts?.pending), noDetail: n(counts?.no_detail), invalid: n(counts?.invalid), unknownVersion: n(counts?.unknown_v),
    bots: { games: bots, total, share: total ? bots / total : null },
    since,
    all, before, after,
    blocks: blockRows.map((b) => ({
      games: n(b.games), moves: n(b.moves), serious: n(b.serious), ratePer100: rate(n(b.serious), n(b.moves)), acpl: n(b.moves) ? n(b.loss) / n(b.moves) : null, partial: n(b.games) < BLOCK,
    })),
    review: { worst, best },
  });
}
