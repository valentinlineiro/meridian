import type { D1Database } from "@cloudflare/workers-types";
import type { TrajectoryPort } from "../../ports/trajectoryPort.ts";
import { summarize } from "../../domain/result.ts";
import type {
  ChessTrajectoryInput,
  ColorTally,
  LanguagesTrajectoryInput,
  NonComparableCourse,
} from "../../domain/trajectory.ts";
import { resolveUserIdWithD1 } from "./userIdResolution.ts";

const NO_GAMES: ColorTally = { whiteGames: 0, whiteDecided: 0, whiteWins: 0, blackGames: 0, blackDecided: 0, blackWins: 0 };

type PlayedRow = { played_at: number; user_color: string; result: string | null; outcome: string | null };

// Tally of one population, classified with the same rule as every other route.
function tally(rows: PlayedRow[]): ColorTally {
  const w = summarize(rows.filter((r) => r.user_color === "white"));
  const b = summarize(rows.filter((r) => r.user_color === "black"));
  return { whiteGames: w.games, whiteDecided: w.decided, whiteWins: w.wins, blackGames: b.games, blackDecided: b.decided, blackWins: b.wins };
}

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
          ...NO_GAMES,
          h1: NO_GAMES,
          h2: NO_GAMES,
        };
      }

      const tStartSec = spanRow.first_played_at;
      const tEndSec = spanRow.last_played_at;
      const tMidSec = Math.floor(tStartSec + (tEndSec - tStartSec) / 2);

      // 2. Global, H1 [tStartSec, tMidSec), H2 [tMidSec, tEndSec]
      const { results } = await db
        .prepare(`
          SELECT played_at, user_color, result, outcome
          FROM matches
          WHERE user_id = ?
            AND user_color IN ('white', 'black')
            AND played_at IS NOT NULL
        `)
        .bind(userId)
        .all<PlayedRow>();
      const rows = results ?? [];

      return {
        startedAt: new Date(tStartSec * 1000).toISOString(),
        endedAt: new Date(tEndSec * 1000).toISOString(),
        totalGames: Number(spanRow.total_games ?? 0),
        activeDays: Number(spanRow.active_days ?? 0),
        ...tally(rows),
        h1: tally(rows.filter((r) => r.played_at >= tStartSec && r.played_at < tMidSec)),
        h2: tally(rows.filter((r) => r.played_at >= tMidSec && r.played_at <= tEndSec)),
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

      // 2. Fetch boundary snapshots: start, mid, end. Auxiliary snapshots are NOT filtered (A6 §14.3): the catalog is complete in any
      // snapshot (observation-model §4) and a snapshot that does not carry a course says nothing about it (§14.2).
      // Reading the last few snapshots at each boundary (not just one) lets a course be found in its own last observation even when
      // the very last snapshot is an auxiliary one that does not carry it. The limit is a cost bound tied to the open source decision
      // (P2): if the course is in none of them it is `unknown`, never 0.
      const RECENT_PER_BOUNDARY = 3;
      type SnapRow = { id: string; created_at: string; raw_json: string };
      const recent = async (at: string) =>
        (await db
          .prepare(`SELECT id, created_at, raw_json FROM snapshots WHERE source = 'duolingo-lang' AND user_id = ? AND created_at <= ? ORDER BY created_at DESC LIMIT ${RECENT_PER_BOUNDARY}`)
          .bind(userId, at)
          .all<SnapRow>()).results ?? [];
      const [startSnap, midSnaps, endSnaps] = await Promise.all([
        db.prepare(`SELECT id, created_at, raw_json FROM snapshots WHERE source = 'duolingo-lang' AND user_id = ? ORDER BY created_at ASC LIMIT 1`).bind(userId).first<SnapRow>(),
        recent(midAt),
        recent(endedAt),
      ]);

      // Lifetime XP per course in one snapshot. An entry without a numeric `xp` is an observation WITHOUT XP: it is not a 0.
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
            if (
              typeof id === "string" &&
              typeof c.xp === "number" && Number.isFinite(c.xp) &&
              (c.subject === "language" || c.learningLanguage || id.startsWith("DUOLINGO_"))
            ) {
              map.set(id, c.xp);
            }
          }
        } catch {
          // ignore parse error
        }
        return map;
      }

      // The observations read (at most three snapshots), one per snapshot id, in time order.
      const seenIds = new Set<string>();
      const snaps = [startSnap, ...midSnaps, ...endSnaps]
        .filter((x): x is NonNullable<typeof x> => Boolean(x))
        .filter((x) => (seenIds.has(x.id) ? false : (seenIds.add(x.id), true)))
        .map((x) => ({ at: new Date(x.created_at).getTime(), xp: parseCourses(x.raw_json) }))
        .sort((a, b) => a.at - b.at);

      const series = new Map<string, Array<{ at: number; xp: number }>>();
      for (const s of snaps) for (const [id, xp] of s.xp) (series.get(id) ?? series.set(id, []).get(id)!).push({ at: s.at, xp });

      // A6 §14.2: the state of each course in the half (a, b] from ITS OWN observations.
      function half(a: number, b: number) {
        const courses: Array<{ courseId: string; xp: number }> = [];
        const nonComparable: NonComparableCourse[] = [];
        for (const [courseId, obs] of series) {
          const oa = [...obs].reverse().find((o) => o.at <= a);
          const inHalf = obs.filter((o) => o.at > a && o.at <= b);
          const ob = inHalf[inHalf.length - 1];
          const iso = (t: number) => new Date(t).toISOString();

          if (!ob) {
            const next = obs.find((o) => o.at > b);
            const bound = next ? next.xp - (oa?.xp ?? 0) : null;
            nonComparable.push({ courseId, state: "unknown", reason: "not_observed_in_period", boundXp: bound !== null && bound >= 0 ? bound : null });
            continue;
          }
          if (!oa) {
            nonComparable.push({ courseId, state: "new_course", boundXp: obs[0]!.xp, firstObservedAt: iso(obs[0]!.at) });
            continue;
          }
          const run = [oa, ...inHalf];
          const drop = run.findIndex((o, i) => i > 0 && o.xp < run[i - 1]!.xp);
          if (drop > 0) {
            nonComparable.push({
              courseId, state: "discontinuity", reason: "non_monotonic", boundXp: null,
              discontinuity: { fromAt: iso(run[drop - 1]!.at), toAt: iso(run[drop]!.at), xpBefore: run[drop - 1]!.xp, xpAfter: run[drop]!.xp },
            });
            continue;
          }
          const gain = ob.xp - oa.xp;
          if (gain > 0) courses.push({ courseId, xp: gain });
        }
        return { courses, nonComparable };
      }

      return {
        startedAt,
        endedAt,
        activeDays,
        h1: half(startMs, midMs),
        h2: half(midMs, endMs),
      };
    },
  };
}
