import { beats, block, dayNo, efficiencyOf as eff, median, trajectory, windows, type BeatBlock, type Bucket, type Delta, type EffBlock, type Obs, type RangeKey, type WindowResult } from "./GameAnalysis.ts";
import { arrow28, candidate, publish, type Arrow, type Label, type Reason } from "./GameInterpretation.ts";
import type { DayRecord } from "./LinkedinGames.ts";
import { NOISE_BANDS, type Band, type GameBands, type NoiseBands } from "./NoiseBands.ts";
import { adjustedForm, dayLevels, dowOf, lossMap, type AdjustedForm, type Level, type LossMap } from "./AdjustedForm.ts";
import { recent28vBase56, trend112, type Recent28vBase56, type Trend112 } from "./GameTrend.ts";

// Read-side metrics over the recorded days (design: docs/audits/linkedin-games-read-view-design-2026-11-03.md).
// Efficiency = the day's published average over the player's time: above 1 is faster than the average. It only partly
// normalises the difficulty of the day (the own time moves less than the average: see `adjusted`, AdjustedForm.ts).
export const WINDOW_DAYS = 28; // four whole weeks: cancels the weekend effect when two windows are compared
const DAY_MS = 86_400_000;
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

export interface Streak { current: number; max: number }
export interface SeriesPoint { date: string; eff: number; roll: number }
// The 28-day comparison carries its arrow and band (design rev. 4, §2.4); 7 d, 90 d and "Todo" stay exactly as measured in P0.
export interface Window28 extends Omit<WindowResult, "delta"> {
  delta: { effRel: Delta & { arrow: Arrow; band: Band | null }; beatPp: Delta; medianSec: Delta } | null;
}
export type SummaryWindows = Omit<Record<RangeKey, WindowResult>, "28"> & { "28": Window28 };
export interface Interpretation {
  label: Label; // published (option B: the same candidate today and a week ago)
  reason: Reason | null;
  candidate: Label; // today, before the two-week rule
  previousCandidate: Label; // a week ago
  pending: Label | null; // an unconfirmed candidate; the published label is "estable" meanwhile
  bands: GameBands | null; // null for a game without calibration
  calibratedThrough: string | null;
}
export interface GameSummary {
  n: number;
  nWithAvg: number;
  beatAvgRate: number | null;
  efficiency: { last28: number | null; prev28: number | null; change: number | null; nLast28: number; nPrev28: number };
  best: { seconds: number; date: string };
  beatStreak: Streak;
  regression: boolean; // obsolete: equals interpretation.label === "deterioro"
  series: SeriesPoint[];
  firstDate: string; // start of the game's coverage; a day without play inside it is simply not an observation
  windows: SummaryWindows;
  trend112: Trend112 | null;
  recent28vBase56: Recent28vBase56 | null;
  interpretation: Interpretation;
  trajectory: Record<RangeKey, Bucket[]>;
  adjusted: AdjustedForm;
  losses: LossMap;
}
/** Monday = 0 … Sunday = 6: how all the games together went on that weekday, over the whole history. */
export interface Weekday { dow: number; n: number; beat: BeatBlock; eff: EffBlock }
export interface Summary {
  days: number;
  from: string | null;
  to: string | null;
  playStreak: Streak;
  weekdays: Weekday[];
  difficulty: Array<{ date: string; level: Level }>;
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

function gameSummary(game: string, obs: Obs[], today: string, noise: NoiseBands): GameSummary {
  const t = dayNo(today);
  const withAvg = obs.filter((o) => o.avg !== null);
  const inWindow = (list: Obs[], from: number, to: number) => list.filter((o) => dayNo(o.date) > t - from && dayNo(o.date) <= t - to);
  const last = inWindow(withAvg, WINDOW_DAYS, 0).map(eff), prev = inWindow(withAvg, 2 * WINDOW_DAYS, WINDOW_DAYS).map(eff);
  const last28 = last.length ? median(last) : null, prev28 = prev.length ? median(prev) : null;
  const change = last28 !== null && prev28 !== null ? (last28 - prev28) / prev28 : null;
  const best = obs.reduce((b, o) => (o.score < b.score ? o : b));
  const bands = noise.games[game] ?? null, weekAgo = addDays(today, -7);
  const trend = trend112(obs, today), recent = recent28vBase56(obs, today);
  const now = candidate(trend, recent, bands), before = candidate(trend112(obs, weekAgo), recent28vBase56(obs, weekAgo), bands);
  const published = publish(now, before);
  const w = windows(obs, today), w28 = w["28"];
  return {
    n: obs.length,
    nWithAvg: withAvg.length,
    beatAvgRate: withAvg.length ? withAvg.filter(beats).length / withAvg.length : null,
    efficiency: { last28, prev28, change, nLast28: last.length, nPrev28: prev.length },
    best: { seconds: best.score, date: best.date },
    beatStreak: streak(obs.map((o) => ({ date: o.date, ok: beats(o) })), today),
    regression: published.label === "deterioro",
    firstDate: obs[0]!.date,
    windows: { ...w, "28": { ...w28, delta: w28.delta && { ...w28.delta, effRel: { ...w28.delta.effRel, arrow: arrow28(w28.delta.effRel, bands), band: bands ? bands["28"] : null } } } },
    trend112: trend,
    recent28vBase56: recent,
    interpretation: { label: published.label, reason: published.reason, candidate: now.label, previousCandidate: before.label, pending: published.pending, bands, calibratedThrough: bands ? noise.calibratedThrough : null },
    trajectory: trajectory(obs, today),
    adjusted: adjustedForm(obs, today),
    losses: lossMap(obs),
    series: withAvg.map((o) => ({
      date: o.date,
      eff: eff(o),
      roll: median(withAvg.filter((p) => dayNo(p.date) > dayNo(o.date) - WINDOW_DAYS && dayNo(p.date) <= dayNo(o.date)).map(eff)),
    })),
  };
}

function weekdays(obs: Obs[]): Weekday[] {
  return Array.from({ length: 7 }, (_, dow) => {
    const mine = obs.filter((o) => dowOf(o.date) === dow), b = block(mine);
    return { dow, n: mine.length, beat: b.beat, eff: b.eff };
  });
}

// `days` holds the current version of each date, ascending. `today` is the player's calendar date.
export function summarize(days: DayRecord[], today: string, noise: NoiseBands = NOISE_BANDS): Summary {
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
    weekdays: weekdays([...byGame.values()].flat()),
    difficulty: dayLevels([...byGame.values()]),
    games: Object.fromEntries([...byGame].map(([g, obs]) => [g, gameSummary(g, obs, today, noise)])),
  };
}
