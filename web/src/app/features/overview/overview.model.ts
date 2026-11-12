// What Hoy says, as pure functions of what the API answered. Nothing is computed that the contracts do not support: a window with no
// baseline says so, data older than two days is said to be old (never read as zero), and no number is invented.
import { Delta, fmtDate, fmtDelta, pc1, scaleDelta } from '../../core/format';
import { calendarDaysAgo, DAY, isStale, shortDate, sign } from '../../core/xp-week';
import { resultBars, ResultBarsData } from '../../shared/result-bars';
import { attentionOrder, gameName, gdays, intervalVerdict, Verdict, verdictFor } from '../../core/words';

// What this page reads of each domain's response: a subset of the Chess and Games models (a feature does not import another feature).
export interface ChessRecentIn { games?: number | null; winRate?: number | null; delta?: Delta | null }
export interface ChessSummaryIn { currentElo?: number | null; latestElo?: number | null }
export interface TimelineIn { snapshots?: { createdAt: string; elo?: number | null }[] }
export interface GameIn {
  interpretation: { label: string; pending: string | null };
  series?: { date: string; eff: number }[]; windows?: Record<string, { eff?: { median: number | null } }>;
}
export interface GamesSummaryIn {
  games: Record<string, GameIn>;
  playStreak?: { current: number; max: number } | null; to?: string | null;
}

/**
 * When the data was synced, in the reader's calendar days (not 24-hour spans: yesterday evening is "ayer", not "hoy"). Says nothing about how far
 * the complete days reach; the freshness rule (more than two days) is isStale's.
 */
export function syncChip(iso: string | null | undefined, now: number): { text: string; stale: boolean } | null {
  if (!iso) return null;
  const days = calendarDaysAgo(iso, now);
  return { text: 'datos de ' + (days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`), stale: isStale(iso, now) };
}

// ── Ajedrez ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
interface Snap { createdAt: string; elo?: number | null }
/** The rating now against the last reading at least 28 days old, or else the first reading ever: always dated, never claimed as "28 days". */
export function eloChange(snaps: Snap[], now: number): { from: number; to: number; diff: number; since: string } | null {
  const rated = snaps.filter((s) => s.elo != null).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const latest = rated[rated.length - 1];
  const base = [...rated].reverse().find((s) => Date.parse(s.createdAt) <= now - 28 * DAY) ?? rated[0];
  if (!latest || !base || base === latest) return null;
  return { from: base.elo!, to: latest.elo!, diff: latest.elo! - base.elo!, since: base.createdAt.slice(0, 10) };
}

/** The date of the oldest of the newest `n` games, or null when the loaded games do not reach back that far. */
export function windowStart(matches: { played_at?: number | null }[], n: number): string | null {
  const t = matches.map((m) => m.played_at).filter((v): v is number => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => b - a);
  return t.length >= n && n > 0 ? new Date(t[n - 1]! * 1000).toISOString().slice(0, 10) : null;
}

/** "Últimas 50 partidas (desde el 6 sep): 60,0 % de victorias · +6,0 puntos de % (entre +1,0 y +11,0) frente a las anteriores". */
function chessForm(r: ChessRecentIn, since: string | null, now = Date.now()): string {
  if (!r.games) return 'Aún sin partidas registradas';
  const head = `Últimas ${r.games} partidas${since ? ` (desde el ${shortDate(since, now)})` : ''}: ${r.winRate != null ? pc1(r.winRate * 100) : '—'} de victorias · `;
  if (!r.delta) return head + 'sin partidas anteriores con las que comparar';
  const [delta, note] = fmtDelta(scaleDelta(r.delta, 100)).split(' · '); // fmtDelta appends its "sin evidencia suficiente" note after a " · "
  return head + delta + ' frente a las anteriores' + (note ? ' · ' + note : '');
}

export function chessRow(i: {
  recent: ChessRecentIn | null; summary: ChessSummaryIn | null; timeline: TimelineIn | null; matches: { played_at?: number | null }[] | null; now: number;
}) {
  const r = i.recent, since = r?.games ? windowStart(i.matches ?? [], r.games) : null;
  const elo = i.summary?.currentElo ?? i.summary?.latestElo ?? null, ch = elo != null ? eloChange(i.timeline?.snapshots ?? [], i.now) : null;
  return {
    verdict: r ? intervalVerdict(scaleDelta(r.delta, 100)) : null,
    form: r ? chessForm(r, since, i.now) : null,
    elo, eloChange: ch ? `${sign(ch.diff)} desde el ${shortDate(ch.since, i.now)}` : null,
  };
}

// ── LinkedIn Games ───────────────────────────────────────────────────────────────────────────────────────────────────────────
/** What needs a look first across the games (the order of the Games view), counted by the same verdict words. */
/** `link` goes to the report of the game behind the verdict when that verdict says something, and to /games when nothing stands out. */
export interface GamesFocus { big: string; cap: string; bars: ResultBarsData }
/** The speed against the LinkedIn average (the verdict's own 28-day window) and the last results of the game the verdict is about. */
function focusOf(k: string, g: GameIn): GamesFocus | null {
  const m = g.windows?.['28']?.eff?.median;
  if (typeof m !== 'number' || !Number.isFinite(m)) return null;
  return { big: `${sign(Math.round((m - 1) * 100))} %`, cap: `${gameName(k)} · ${m > 1 ? 'más rápido' : m < 1 ? 'más lento' : 'igual'} que la media`, bars: resultBars(g.series ?? []) };
}
export function gamesRow(s: GamesSummaryIn): { verdict: Verdict | null; name: string | null; link: string; line: string; streak: string; focus: GamesFocus | null } {
  const keys = attentionOrder(s.games);
  if (!keys.length) return { verdict: null, name: null, link: '/games', line: 'Sin partidas registradas aún', streak: '', focus: null };
  const vs = keys.map((k) => verdictFor(s.games[k]!.interpretation));
  const head = vs[0]!.state === 'confirmed' || vs[0]!.state === 'possible';
  const rest = head ? vs.slice(1) : vs; // the head is said once, not counted again
  const count = (f: (v: Verdict) => boolean, text: string) => { const n = rest.filter(f).length; return n ? `${n} ${text}` : ''; };
  const counts = [count((v) => v.dir === 'up', 'al alza'), count((v) => v.dir === 'down', 'a la baja'),
    count((v) => v.state === 'no-signal', 'sin señales de cambio'), count((v) => v.state === 'few-data', 'con pocos datos')].filter(Boolean);
  const cur = s.playStreak?.current ?? 0;
  return {
    verdict: vs[0]!,
    name: gameName(keys[0]!),
    link: head ? `/games/${keys[0]}` : '/games',
    focus: head ? focusOf(keys[0]!, s.games[keys[0]!]!) : null,
    line: [...(head ? [`${gameName(keys[0]!)}: ${vs[0]!.label}`] : []), ...counts].join(' · '),
    streak: cur > 0 ? `Racha: ${gdays(cur)} ${cur === 1 ? 'seguido' : 'seguidos'}` : s.to ? `Sin registro desde ${fmtDate(s.to)} · registro manual` : '',
  };
}

// ── The page ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
