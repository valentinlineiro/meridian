import { json } from "./import.ts";
import { eloStats, summarize, resultOf, streaks } from "../analytics/stats.ts";
import { summarizeLang } from "../analytics/lang.ts";
import { buildCourseProgressHistory } from "../analytics/courseHistory.ts";
import { classifyOpponentSegment, OPPONENT_SEGMENT_LABELS, type OpponentSegment } from "../analytics/opponent.ts";
import { WHITE_OPENINGS, BLACK_OPENINGS } from "../analytics/openings.ts";
import { median } from "../analytics/median.ts";
import { PHASE_META, type PhaseKey } from "../analytics/phases.ts";

export interface OpeningStat {
  key: string;
  name: string;
  notation: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  unknown: number;
  decided: number;
  winRate: number | null;
  scoreRate: number | null;
}

export interface PhaseStat {
  key: PhaseKey;
  label: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  unknown: number;
  decided: number;
  winRate: number | null;
  scoreRate: number | null;
}

async function allMatches(db: D1Database, userId: string | null) {
  const q = userId
    ? "SELECT * FROM matches WHERE user_id=? ORDER BY COALESCE(played_at, 0) ASC, rowid ASC"
    : "SELECT * FROM matches ORDER BY COALESCE(played_at, 0) ASC, rowid ASC";
  const stmt = userId ? db.prepare(q).bind(userId) : db.prepare(q);
  return (await stmt.all<any>()).results ?? [];
}

async function getMatchPopulation(db: D1Database, userId: string | null): Promise<{ hydrated: number; totalMatches: number }> {
  const totalMatchesStmt = userId
    ? db.prepare("SELECT COUNT(*) as c FROM matches WHERE user_id = ?").bind(userId)
    : db.prepare("SELECT COUNT(*) as c FROM matches");
  const totalMatches = (await totalMatchesStmt.first<{ c: number }>())?.c ?? 0;

  const hydratedStmt = userId
    ? db.prepare("SELECT COUNT(*) as c FROM match_details WHERE user_id = ?").bind(userId)
    : db.prepare("SELECT COUNT(*) as c FROM match_details");
  const hydrated = (await hydratedStmt.first<{ c: number }>())?.c ?? 0;

  return { hydrated, totalMatches };
}

// Groups rows by `key` and tallies each group with `summarize`, the one result classifier and denominator shared by every route.
function summarizeBy<T extends { result: unknown; outcome: unknown }>(rows: T[], key: (r: T) => string) {
  const groups = new Map<string, T[]>();
  for (const r of rows) { const k = key(r); (groups.get(k) ?? groups.set(k, []).get(k)!).push(r); }
  return [...groups.entries()].map(([k, v]) => ({ k, rows: v, ...summarize(v as any) }));
}

const num = (v: unknown) => (typeof v === "number" ? v : v == null ? null : Number(v));

