import { json } from "./import.ts";
import { eloStats, summarize, resultOf, streaks } from "../analytics/stats.ts";
import { newcombeDiff } from "../domain/proportion.ts";
import { summarizeLang } from "../analytics/lang.ts";
import { buildCourseProgressHistory } from "../analytics/courseHistory.ts";
import { classifyOpponentSegment, OPPONENT_SEGMENT_LABELS, type OpponentSegment } from "../analytics/opponent.ts";
import { OPENING_FAMILY_LABELS } from "../domain/openingFamily.ts";
import { MATE_TYPE_LABELS } from "../domain/mateType.ts";
import { readMateThreats, type MateThreatsOk, type ThreatPhase } from "../domain/mateThreats.ts";
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
  winRateCi: { lower: number; upper: number } | null;
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
  winRateCi: { lower: number; upper: number } | null;
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

type Row = Record<string, any>;

// Response bodies as pure functions of already-read rows: the individual routes and the bundle read differently but build the same body.
function recentBody(rows: Row[], n: number) {
  const slice = rows.slice(-n);
  const s = summarize(slice as any);
  // The games before the window: the baseline the window is compared with. It never overlaps the window.
  const before = summarize(rows.slice(0, rows.length - slice.length) as any);
  const m = new Map<string, any[]>();
  for (const r of slice) { const k = String(r.user_color ?? "unknown").toLowerCase(); if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); }
  const colorGroups = [...m.entries()].map(([k, v]) => ({ key: k, ...summarize(v as any) }));
  // window − before, as a fraction with its 95% interval (the groups are disjoint)
  const delta = newcombeDiff({ wins: s.wins, n: s.decided }, { wins: before.wins, n: before.decided });
  return { limit: n, delta, games: s.games, wins: s.wins, losses: s.losses, draws: s.draws, unknown: s.unknown, decided: s.decided, winRate: s.winRate, winRateCi: s.winRateCi, scoreRate: s.scoreRate, colorGroups, before };
}

// eloRows: snapshots with a non-null eloRating, oldest first.
function summaryBody(rows: Row[], eloRows: { elo: unknown }[]) {
  const sum = summarize(rows as any);
  const elo = eloStats(rows.map((r) => num(r.opponent_elo)));
  const st = streaks(rows.map((r) => resultOf(r as any)));
  const by = (pred: (r: any) => boolean) => rows.filter(pred);
  const firstElo = eloRows.length > 0 ? num(eloRows[0]!.elo) : null;
  const latestElo = eloRows.length > 0 ? num(eloRows[eloRows.length - 1]!.elo) : null;

  const bots = by((r) => (r.opponent_type ?? "").toLowerCase().includes("bot") || r.opponent_elo == null && (r.opponent_type ?? "") === "").length;
  // Bots = explicit bot type OR null-elo non-pvp; PvP = rest. Keep simple: opponent_type==='bot' (case-insens) OR (null elo and no pvp marker) is ambiguous -> count explicit.
  const explicitBots = by((r) => String(r.opponent_type ?? "").toLowerCase() === "bot").length;
  const pvp = rows.length - explicitBots;
  const reviewed = by((r) => r.reviewed === 1).length;
  return { games: sum.games, wins: sum.wins, losses: sum.losses, draws: sum.draws, winRate: sum.winRate, winRateCi: sum.winRateCi, scoreRate: sum.scoreRate,
    currentElo: latestElo, firstElo, latestElo, bots: explicitBots || bots, pvp, reviewed,
    knownOpponentElo: elo.count, opponentEloMin: elo.min, opponentEloMax: elo.max, opponentEloAvg: elo.avg,
    currentStreak: st.currentStreak, currentStreakKind: st.currentKind, longestWin: st.longestWin, longestLoss: st.longestLoss };
}

