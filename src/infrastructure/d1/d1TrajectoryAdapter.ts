import type { D1Database } from "@cloudflare/workers-types";
import type { TrajectoryPort } from "../../ports/trajectoryPort.ts";
import type {
  ChessTrajectoryInput,
  LanguagesTrajectoryInput,
} from "../../domain/trajectory.ts";
import { resolveUserIdWithD1 } from "./userIdResolution.ts";

export function createD1TrajectoryAdapter(db: D1Database): TrajectoryPort {
  return {
    async resolveUserId(explicitUserId?: string | null): Promise<string | null> {
      return resolveUserIdWithD1(db, explicitUserId);
    },

    async getChessTrajectoryData(userId: string): Promise<ChessTrajectoryInput> {
      // 1. Find min and max played_at and active days
      const spanRow = await db
        .prepare(`
          SELECT 
            MIN(played_at) as first_played_at,
            MAX(played_at) as last_played_at,
            COUNT(DISTINCT DATE(played_at, 'unixepoch')) as active_days,
            COUNT(*) as total_games
          FROM matches
          WHERE user_id = ?
            AND user_color IN ('white', 'black')
            AND played_at IS NOT NULL
        `)
        .bind(userId)
        .first<{
          first_played_at: number | null;
          last_played_at: number | null;
          active_days: number;
          total_games: number;
        }>();

      if (
        !spanRow ||
        spanRow.first_played_at === null ||
        spanRow.last_played_at === null ||
        !spanRow.total_games ||
        spanRow.total_games === 0
      ) {
        return {
          startedAt: null,
          endedAt: null,
          totalGames: 0,
          activeDays: 0,
          whiteGames: 0,
          whiteWins: 0,
          blackGames: 0,
          blackWins: 0,
          h1: { whiteGames: 0, whiteWins: 0, blackGames: 0, blackWins: 0 },
          h2: { whiteGames: 0, whiteWins: 0, blackGames: 0, blackWins: 0 },
        };
      }

      const tStartSec = spanRow.first_played_at;
      const tEndSec = spanRow.last_played_at;
      const tMidSec = Math.floor(tStartSec + (tEndSec - tStartSec) / 2);

      // 2. Global, H1 [tStartSec, tMidSec), H2 [tMidSec, tEndSec]
      const [globalRow, h1Row, h2Row] = await Promise.all([
        db
          .prepare(`
            SELECT 
              SUM(CASE WHEN user_color = 'white' THEN 1 ELSE 0 END) as white_games,
              SUM(CASE WHEN user_color = 'white' AND result = 'win' THEN 1 ELSE 0 END) as white_wins,
              SUM(CASE WHEN user_color = 'black' THEN 1 ELSE 0 END) as black_games,
              SUM(CASE WHEN user_color = 'black' AND result = 'win' THEN 1 ELSE 0 END) as black_wins
            FROM matches
            WHERE user_id = ?
              AND user_color IN ('white', 'black')
              AND played_at IS NOT NULL
          `)
          .bind(userId)
          .first<{
            white_games: number | null;
            white_wins: number | null;
            black_games: number | null;
            black_wins: number | null;
          }>(),
        db
          .prepare(`
            SELECT 
              SUM(CASE WHEN user_color = 'white' THEN 1 ELSE 0 END) as white_games,
              SUM(CASE WHEN user_color = 'white' AND result = 'win' THEN 1 ELSE 0 END) as white_wins,
              SUM(CASE WHEN user_color = 'black' THEN 1 ELSE 0 END) as black_games,
              SUM(CASE WHEN user_color = 'black' AND result = 'win' THEN 1 ELSE 0 END) as black_wins
            FROM matches
            WHERE user_id = ?
              AND user_color IN ('white', 'black')
              AND played_at >= ? AND played_at < ?
          `)
          .bind(userId, tStartSec, tMidSec)
          .first<{
            white_games: number | null;
            white_wins: number | null;
            black_games: number | null;
            black_wins: number | null;
          }>(),
        db
          .prepare(`
            SELECT 
              SUM(CASE WHEN user_color = 'white' THEN 1 ELSE 0 END) as white_games,
              SUM(CASE WHEN user_color = 'white' AND result = 'win' THEN 1 ELSE 0 END) as white_wins,
              SUM(CASE WHEN user_color = 'black' THEN 1 ELSE 0 END) as black_games,
              SUM(CASE WHEN user_color = 'black' AND result = 'win' THEN 1 ELSE 0 END) as black_wins
            FROM matches
            WHERE user_id = ?
              AND user_color IN ('white', 'black')
              AND played_at >= ? AND played_at <= ?
          `)
          .bind(userId, tMidSec, tEndSec)
          .first<{
            white_games: number | null;
            white_wins: number | null;
            black_games: number | null;
            black_wins: number | null;
          }>(),
      ]);

      return {
        startedAt: new Date(tStartSec * 1000).toISOString(),
        endedAt: new Date(tEndSec * 1000).toISOString(),
        totalGames: Number(spanRow.total_games ?? 0),
        activeDays: Number(spanRow.active_days ?? 0),
        whiteGames: Number(globalRow?.white_games ?? 0),
        whiteWins: Number(globalRow?.white_wins ?? 0),
        blackGames: Number(globalRow?.black_games ?? 0),
        blackWins: Number(globalRow?.black_wins ?? 0),
        h1: {
          whiteGames: Number(h1Row?.white_games ?? 0),
          whiteWins: Number(h1Row?.white_wins ?? 0),
          blackGames: Number(h1Row?.black_games ?? 0),
          blackWins: Number(h1Row?.black_wins ?? 0),
        },
        h2: {
          whiteGames: Number(h2Row?.white_games ?? 0),
          whiteWins: Number(h2Row?.white_wins ?? 0),
          blackGames: Number(h2Row?.black_games ?? 0),
          blackWins: Number(h2Row?.black_wins ?? 0),
        },
      };
    },

    async getLanguagesTrajectoryData(userId: string): Promise<LanguagesTrajectoryInput> {
      // Per-course XP exists only in snapshots (xp_summaries has no course dimension), so the
      // snapshot span is the observed history: eras and active days are anchored to it.
      const snapSpan = await db
        .prepare(`
          SELECT MIN(created_at) as first_snap, MAX(created_at) as last_snap
          FROM snapshots
          WHERE source = 'duolingo-lang' AND user_id = ?
        `)
        .bind(userId)
        .first<{ first_snap: string | null; last_snap: string | null }>();

      if (!snapSpan?.first_snap || !snapSpan.last_snap) {
        return {
          startedAt: null,
          endedAt: null,
          activeDays: 0,
          h1: { courses: [] },
          h2: { courses: [] },
        };
      }

      const startMs = new Date(snapSpan.first_snap).getTime();
      const endMs = new Date(snapSpan.last_snap).getTime();
      const midMs = Math.floor(startMs + (endMs - startMs) / 2);

      const startedAt = new Date(startMs).toISOString();
      const endedAt = new Date(endMs).toISOString();
      const midAt = new Date(midMs).toISOString();

      const xpDays = await db
        .prepare(`
          SELECT COUNT(DISTINCT date) as active_days
          FROM xp_summaries
          WHERE user_id = ? AND gained_xp > 0 AND date >= ? AND date <= ?
        `)
        .bind(userId, Math.floor(startMs / 86_400_000) * 86_400, Math.floor(endMs / 1000))
        .first<{ active_days: number }>();
      const activeDays = Number(xpDays?.active_days ?? 0);

      // 2. Fetch boundary snapshots: start, mid, end
      const [startSnap, midSnap, endSnap] = await Promise.all([
        db
          .prepare(`
            SELECT raw_json FROM snapshots
            WHERE source = 'duolingo-lang' AND user_id = ?
            ORDER BY created_at ASC
            LIMIT 1
          `)
          .bind(userId)
          .first<{ raw_json: string }>(),
        db
          .prepare(`
            SELECT raw_json FROM snapshots
            WHERE source = 'duolingo-lang' AND user_id = ? AND created_at <= ?
            ORDER BY created_at DESC
            LIMIT 1
          `)
          .bind(userId, midAt)
          .first<{ raw_json: string }>(),
        db
          .prepare(`
            SELECT raw_json FROM snapshots
            WHERE source = 'duolingo-lang' AND user_id = ? AND created_at <= ?
            ORDER BY created_at DESC
            LIMIT 1
          `)
          .bind(userId, endedAt)
          .first<{ raw_json: string }>(),
      ]);

      function parseCourses(rawJson?: string | null): Map<string, number> {
        const map = new Map<string, number>();
        if (!rawJson) return map;
        try {
          const parsed = JSON.parse(rawJson);
          const rawCourses = Array.isArray(parsed?.courses)
            ? parsed.courses
            : Array.isArray(parsed?.user?.courses)
            ? parsed.user.courses
            : [];
          for (const c of rawCourses) {
            const id = c.id ?? c.courseId;
            const xp = Number(c.xp ?? 0);
            if (
              typeof id === "string" &&
              !isNaN(xp) &&
              (c.subject === "language" || c.learningLanguage || id.startsWith("DUOLINGO_"))
            ) {
              map.set(id, xp);
            }
          }
        } catch {
          // ignore parse error
        }
        return map;
      }

      const startCourses = parseCourses(startSnap?.raw_json);
      const midCourses = parseCourses(midSnap?.raw_json ?? startSnap?.raw_json);
      const endCourses = parseCourses(endSnap?.raw_json ?? midSnap?.raw_json);

      // Compute H1 course gains: mid - start
      const allCourseIds = new Set<string>([
        ...startCourses.keys(),
        ...midCourses.keys(),
        ...endCourses.keys(),
      ]);

      const h1Courses: Array<{ courseId: string; xp: number }> = [];
      const h2Courses: Array<{ courseId: string; xp: number }> = [];

      for (const id of allCourseIds) {
        const startXp = startCourses.get(id) ?? 0;
        const midXp = midCourses.get(id) ?? startXp;
        const endXp = endCourses.get(id) ?? midXp;

        const h1Gain = Math.max(0, midXp - startXp);
        const h2Gain = Math.max(0, endXp - midXp);

        if (h1Gain > 0) h1Courses.push({ courseId: id, xp: h1Gain });
        if (h2Gain > 0) h2Courses.push({ courseId: id, xp: h2Gain });
      }

      return {
        startedAt,
        endedAt,
        activeDays,
        h1: { courses: h1Courses },
        h2: { courses: h2Courses },
      };
    },
  };
}