export async function handleStats(db: D1Database, kind: string, url: URL): Promise<Response> {
  const userId = url.searchParams.get("userId");
  if (kind === "lang") return handleLangStats(db, url);
  if (kind === "openings") return handleStatsOpenings(db, url);
  if (kind === "phases") return handleStatsPhases(db, url);

  const rows = await allMatches(db, userId);
  const sum = summarize(rows as any);
  const elos = rows.map((r) => num(r.opponent_elo));
  const elo = eloStats(elos);
  const by = (pred: (r: any) => boolean) => rows.filter(pred);
  const grp = (key: (r: any) => string) => {
    const m = new Map<string, any[]>();
    for (const r of rows) { const k = key(r); if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); }
    return [...m.entries()].map(([k, v]) => ({ key: k, ...summarize(v as any) }));
  };
  const res = rows.map((r) => resultOf(r as any));
  const st = streaks(res);

  switch (kind) {
    case "recent": {
      const raw = Number(url.searchParams.get("limit") ?? 50);
      const n = Math.min(Math.max(Number.isFinite(raw) ? raw : 50, 1), 200);
      const slice = rows.slice(-n);
      const s = summarize(slice as any);
      // The games before the window: the baseline the window is compared with. It never overlaps the window.
      const before = summarize(rows.slice(0, rows.length - slice.length) as any);
      const m = new Map<string, any[]>();
      for (const r of slice) { const k = String((r as any).user_color ?? "unknown").toLowerCase(); if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); }
      const colorGroups = [...m.entries()].map(([k, v]) => ({ key: k, ...summarize(v as any) }));
      return json({ limit: n, games: s.games, wins: s.wins, losses: s.losses, draws: s.draws, unknown: s.unknown, decided: s.decided, winRate: s.winRate, scoreRate: s.scoreRate, colorGroups, before });
    }
    case "summary": {
      const snapStmt = userId
        ? db.prepare("SELECT json_extract(raw_json, '$.eloRating') as elo FROM snapshots WHERE user_id=? AND json_extract(raw_json, '$.eloRating') IS NOT NULL ORDER BY created_at ASC").bind(userId)
        : db.prepare("SELECT json_extract(raw_json, '$.eloRating') as elo FROM snapshots WHERE json_extract(raw_json, '$.eloRating') IS NOT NULL ORDER BY created_at ASC");
      const eloRows = (await snapStmt.all<any>()).results ?? [];
      const firstElo = eloRows.length > 0 ? num(eloRows[0].elo) : null;
      const latestElo = eloRows.length > 0 ? num(eloRows[eloRows.length - 1].elo) : null;

      const bots = by((r) => (r.opponent_type ?? "").toLowerCase().includes("bot") || r.opponent_elo == null && (r.opponent_type ?? "") === "").length;
      // Bots = explicit bot type OR null-elo non-pvp; PvP = rest. Keep simple: opponent_type==='bot' (case-insens) OR (null elo and no pvp marker) is ambiguous -> count explicit.
      const explicitBots = by((r) => String(r.opponent_type ?? "").toLowerCase() === "bot").length;
      const pvp = rows.length - explicitBots;
      const reviewed = by((r) => r.reviewed === 1).length;
      return json({ games: sum.games, wins: sum.wins, losses: sum.losses, draws: sum.draws, winRate: sum.winRate, scoreRate: sum.scoreRate,
        currentElo: latestElo, firstElo, latestElo, bots: explicitBots || bots, pvp, reviewed,
        knownOpponentElo: elo.count, opponentEloMin: elo.min, opponentEloMax: elo.max, opponentEloAvg: elo.avg,
        currentStreak: st.currentStreak, currentStreakKind: st.currentKind, longestWin: st.longestWin, longestLoss: st.longestLoss });
    }
    case "results": {
      const ecRows = (await db.prepare(`
        SELECT 
          COALESCE(md.end_condition, 'unknown') as end_condition,
          m.result,
          COUNT(*) as count
        FROM matches m
        LEFT JOIN match_details md ON m.match_id = md.match_id
        ${userId ? "WHERE m.user_id = ?" : ""}
        GROUP BY 1, 2
      `).bind(...(userId ? [userId] : [])).all<any>()).results ?? [];

      const endConditions: Record<string, { total: number; win: number; loss: number; draw: number }> = {};

      for (const row of ecRows) {
        const ec = String(row.end_condition);
        if (!endConditions[ec]) {
          endConditions[ec] = { total: 0, win: 0, loss: 0, draw: 0 };
        }
        const cnt = Number(row.count);
        endConditions[ec].total += cnt;
        const resKey = resultOf({ result: row.result });
        if (resKey === "win") endConditions[ec].win += cnt;
        else if (resKey === "loss") endConditions[ec].loss += cnt;
        else if (resKey === "draw") endConditions[ec].draw += cnt;
      }

      return json({
        ...sum,
        percentages: {
          win: sum.decided ? sum.wins / sum.decided : null,
          loss: sum.decided ? sum.losses / sum.decided : null,
          draw: sum.decided ? sum.draws / sum.decided : null,
        },
        endConditions,
      });
    }
    case "color": return json({ groups: grp((r) => String(r.user_color ?? "unknown").toLowerCase()) });
    case "opponents": {
      const q = `
        SELECT 
          m.result,
          m.outcome,
          m.opponent_type,
          md.opponent_id
        FROM matches m
        LEFT JOIN match_details md ON m.match_id = md.match_id
        ${userId ? "WHERE m.user_id = ?" : ""}
      `;
      const stmt = userId ? db.prepare(q).bind(userId) : db.prepare(q);
      const oppRows = (await stmt.all<any>()).results ?? [];

      const segMap = new Map<OpponentSegment, any[]>();
      for (const r of oppRows) {
        const seg = classifyOpponentSegment(r.opponent_id, r.opponent_type);
        if (!segMap.has(seg)) segMap.set(seg, []);
        segMap.get(seg)!.push(r);
      }
      const segments = [...segMap.entries()]
        .map(([k, v]) => ({
          key: k,
          label: OPPONENT_SEGMENT_LABELS[k] ?? k,
          ...summarize(v),
        }))
        .sort((a, b) => b.games - a.games || a.key.localeCompare(b.key));

      const macroMap = new Map<string, any[]>();
      for (const r of oppRows) {
        const seg = classifyOpponentSegment(r.opponent_id, r.opponent_type);
        const k = seg === "pvp" ? "pvp" : "bot";
        if (!macroMap.has(k)) macroMap.set(k, []);
        macroMap.get(k)!.push(r);
      }
      const macroLabels: Record<string, string> = {
        bot: "Bots",
        pvp: "PvP",
      };
      const macro = [...macroMap.entries()]
        .map(([k, v]) => ({
          key: k,
          label: macroLabels[k] ?? k,
          ...summarize(v),
        }))
        .sort((a, b) => b.games - a.games || a.key.localeCompare(b.key));

      return json({ segments, macro, groups: macro });
    }
    case "opponent-elo": return json({ count: elo.count, min: elo.min, max: elo.max, average: elo.avg, median: elo.median, buckets: elo.buckets, note: `${elo.count} / ${rows.length} matches have known opponent ELO` });
    case "timeline": {
      const snapStmt = userId
        ? db.prepare("SELECT id, created_at, json_extract(raw_json, '$.eloRating') as elo FROM snapshots WHERE user_id=? ORDER BY created_at ASC").bind(userId)
        : db.prepare("SELECT id, created_at, json_extract(raw_json, '$.eloRating') as elo FROM snapshots ORDER BY created_at ASC");
      const snaps = ((await snapStmt.all<any>()).results ?? []).map((s) => ({ id: s.id, createdAt: s.created_at, elo: num(s.elo) }));
      return json({ snapshots: snaps, note: "ELO is snapshot-observed (page/snapshot level), not verified per-match ELO." });
    }
    case "lang": return handleLangStats(db, url);
    default: return json({ ok: false, error: "unknown stats kind" }, 404);
  }
}