// ecRows: (end_condition, result) groups with their count, end_condition already COALESCEd to 'unknown'.
function resultsBody(rows: Row[], ecRows: { end_condition: unknown; result: unknown; count: unknown }[]) {
  const sum = summarize(rows as any);
  const endConditions: Record<string, { total: number; win: number; loss: number; draw: number }> = {};
  for (const row of ecRows) {
    const ec = String(row.end_condition);
    if (!endConditions[ec]) {
      endConditions[ec] = { total: 0, win: 0, loss: 0, draw: 0 };
    }
    const cnt = Number(row.count);
    endConditions[ec].total += cnt;
    const resKey = resultOf({ result: row.result as any });
    if (resKey === "win") endConditions[ec].win += cnt;
    else if (resKey === "loss") endConditions[ec].loss += cnt;
    else if (resKey === "draw") endConditions[ec].draw += cnt;
  }
  return {
    ...sum,
    percentages: {
      win: sum.decided ? sum.wins / sum.decided : null,
      loss: sum.decided ? sum.losses / sum.decided : null,
      draw: sum.decided ? sum.draws / sum.decided : null,
    },
    endConditions,
  };
}

function colorBody(rows: Row[]) {
  const groups = summarizeBy(rows as any, (r: any) => String(r.user_color ?? "unknown").toLowerCase()).map(({ k, rows: _rows, ...g }) => ({ key: k, ...g }));
  const wh = groups.find((g) => g.key === "white"), bl = groups.find((g) => g.key === "black");
  // white − black, a fraction with its 95% interval; null unless both colours have decided games
  const difference = wh && bl ? newcombeDiff({ wins: wh.wins, n: wh.decided }, { wins: bl.wins, n: bl.decided }) : null;
  return { groups, difference };
}

function opponentsBody(oppRows: Row[]) {
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

  return { segments, macro, groups: macro };
}

function opponentEloBody(rows: Row[]) {
  const elo = eloStats(rows.map((r) => num(r.opponent_elo)));
  return { count: elo.count, min: elo.min, max: elo.max, average: elo.avg, median: elo.median, buckets: elo.buckets, note: `${elo.count} / ${rows.length} matches have known opponent ELO` };
}

function timelineBody(snaps: { id: unknown; created_at: unknown; elo: unknown }[]) {
  return { snapshots: snaps.map((s) => ({ id: s.id, createdAt: s.created_at, elo: num(s.elo) })), note: "ELO is snapshot-observed (page/snapshot level), not verified per-match ELO." };
}

const SNAPSHOT_ELO_SQL = "SELECT id, created_at, json_extract(raw_json, '$.eloRating') as elo FROM snapshots";

async function snapshotElos(db: D1Database, userId: string | null): Promise<{ id: unknown; created_at: unknown; elo: unknown }[]> {
  const stmt = userId
    ? db.prepare(`${SNAPSHOT_ELO_SQL} WHERE user_id=? ORDER BY created_at ASC`).bind(userId)
    : db.prepare(`${SNAPSHOT_ELO_SQL} ORDER BY created_at ASC`);
  return (await stmt.all<any>()).results ?? [];
}

const withElo = (snaps: { elo: unknown }[]) => snaps.filter((s) => s.elo != null);

export async function handleStats(db: D1Database, kind: string, url: URL): Promise<Response> {
  const userId = url.searchParams.get("userId");
  if (kind === "lang") return handleLangStats(db, url);
  if (kind === "openings") return handleStatsOpenings(db, url);
  if (kind === "mates") return handleStatsMates(db, url);
  if (kind === "threats") return handleStatsThreats(db, url);
  if (kind === "phases") return handleStatsPhases(db, url);
  if (kind === "bundle") return handleStatsBundle(db, url);

  switch (kind) {
    case "recent": {
      const raw = Number(url.searchParams.get("limit") ?? 50);
      const n = Math.min(Math.max(Number.isFinite(raw) ? raw : 50, 1), 200);
      return json(recentBody(await allMatches(db, userId), n));
    }
    case "summary": {
      const rows = await allMatches(db, userId);
      const eloStmt = userId
        ? db.prepare("SELECT json_extract(raw_json, '$.eloRating') as elo FROM snapshots WHERE user_id=? AND json_extract(raw_json, '$.eloRating') IS NOT NULL ORDER BY created_at ASC").bind(userId)
        : db.prepare("SELECT json_extract(raw_json, '$.eloRating') as elo FROM snapshots WHERE json_extract(raw_json, '$.eloRating') IS NOT NULL ORDER BY created_at ASC");
      return json(summaryBody(rows, (await eloStmt.all<any>()).results ?? []));
    }
    case "results": {
      const rows = await allMatches(db, userId);
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
      return json(resultsBody(rows, ecRows));
    }
    case "color": return json(colorBody(await allMatches(db, userId)));
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
      return json(opponentsBody((await stmt.all<any>()).results ?? []));
    }
    case "opponent-elo": return json(opponentEloBody(await allMatches(db, userId)));
    case "timeline": return json(timelineBody(await snapshotElos(db, userId)));
    default: return json({ ok: false, error: "unknown stats kind" }, 404);
  }
}

