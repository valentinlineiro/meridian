import type { D1Database } from "@cloudflare/workers-types";
import type {
  WhatChangedPort,
  ChessPointInTime,
  ChessIntervalData,
  LanguagesPointInTime,
  LanguagesIntervalData,
} from "../../ports/whatChangedPort.ts";
import { summarize } from "../../domain/result.ts";

export function createD1WhatChangedAdapter(db: D1Database): WhatChangedPort {
  return {
    async resolveUserId(explicitUserId?: string | null): Promise<string | null> {
      if (explicitUserId) {
        const found = await db
          .prepare(`
            SELECT 1 FROM (
              SELECT id AS user_id FROM users WHERE id = ?
              UNION
              SELECT user_id FROM user_state WHERE user_id = ?
              UNION
              SELECT user_id FROM courses WHERE user_id = ?
              UNION
              SELECT user_id FROM matches WHERE user_id = ?
            ) LIMIT 1
          `)
          .bind(explicitUserId, explicitUserId, explicitUserId, explicitUserId)
          .first<{ 1: number }>()
          .then((r) => r !== null, () => false);

        return found ? explicitUserId : null;
      }
      // Resolve among data owners first (user_state / courses / matches), falling back to users
      const dataOwners = await db
        .prepare(`
          SELECT user_id FROM (
            SELECT user_id FROM user_state
            UNION SELECT user_id FROM courses
            UNION SELECT user_id FROM matches
          ) LIMIT 2
        `)
        .all<{ user_id: string }>()
        .then((r) => r.results ?? [], () => null);

      if (dataOwners === null) return null;
      if (dataOwners.length > 0) return dataOwners.length === 1 ? dataOwners[0]!.user_id : null;

      const userRows = await db
        .prepare("SELECT id AS user_id FROM users LIMIT 2")
        .all<{ user_id: string }>()
        .then((r) => r.results ?? [], () => []);
      return userRows.length === 1 ? userRows[0]!.user_id : null;
    },

    async getChessBaseline(
      userId: string,
      since: string
    ): Promise<{ data: ChessPointInTime | null; status: "exactOrPrevious" | "firstHistorical" | "unavailable" }> {
      const sinceSec = Math.floor(new Date(since).getTime() / 1000);

      // Latest match played on or before `since`
      const row = await db
        .prepare(`
          SELECT 
            COALESCE(md.elo_after, m.page_elo) as rating,
            m.played_at as observed_at
          FROM matches m
          LEFT JOIN match_details md ON md.match_id = m.match_id
          WHERE m.user_id = ?
            AND m.user_color IN ('white', 'black')
            AND m.played_at IS NOT NULL
            AND m.played_at <= ?
          ORDER BY m.played_at DESC
          LIMIT 1
        `)
        .bind(userId, sinceSec)
        .first<{ rating: number | null; observed_at: number }>();

      if (row && row.observed_at !== null) {
        // Lifetime tally up to that point, classified with the same rule as every other route.
        const prior = await db
          .prepare(`
            SELECT m.result, m.outcome
            FROM matches m
            WHERE m.user_id = ?
              AND m.user_color IN ('white', 'black')
              AND m.played_at IS NOT NULL
              AND m.played_at <= ?
          `)
          .bind(userId, sinceSec)
          .all<{ result: string | null; outcome: string | null }>();
        const lifetime = summarize(prior.results ?? []);

        return {
          status: "exactOrPrevious",
          data: {
            rating: row.rating,
            lifetimeGames: lifetime.games,
            lifetimeDecided: lifetime.decided,
            lifetimeWins: lifetime.wins,
            observedAt: new Date(row.observed_at * 1000).toISOString(),
          },
        };
      }

      // If no match <= since, check if earliest historical match exists
      const firstRow = await db
        .prepare(`
          SELECT 
            COALESCE(md.elo_after, m.page_elo) as rating,
            m.played_at as observed_at,
            m.result
          FROM matches m
          LEFT JOIN match_details md ON md.match_id = m.match_id
          WHERE m.user_id = ?
            AND m.user_color IN ('white', 'black')
            AND m.played_at IS NOT NULL
          ORDER BY m.played_at ASC
          LIMIT 1
        `)
        .bind(userId)
        .first<{ rating: number | null; observed_at: number; result: string | null }>();

      if (firstRow && firstRow.observed_at !== null) {
        return {
          status: "firstHistorical",
          data: {
            rating: firstRow.rating,
            lifetimeGames: 0,
            lifetimeDecided: 0,
            lifetimeWins: 0,
            observedAt: new Date(firstRow.observed_at * 1000).toISOString(),
          },
        };
      }

      return { status: "unavailable", data: null };
    },

    async getChessInterval(
      userId: string,
      since: string,
      until: string
    ): Promise<ChessIntervalData> {
      const sinceSec = Math.floor(new Date(since).getTime() / 1000);
      const untilSec = Math.floor(new Date(until).getTime() / 1000);

      const played = await db
        .prepare(`
          SELECT m.user_color, m.result, m.outcome
          FROM matches m
          WHERE m.user_id = ?
            AND m.user_color IN ('white', 'black')
            AND m.played_at IS NOT NULL
            AND m.played_at > ? AND m.played_at <= ?
        `)
        .bind(userId, sinceSec, untilSec)
        .all<{ user_color: string; result: string | null; outcome: string | null }>();
      const rows = played.results ?? [];
      const all = summarize(rows);
      const white = summarize(rows.filter((r) => r.user_color === "white"));
      const black = summarize(rows.filter((r) => r.user_color === "black"));

      const latest = await db
        .prepare(`
          SELECT 
            COALESCE(md.elo_after, m.page_elo) as rating
          FROM matches m
          LEFT JOIN match_details md ON md.match_id = m.match_id
          WHERE m.user_id = ?
            AND m.user_color IN ('white', 'black')
            AND m.played_at IS NOT NULL
            AND m.played_at > ? AND m.played_at <= ?
          ORDER BY m.played_at DESC
          LIMIT 1
        `)
        .bind(userId, sinceSec, untilSec)
        .first<{ rating: number | null }>();

      return {
        gamesCount: all.games,
        decidedCount: all.decided,
        wins: all.wins,
        whiteGames: white.games,
        whiteDecided: white.decided,
        whiteWins: white.wins,
        blackGames: black.games,
        blackDecided: black.decided,
        blackWins: black.wins,
        latestRating: latest?.rating ?? null,
      };
    },

    async getLanguagesBaseline(
      userId: string,
      since: string
    ): Promise<{ data: LanguagesPointInTime | null; status: "exactOrPrevious" | "firstHistorical" | "unavailable" }> {
      // 1. Language state from snapshots on or before `since`
      const snap = await db
        .prepare(`
          SELECT created_at, raw_json FROM snapshots
          WHERE source = 'duolingo-lang' AND is_auxiliary = 0 AND user_id = ? AND created_at <= ?
          ORDER BY created_at DESC
          LIMIT 1
        `)
        .bind(userId, since)
        .first<{ created_at: string; raw_json: string }>();

      if (snap) {
        try {
          const parsed = JSON.parse(snap.raw_json);
          return {
            status: "exactOrPrevious",
            data: {
              totalXp: parsed.user?.totalXp ?? null,
              activeCourseId: parsed.user?.currentCourseId ?? null, // currentCourse.id is the observed course, not the account's
              streak: parsed.user?.streak ?? null,
              observedAt: snap.created_at,
            },
          };
        } catch {
          // ignore parse error and proceed
        }
      }

      // 2. Fallback: earliest snapshot (firstHistorical)
      const firstSnap = await db
        .prepare(`
          SELECT created_at, raw_json FROM snapshots
          WHERE source = 'duolingo-lang' AND is_auxiliary = 0 AND user_id = ?
          ORDER BY created_at ASC
          LIMIT 1
        `)
        .bind(userId)
        .first<{ created_at: string; raw_json: string }>();

      if (firstSnap) {
        try {
          const parsed = JSON.parse(firstSnap.raw_json);
          return {
            status: "firstHistorical",
            data: {
              totalXp: parsed.user?.totalXp ?? null,
              activeCourseId: parsed.user?.currentCourseId ?? null, // currentCourse.id is the observed course, not the account's
              streak: parsed.user?.streak ?? null,
              observedAt: firstSnap.created_at,
            },
          };
        } catch {
          // ignore
        }
      }

      // 3. Fallback: user_state
      const state = await db
        .prepare(`
          SELECT total_xp, current_course_id, streak, updated_at
          FROM user_state
          WHERE user_id = ?
        `)
        .bind(userId)
        .first<{ total_xp: number; current_course_id: string; streak: number; updated_at: string }>();

      if (state) {
        return {
          status: state.updated_at <= since ? "exactOrPrevious" : "firstHistorical",
          data: {
            totalXp: state.total_xp,
            activeCourseId: state.current_course_id,
            streak: state.streak,
            observedAt: state.updated_at,
          },
        };
      }

      return { status: "unavailable", data: null };
    },

    async getLanguagesTarget(
      userId: string,
      until: string
    ): Promise<{ data: LanguagesPointInTime | null; status: "exactOrPrevious" | "unavailable" }> {
      // 1. Snapshot strictly on or before `until`
      const snap = await db
        .prepare(`
          SELECT created_at, raw_json FROM snapshots
          WHERE source = 'duolingo-lang' AND is_auxiliary = 0 AND user_id = ? AND created_at <= ?
          ORDER BY created_at DESC
          LIMIT 1
        `)
        .bind(userId, until)
        .first<{ created_at: string; raw_json: string }>();

      if (snap) {
        try {
          const parsed = JSON.parse(snap.raw_json);
          return {
            status: "exactOrPrevious",
            data: {
              totalXp: parsed.user?.totalXp ?? null,
              activeCourseId: parsed.user?.currentCourseId ?? null, // currentCourse.id is the observed course, not the account's
              streak: parsed.user?.streak ?? null,
              observedAt: snap.created_at,
            },
          };
        } catch {
          // ignore parse error and proceed
        }
      }

      // 2. Fallback: user_state strictly on or before `until`
      const state = await db
        .prepare(`
          SELECT total_xp, current_course_id, streak, updated_at
          FROM user_state
          WHERE user_id = ? AND updated_at <= ?
        `)
        .bind(userId, until)
        .first<{ total_xp: number; current_course_id: string; streak: number; updated_at: string }>();

      if (state) {
        return {
          status: "exactOrPrevious",
          data: {
            totalXp: state.total_xp,
            activeCourseId: state.current_course_id,
            streak: state.streak,
            observedAt: state.updated_at,
          },
        };
      }

      // Target NEVER falls back to future snapshots or firstHistorical
      return { status: "unavailable", data: null };
    },

    async getLanguagesInterval(
      userId: string,
      since: string,
      until: string
    ): Promise<LanguagesIntervalData> {
      // xp_summaries.date is stored as midnight UTC (YYYY-MM-DD 00:00:00 UTC) epoch seconds
      const sinceDate = since.slice(0, 10);
      const untilDate = until.slice(0, 10);
      const sinceDaySec = Math.floor(new Date(sinceDate + "T00:00:00Z").getTime() / 1000);
      const untilDaySec = Math.floor(new Date(untilDate + "T00:00:00Z").getTime() / 1000);

      // (since, until] semantics over calendar days:
      // Activity must have occurred on calendar days strictly after since's date and on or before until's date
      if (untilDaySec <= sinceDaySec) {
        return {
          xpGained: 0,
          sessionsCount: 0,
          totalSessionMinutes: 0,
          daysWithActivity: 0,
        };
      }

      const xpSum = await db
        .prepare(`
          SELECT 
            SUM(gained_xp) as xp_gained,
            SUM(num_sessions) as sessions_count,
            SUM(total_session_time) as total_time,
            COUNT(DISTINCT date) as days_with_activity
          FROM xp_summaries
          WHERE user_id = ? AND date > ? AND date <= ?
        `)
        .bind(userId, sinceDaySec, untilDaySec)
        .first<{
          xp_gained: number | null;
          sessions_count: number | null;
          total_time: number | null;
          days_with_activity: number;
        }>();

      return {
        xpGained: Number(xpSum?.xp_gained ?? 0),
        sessionsCount: Number(xpSum?.sessions_count ?? 0),
        totalSessionMinutes: Math.round(Number(xpSum?.total_time ?? 0) / 60),
        daysWithActivity: Number(xpSum?.days_with_activity ?? 0),
      };
    },

    async getHistoricalDailyXpRate(userId: string, before: string): Promise<number> {
      const beforeDate = before.slice(0, 10);
      const beforeDaySec = Math.floor(new Date(beforeDate + "T00:00:00Z").getTime() / 1000);
      const row = await db
        .prepare(`
          SELECT 
            SUM(gained_xp) as total_xp,
            COUNT(DISTINCT date) as days_count
          FROM xp_summaries
          WHERE user_id = ? AND date <= ?
        `)
        .bind(userId, beforeDaySec)
        .first<{ total_xp: number | null; days_count: number }>();

      if (!row || !row.days_count || row.days_count === 0) return 0;
      return (row.total_xp ?? 0) / Math.max(1, row.days_count);
    },
  };
}