export async function handleStatsOpenings(db: D1Database, url: URL): Promise<Response> {
  const userId = url.searchParams.get("userId");
  const population = await getMatchPopulation(db, userId);

  const q = `
    SELECT md.opening_key, m.user_color, m.result, m.outcome
    FROM matches m
    JOIN match_details md ON m.match_id = md.match_id
    WHERE md.opening_key IS NOT NULL
    ${userId ? "AND m.user_id = ?" : ""}
  `;
  const stmt = userId ? db.prepare(q).bind(userId) : db.prepare(q);
  const raw = ((await stmt.all<any>()).results ?? []) as any[];
  const rows = summarizeBy(raw, (r) => `${r.opening_key}\u0000${r.user_color ?? ""}`)
    .map((g) => ({ ...g, opening_key: g.rows[0].opening_key, user_color: g.rows[0].user_color }))
    .sort((a, b) => b.games - a.games);

  const white: OpeningStat[] = [];
  const black: OpeningStat[] = [];

  for (const r of rows) {
    const color = String(r.user_color ?? "").toLowerCase();
    const key = String(r.opening_key);
    const { games, wins, losses, draws, unknown, decided, winRate, scoreRate } = r;

    let name = "Sin datos";
    let notation = "-";

    if (color === "white") {
      const match = WHITE_OPENINGS[key];
      if (match) {
        name = match.name;
        notation = match.notation;
      } else if (key === "other_white" || key.startsWith("other")) {
        name = "Otras secuencias con Blancas";
        notation = "-";
      } else if (key === "unclassified") {
        name = "Sin datos";
        notation = "-";
      } else {
        name = key;
        notation = "-";
      }
      white.push({ key, name, notation, games, wins, losses, draws, unknown, decided, winRate, scoreRate });
    } else if (color === "black") {
      const match = BLACK_OPENINGS[key];
      if (match) {
        name = match.name;
        notation = match.notation;
      } else if (key === "other_black" || key.startsWith("other")) {
        name = "Otras secuencias con Negras";
        notation = "-";
      } else if (key === "unclassified") {
        name = "Sin datos";
        notation = "-";
      } else {
        name = key;
        notation = "-";
      }
      black.push({ key, name, notation, games, wins, losses, draws, unknown, decided, winRate, scoreRate });
    }
  }

  white.sort((a, b) => b.games - a.games);
  black.sort((a, b) => b.games - a.games);

  return json({
    population,
    white,
    black,
  });
}