// One read of matches (joined with match_details) and one of snapshots serve the seven bodies the dashboard opens with. Each key is
// byte-for-byte the body of the individual route (recent at its default limit of 50), which stays the reference.
export async function handleStatsBundle(db: D1Database, url: URL): Promise<Response> {
  const userId = url.searchParams.get("userId");
  const stmt = db.prepare(`
    SELECT m.result, m.outcome, m.opponent_elo, m.opponent_type, m.user_color, m.reviewed,
           md.end_condition, md.opponent_id
    FROM matches m
    LEFT JOIN match_details md ON md.match_id = m.match_id
    ${userId ? "WHERE m.user_id = ?" : ""}
    ORDER BY COALESCE(m.played_at, 0) ASC, m.rowid ASC
  `);
  const rows = ((await (userId ? stmt.bind(userId) : stmt).all<any>()).results ?? []) as Row[];
  const snaps = await snapshotElos(db, userId);

  // GROUP BY end_condition, result as SQLite returns it: sorted, NULL result first.
  const groups = new Map<string, { end_condition: string; result: string | null; count: number }>();
  for (const r of rows) {
    const end_condition = r.end_condition ?? "unknown", result = r.result ?? null;
    const k = JSON.stringify([end_condition, result]);
    const g = groups.get(k);
    if (g) g.count++; else groups.set(k, { end_condition, result, count: 1 });
  }
  const cmp = (a: string | null, b: string | null) => (a === b ? 0 : a === null ? -1 : b === null ? 1 : a < b ? -1 : 1);
  const ecRows = [...groups.values()].sort((a, b) => cmp(a.end_condition, b.end_condition) || cmp(a.result, b.result));

  return json({
    summary: summaryBody(rows, withElo(snaps)),
    results: resultsBody(rows, ecRows),
    color: colorBody(rows),
    opponents: opponentsBody(rows),
    opponentElo: opponentEloBody(rows),
    timeline: timelineBody(snaps),
    recent: recentBody(rows, 50),
  });
}

export async function handleStatsOpenings(db: D1Database, url: URL): Promise<Response> {
  const userId = url.searchParams.get("userId");
  const population = await getMatchPopulation(db, userId);

  const q = `
    SELECT md.opening_family, m.user_color, m.result, m.outcome
    FROM matches m
    JOIN match_details md ON m.match_id = md.match_id
    ${userId ? "WHERE m.user_id = ?" : ""}
  `;
  const stmt = userId ? db.prepare(q).bind(userId) : db.prepare(q);
  const all = ((await stmt.all<any>()).results ?? []) as any[];
  // Details saved before migration 0017 (or too short to tell) have no family: they are counted apart, never folded into "Otra apertura".
  const classified = all.filter((r) => r.opening_family && r.opening_family !== "unclassified");
  const unclassified = all.length - classified.length;

  const rows = summarizeBy(classified, (r) => `${r.opening_family}\u0000${r.user_color ?? ""}`)
    .map((g) => ({ ...g, opening_family: g.rows[0].opening_family, user_color: g.rows[0].user_color }))
    .sort((a, b) => b.games - a.games);

  const white: OpeningStat[] = [];
  const black: OpeningStat[] = [];
  for (const r of rows) {
    const { games, wins, losses, draws, unknown, decided, winRate, winRateCi, scoreRate } = r;
    const key = String(r.opening_family);
    const stat: OpeningStat = { key, name: OPENING_FAMILY_LABELS[key] ?? OPENING_FAMILY_LABELS.other!, notation: "-", games, wins, losses, draws, unknown, decided, winRate, winRateCi, scoreRate };
    const color = String(r.user_color ?? "").toLowerCase();
    if (color === "white") white.push(stat);
    else if (color === "black") black.push(stat);
  }

  return json({ population, white, black, unclassified });
}

