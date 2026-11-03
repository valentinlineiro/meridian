import { beats, dayNo, efficiencyOf as eff, median, trajectory, windows, type Bucket, type Obs, type RangeKey, type WindowResult } from "./GameAnalysis.ts";
import type { DayRecord } from "./LinkedinGames.ts";

// Read-side metrics over the recorded days (design: docs/audits/linkedin-games-read-view-design-2026-11-03.md).
// Efficiency = the day's published average over the player's time: above 1 is faster than the average, and it already
// normalises the difficulty of the day.
export const WINDOW_DAYS = 28; // four whole weeks: cancels the weekend effect when two windows are compared
export const REGRESSION_DROP = 0.1; // initial operating threshold, not a statistical truth: to be calibrated with more history
export const MIN_PER_WINDOW = 10;

export interface Streak { current: number; max: number }
export interface SeriesPoint { date: string; eff: number; roll: number }
export interface GameSummary {
  n: number;
  nWithAvg: number;
  beatAvgRate: number | null;
  efficiency: { last28: number | null; prev28: number | null; change: number | null; nLast28: number; nPrev28: number };
  best: { seconds: number; date: string };
  beatStreak: Streak;
  regression: boolean;
  series: SeriesPoint[];
  firstDate: string; // start of the game's coverage; a day without play inside it is simply not an observation
  windows: Record<RangeKey, WindowResult>;
  trajectory: Record<RangeKey, Bucket[]>;
}
export interface Summary {
  days: number;
  from: string | null;
  to: string | null;
  playStreak: Streak;
  games: Record<string, GameSummary>;
}

const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

// Runs of strictly consecutive calendar days that satisfy `ok`. The current run counts only while its last day is
// today or yesterday; a missing date breaks it (nothing is inferred).
function streak(days: Array<{ date: string; ok: boolean }>, today: string): Streak {
  let run = 0, max = 0, prev = NaN;
  for (const d of days) {
    const n = dayNo(d.date);
    run = d.ok ? (n === prev + 1 && run > 0 ? run + 1 : 1) : 0;
    prev = n;
    max = Math.max(max, run);
  }
  const last = days[days.length - 1];
  return { current: last && dayNo(today) - dayNo(last.date) <= 1 ? run : 0, max };
}

function gameSummary(obs: Obs[], today: string): GameSummary {
  const t = dayNo(today);
  const withAvg = obs.filter((o) => o.avg !== null);
  const inWindow = (list: Obs[], from: number, to: number) => list.filter((o) => dayNo(o.date) > t - from && dayNo(o.date) <= t - to);
  const last = inWindow(withAvg, WINDOW_DAYS, 0).map(eff), prev = inWindow(withAvg, 2 * WINDOW_DAYS, WINDOW_DAYS).map(eff);
  const last28 = last.length ? median(last) : null, prev28 = prev.length ? median(prev) : null;
  const change = last28 !== null && prev28 !== null ? (last28 - prev28) / prev28 : null;
  const best = obs.reduce((b, o) => (o.score < b.score ? o : b));
  return {
    n: obs.length,
    nWithAvg: withAvg.length,
    beatAvgRate: withAvg.length ? withAvg.filter(beats).length / withAvg.length : null,
    efficiency: { last28, prev28, change, nLast28: last.length, nPrev28: prev.length },
    best: { seconds: best.score, date: best.date },
    beatStreak: streak(obs.map((o) => ({ date: o.date, ok: beats(o) })), today),
    regression: change !== null && last.length >= MIN_PER_WINDOW && prev.length >= MIN_PER_WINDOW && change <= -REGRESSION_DROP + 1e-9,
    firstDate: obs[0]!.date,
    windows: windows(obs, today),
    trajectory: trajectory(obs, today),
    series: withAvg.map((o) => ({
      date: o.date,
      eff: eff(o),
      roll: median(withAvg.filter((p) => dayNo(p.date) > dayNo(o.date) - WINDOW_DAYS && dayNo(p.date) <= dayNo(o.date)).map(eff)),
    })),
  };
}

// `days` holds the current version of each date, ascending. `today` is the player's calendar date.
export function summarize(days: DayRecord[], today: string): Summary {
  const byGame = new Map<string, Obs[]>();
  const played: Array<{ date: string; ok: boolean }> = [];
  for (const d of days) {
    let any = false;
    for (const [game, e] of Object.entries(d.games)) {
      const g = e as { scoreSeconds?: unknown; avgSeconds?: unknown } | null;
      if (!g || !positive(g.scoreSeconds)) continue; // unplayed or malformed: not an observation
      any = true;
      (byGame.get(game) ?? byGame.set(game, []).get(game)!).push({ date: d.date, score: g.scoreSeconds, avg: positive(g.avgSeconds) ? g.avgSeconds : null });
    }
    if (any) played.push({ date: d.date, ok: true });
  }
  return {
    days: played.length,
    from: played[0]?.date ?? null,
    to: played[played.length - 1]?.date ?? null,
    playStreak: streak(played, today),
    games: Object.fromEntries([...byGame].map(([g, obs]) => [g, gameSummary(obs, today)])),
  };
}