export async function handleStatsPhases(db: D1Database, url: URL): Promise<Response> {
  const userId = url.searchParams.get("userId");
  const population = await getMatchPopulation(db, userId);

  const q = `
    SELECT md.phase_key, m.result, m.outcome
    FROM matches m
    JOIN match_details md ON m.match_id = md.match_id
    WHERE md.phase_key IS NOT NULL
    ${userId ? "AND m.user_id = ?" : ""}
  `;
  const stmt = userId ? db.prepare(q).bind(userId) : db.prepare(q);
  const phaseRows = summarizeBy(((await stmt.all<any>()).results ?? []) as any[], (r) => String(r.phase_key));

  const pliesSql = `
    SELECT md.ply_count 
    FROM match_details md
    ${userId ? "JOIN matches m ON m.match_id = md.match_id WHERE md.ply_count IS NOT NULL AND m.user_id = ?" : "WHERE md.ply_count IS NOT NULL"}
    ORDER BY md.ply_count ASC;
  `;
  const pliesStmt = userId ? db.prepare(pliesSql).bind(userId) : db.prepare(pliesSql);
  const plyRows = ((await pliesStmt.all<any>()).results ?? []) as any[];
  const plies = plyRows.map((r) => Number(r.ply_count)).filter((p) => Number.isFinite(p));

  const medianPlies = median(plies);

  const CANONICAL_PHASES: PhaseKey[] = ["opening", "middlegame", "endgame", "unknown"];
  const phases: PhaseStat[] = phaseRows
    .map(({ k, rows: _rows, ...stat }) => {
      const key = k as PhaseKey;
      return { key, label: PHASE_META[key]?.label ?? key, ...stat };
    })
    .sort((a, b) => {
      const ai = CANONICAL_PHASES.indexOf(a.key);
      const bi = CANONICAL_PHASES.indexOf(b.key);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

  return json({
    population,
    phases,
    medianPlies,
  });
}

// How many past syncs to scan for other courses' last-known Path. Bounded: each row keeps levels only
// for its own active section (~100-200KB), so this stays well under D1's per-request budget.
const COURSE_HISTORY_LIMIT = 30;

export async function handleLangStats(db: D1Database, url: URL): Promise<Response> {
  const userId = url.searchParams.get("userId");
  const recent = ((await (userId
    ? db.prepare("SELECT raw_json, created_at FROM snapshots WHERE source='duolingo-lang' AND user_id=? ORDER BY created_at DESC LIMIT ?").bind(userId, COURSE_HISTORY_LIMIT)
    : db.prepare("SELECT raw_json, created_at FROM snapshots WHERE source='duolingo-lang' ORDER BY created_at DESC LIMIT ?").bind(COURSE_HISTORY_LIMIT)
  ).all<{ raw_json: string; created_at: string }>()).results ?? []);
  if (!recent.length) return json({ ok: false, error: "no lang snapshot" }, 404);
  const latest = recent[0]!;
  try {
    const data = JSON.parse(latest.raw_json);
    // Skip rows that fail to parse rather than failing the whole request; each is just one course's history.
    const courseHistory = recent.flatMap((row) => {
      try { return [{ currentCourse: JSON.parse(row.raw_json)?.currentCourse, createdAt: row.created_at }]; }
      catch { return []; }
    });
    const historyRows = recent.map((r) => ({ rawJson: r.raw_json, createdAt: r.created_at }));
    let courseProgressHistory: ReturnType<typeof buildCourseProgressHistory> = [];
    try { courseProgressHistory = buildCourseProgressHistory(historyRows, (data as any)?.courses ?? (data as any)?.user?.courses ?? []); } catch { courseProgressHistory = []; }
    const stats = summarizeLang(data, courseHistory);
    return json({ createdAt: latest.created_at, ...stats, courseProgressHistory });
  } catch {
    return json({ ok: false, error: "invalid lang snapshot" }, 500);
  }
}

export async function handleMatches(db: D1Database, url: URL): Promise<Response> {
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const conds: string[] = []; const args: any[] = [];
  const eq = (col: string, v: string | null) => { if (v) { conds.push(`${col}=?`); args.push(v); } };
  eq("m.result", url.searchParams.get("result"));
  eq("m.user_color", url.searchParams.get("color"));
  eq("m.opponent_type", url.searchParams.get("opponentType"));
  eq("md.end_condition", url.searchParams.get("endCondition"));
  eq("md.opening_key", url.searchParams.get("opening"));
  eq("md.phase_key", url.searchParams.get("phase"));
  if (url.searchParams.get("reviewed") != null) { conds.push("m.reviewed=?"); args.push(Number(url.searchParams.get("reviewed"))); }
  if (url.searchParams.get("minOpponentElo") != null) { conds.push("m.opponent_elo>=?"); args.push(Number(url.searchParams.get("minOpponentElo"))); }
  if (url.searchParams.get("maxOpponentElo") != null) { conds.push("m.opponent_elo<=?"); args.push(Number(url.searchParams.get("maxOpponentElo"))); }
  if (url.searchParams.get("userId")) { conds.push("m.user_id=?"); args.push(url.searchParams.get("userId")); }
  const q = url.searchParams.get("q")?.trim();
  if (q) { conds.push("m.opponent_name LIKE '%'||?||'%'"); args.push(q); }
  const oppSegment = url.searchParams.get("opponentSegment");
  const where = conds.length ? "WHERE " + conds.join(" AND ") : "";

  if (oppSegment) {
    const candidateRows = ((await db.prepare(
      `SELECT 
         m.match_id, m.opponent_name, m.opponent_type, m.opponent_elo, m.user_color, m.result, m.outcome, m.reviewed, m.first_seen_at, m.played_at,
         md.end_condition, md.opponent_id, md.opening_key, md.phase_key, md.ply_count
       FROM matches m
       LEFT JOIN match_details md ON m.match_id = md.match_id
       ${where}
       ORDER BY COALESCE(m.played_at, 0) DESC, m.rowid DESC`
    ).bind(...args).all()).results ?? []) as any[];

    const matchedRows: any[] = [];
    for (const r of candidateRows) {
      const seg = classifyOpponentSegment(r.opponent_id, r.opponent_type);
      if (seg === oppSegment) {
        matchedRows.push({
          ...r,
          opponent_segment: seg,
        });
      }
    }

    const total = matchedRows.length;
    const rows = matchedRows.slice(offset, offset + limit);
    return json({ total, limit, offset, rows });
  }

  const total = (await db.prepare(`
    SELECT COUNT(*) c 
    FROM matches m 
    LEFT JOIN match_details md ON m.match_id = md.match_id 
    ${where}
  `).bind(...args).first<{ c: number }>())?.c ?? 0;

  const rawRows = ((await db.prepare(
    `SELECT 
       m.match_id, m.opponent_name, m.opponent_type, m.opponent_elo, m.user_color, m.result, m.outcome, m.reviewed, m.first_seen_at, m.played_at,
       md.end_condition, md.opponent_id, md.opening_key, md.phase_key, md.ply_count
     FROM matches m
     LEFT JOIN match_details md ON m.match_id = md.match_id
     ${where}
     ORDER BY COALESCE(m.played_at, 0) DESC, m.rowid DESC
     LIMIT ? OFFSET ?`
  ).bind(...args, limit, offset).all()).results ?? []) as any[];

  const rows = rawRows.map((r) => ({
    ...r,
    opponent_segment: classifyOpponentSegment(r.opponent_id, r.opponent_type),
  }));

  return json({ total, limit, offset, rows });
}


export async function handleSnapshots(db: D1Database, url: URL, id: string | null): Promise<Response> {
  if (id) {
    const s = await db.prepare("SELECT id,created_at,source,user_id,games_count,pages_count,checksum,size_bytes,raw_json FROM snapshots WHERE id=?").bind(id).first<any>();
    if (!s) return json({ ok: false, error: "not found" }, 404);
    if (url.searchParams.get("raw") === "1") return json(s);
    const { raw_json, ...meta } = s;
    return json({ ...meta, rawBytes: raw_json.length });
  }
  const rows = (await db.prepare("SELECT id,created_at,source,user_id,games_count,pages_count,checksum,size_bytes FROM snapshots ORDER BY created_at DESC LIMIT 100").all()).results ?? [];
  return json({ snapshots: rows });
}