// Mates the owner gave (wins by checkmate) and received (losses by checkmate), by type. A checkmate without a type is counted apart.
export async function handleStatsMates(db: D1Database, url: URL): Promise<Response> {
  const userId = url.searchParams.get("userId");
  const q = `
    SELECT md.mate_type, m.result
    FROM matches m
    JOIN match_details md ON m.match_id = md.match_id
    WHERE md.end_condition = 'checkmate' ${userId ? "AND m.user_id = ?" : ""}
  `;
  const stmt = userId ? db.prepare(q).bind(userId) : db.prepare(q);
  const rows = ((await stmt.all<{ mate_type: string | null; result: string | null }>()).results ?? []);

  const tally = (result: string) => {
    const counts = new Map<string, number>();
    for (const r of rows) if (r.mate_type && r.result === result) counts.set(r.mate_type, (counts.get(r.mate_type) ?? 0) + 1);
    return [...counts].map(([type, games]) => ({ type, label: MATE_TYPE_LABELS[type] ?? type, games })).sort((a, b) => b.games - a.games);
  };
  return json({ given: tally("win"), received: tally("loss"), unclassified: rows.filter((r) => !r.mate_type).length });
}

// How the owner meets mate-in-1 threats, from the results the scheduled analysis stored. Only well-formed `ok` results count; pending, invalid
// and unreadable ones are reported apart so the denominator is never silently shrunk. Rates are descriptive, with no interval:
// the threats of one game are not independent observations.
const RECENT_THREAT_GAMES = 100;
type ThreatTally = { faced: number; neutralized: number; missed: number; unpunished: number; rate: number | null };
const tallyOf = (neutralized: number, missed: number, unpunished: number): ThreatTally => {
  const faced = neutralized + missed + unpunished;
  return { faced, neutralized, missed, unpunished, rate: faced ? neutralized / faced : null };
};
const sumTally = (games: MateThreatsOk[]) => tallyOf(games.reduce((a, g) => a + g.neutralized, 0), games.reduce((a, g) => a + g.missed, 0), games.reduce((a, g) => a + g.unpunished, 0));

export async function handleStatsThreats(db: D1Database, url: URL): Promise<Response> {
  const userId = url.searchParams.get("userId");
  const q = `
    SELECT md.mate_threats FROM matches m JOIN match_details md ON md.match_id = m.match_id
    ${userId ? "WHERE m.user_id = ?" : ""}
    ORDER BY COALESCE(m.played_at, 0) DESC, m.rowid DESC
  `;
  const rows = ((await (userId ? db.prepare(q).bind(userId) : db.prepare(q)).all<{ mate_threats: string | null }>()).results ?? []);

  const games: MateThreatsOk[] = []; // newest first
  let pending = 0, invalid = 0, unknownVersion = 0;
  for (const r of rows) {
    const read = readMateThreats(r.mate_threats);
    if (read.state === "ok") games.push(read.value);
    else if (read.state === "pending") pending++;
    else if (read.state === "invalid") invalid++;
    else unknownVersion++;
  }
  const phase = (p: ThreatPhase) => tallyOf(
    games.reduce((a, g) => a + g.byPhase[p][0], 0), games.reduce((a, g) => a + g.byPhase[p][1], 0), games.reduce((a, g) => a + g.byPhase[p][2], 0));
  const recent = games.slice(0, RECENT_THREAT_GAMES), rest = games.slice(RECENT_THREAT_GAMES);
  return json({
    analysed: games.length, pending, invalid, unknownVersion,
    totals: sumTally(games),
    byPhase: { opening: phase("opening"), middlegame: phase("middlegame"), endgame: phase("endgame") },
    recent: { games: recent.length, ...sumTally(recent) },
    rest: { games: rest.length, ...sumTally(rest) },
    gamesWithMissed: games.filter((g) => g.missed > 0).length,
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

// The missed-threat count of a stored result; NULL unless it is a readable `ok` one (CASE keeps malformed JSON from ever reaching json_extract).
const MISSED_THREATS_SQL = `CASE WHEN json_valid(md.mate_threats) THEN CASE WHEN json_extract(md.mate_threats, '$.v') = 1 AND json_extract(md.mate_threats, '$.status') = 'ok' THEN json_extract(md.mate_threats, '$.missed') END END`;

const withLabels = (r: any) => ({
  ...r,
  opening_family_label: r.opening_family ? OPENING_FAMILY_LABELS[r.opening_family] ?? null : null,
  mate_type_label: r.mate_type ? MATE_TYPE_LABELS[r.mate_type] ?? null : null,
});

export async function handleMatches(db: D1Database, url: URL): Promise<Response> {
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const conds: string[] = []; const args: any[] = [];
  const eq = (col: string, v: string | null) => { if (v) { conds.push(`${col}=?`); args.push(v); } };
  eq("m.result", url.searchParams.get("result"));
  eq("m.user_color", url.searchParams.get("color"));
  eq("m.opponent_type", url.searchParams.get("opponentType"));
  eq("md.end_condition", url.searchParams.get("endCondition"));
  eq("md.opening_family", url.searchParams.get("opening"));
  eq("md.phase_key", url.searchParams.get("phase"));
  if (url.searchParams.get("reviewed") != null) { conds.push("m.reviewed=?"); args.push(Number(url.searchParams.get("reviewed"))); }
  if (url.searchParams.get("minOpponentElo") != null) { conds.push("m.opponent_elo>=?"); args.push(Number(url.searchParams.get("minOpponentElo"))); }
  if (url.searchParams.get("maxOpponentElo") != null) { conds.push("m.opponent_elo<=?"); args.push(Number(url.searchParams.get("maxOpponentElo"))); }
  if (url.searchParams.get("userId")) { conds.push("m.user_id=?"); args.push(url.searchParams.get("userId")); }
  const q = url.searchParams.get("q")?.trim();
  if (q) { conds.push("m.opponent_name LIKE '%'||?||'%'"); args.push(q); }
  if (url.searchParams.get("missedThreat") === "1") conds.push(`${MISSED_THREATS_SQL} > 0`);
  const oppSegment = url.searchParams.get("opponentSegment");
  const where = conds.length ? "WHERE " + conds.join(" AND ") : "";

  if (oppSegment) {
    const candidateRows = ((await db.prepare(
      `SELECT 
         m.match_id, m.opponent_name, m.opponent_type, m.opponent_elo, m.user_color, m.result, m.outcome, m.reviewed, m.first_seen_at, m.played_at,
         md.end_condition, md.opponent_id, md.opening_key, md.opening_family, md.mate_type, md.phase_key, md.ply_count,
         ${MISSED_THREATS_SQL} AS mate_threats_missed
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
          ...withLabels(r),
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
       md.end_condition, md.opponent_id, md.opening_key, md.opening_family, md.mate_type, md.phase_key, md.ply_count,
         ${MISSED_THREATS_SQL} AS mate_threats_missed
     FROM matches m
     LEFT JOIN match_details md ON m.match_id = md.match_id
     ${where}
     ORDER BY COALESCE(m.played_at, 0) DESC, m.rowid DESC
     LIMIT ? OFFSET ?`
  ).bind(...args, limit, offset).all()).results ?? []) as any[];

  const rows = rawRows.map((r) => ({
    ...withLabels(r),
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
