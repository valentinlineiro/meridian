// What Hoy says, as pure functions of what the API answered. Nothing is computed that the contracts do not support: a window with no
// baseline says so, data older than two days is said to be old (never read as zero), and no number is invented.
import { Delta, fmtDate, fmtDelta, pc1, scaleDelta } from '../../core/format';
import { es, toDay, XpDay } from '../../core/courses';
import { attentionOrder, gameName, gdays, intervalVerdict, Verdict, VERDICT_ORDER, verdictFor, verdictKey } from '../../core/words';

// What this page reads of each domain's response: a subset of the Chess and Games models (a feature does not import another feature).
export interface ChessRecentIn { games?: number | null; winRate?: number | null; delta?: Delta | null }
export interface ChessSummaryIn { currentElo?: number | null; latestElo?: number | null }
export interface TimelineIn { snapshots?: { createdAt: string; elo?: number | null }[] }
export interface GamesSummaryIn {
  games: Record<string, { interpretation: { label: string; pending: string | null } }>;
  playStreak?: { current: number; max: number } | null; to?: string | null;
}

const DAY = 864e5;
/** The app's one rule for "this data is old". */
export const STALE_AFTER_DAYS = 2;
export const isStale = (iso: string | null | undefined, now: number): boolean => !!iso && now - Date.parse(iso) > STALE_AFTER_DAYS * DAY;

/**
 * When the data was synced, in the reader's calendar days (not 24-hour spans: yesterday evening is "ayer", not "hoy"). Says nothing about how far
 * the complete days reach; the freshness rule (more than two days) is isStale's.
 */
export function syncChip(iso: string | null | undefined, now: number): { text: string; stale: boolean } | null {
  if (!iso) return null;
  const t = new Date(iso), n = new Date(now);
  const days = Math.max(0, Math.round((Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) - Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())) / DAY));
  return { text: 'datos de ' + (days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`), stale: isStale(iso, now) };
}

const shift = (date: string, days: number) => new Date(Date.parse(date + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);
/** '3 nov' within the current year, '3 nov 2025' otherwise. */
const shortDate = (date: string, now: number) => { const f = fmtDate(date); return date.slice(0, 4) === new Date(now).toISOString().slice(0, 4) ? f.slice(0, -5) : f; };
const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);

// ── Idiomas ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type XpWeek =
  | { state: 'none' }
  | { state: 'stale'; ageDays: number }
  | { state: 'ok'; through: string; days: { date: string; xp: number }[]; total: number; sessions: number; avgWeek: number | null; pct: number | null };

/**
 * The last seven COMPLETE days up to the last sync (the sync day itself is partial) against the four weeks before them.
 * Days after the sync are unknown, not zero: with a sync older than two days nothing is compared. A day missing inside the covered
 * span had no XP; a baseline the history does not fully reach is not computed.
 */
export function xpWeek(rows: XpDay[], syncedAt: string | null | undefined, now: number): XpWeek {
  if (!syncedAt) return { state: 'none' };
  if (isStale(syncedAt, now)) return { state: 'stale', ageDays: Math.floor((now - Date.parse(syncedAt)) / DAY) };
  if (!rows.length) return { state: 'none' };
  const byDay = new Map<string, XpDay>();
  for (const r of rows) if (!byDay.has(toDay(r.date))) byDay.set(toDay(r.date), r);
  const through = shift(toDay(syncedAt), -1);
  const xp = (d: string) => byDay.get(d)?.gainedXp || 0;
  const days = Array.from({ length: 7 }, (_, i) => shift(through, i - 6)).map((date) => ({ date, xp: xp(date) }));
  const baselineStart = shift(through, -34);
  const reaches = [...byDay.keys()].sort()[0]! <= baselineStart;
  const avgWeek = reaches ? Array.from({ length: 28 }, (_, i) => xp(shift(baselineStart, i))).reduce((a, b) => a + b, 0) / 4 : null;
  const total = days.reduce((a, d) => a + d.xp, 0);
  return {
    state: 'ok', through, days, total, avgWeek,
    sessions: days.reduce((a, d) => a + (byDay.get(d.date)?.numSessions || 0), 0),
    pct: avgWeek ? (total - avgWeek) / avgWeek * 100 : null,
  };
}

export function xpLine(w: Extract<XpWeek, { state: 'ok' }>, today: string): string {
  const upto = w.through === shift(today, -1) ? 'ayer' : shortDate(w.through, Date.parse(today));
  const head = `Últimos 7 días completos (hasta ${upto}): ${es(w.total)} XP`;
  if (w.avgWeek == null) return head + ' · aún sin 4 semanas de historial para comparar';
  if (w.avgWeek === 0) return head + ' · sin XP en las 4 semanas anteriores';
  return `${head} · media de las 4 semanas anteriores: ${es(Math.round(w.avgWeek))} XP por semana (${sign(Math.round(w.pct!))} %)`;
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
    elo: elo != null ? `ELO ${elo}` + (ch ? ` (${sign(ch.diff)} desde el ${shortDate(ch.since, i.now)})` : '') : null,
  };
}

// ── LinkedIn Games ───────────────────────────────────────────────────────────────────────────────────────────────────────────
/** What needs a look first across the games (the order of the Games view), counted by the same verdict words. */
export function gamesRow(s: GamesSummaryIn): { verdict: Verdict | null; name: string | null; line: string; streak: string } {
  const keys = attentionOrder(s.games);
  if (!keys.length) return { verdict: null, name: null, line: 'Sin partidas registradas aún', streak: '' };
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
    line: [...(head ? [`${gameName(keys[0]!)}: ${vs[0]!.label}`] : []), ...counts].join(' · '),
    streak: cur > 0 ? `Racha: ${gdays(cur)} ${cur === 1 ? 'seguido' : 'seguidos'}` : s.to ? `Sin registro desde ${fmtDate(s.to)} · registro manual` : '',
  };
}

// ── The page ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The one sentence at the top: only verdicts that say something, worst first, each with the subject that originates it ("Tango: a la baja"); never a claim the rows do not make. */
export function headline(rows: { name: string; verdict: Verdict | null }[]): string {
  const said = rows.filter((r) => r.verdict && (r.verdict.state === 'confirmed' || r.verdict.state === 'possible'))
    .sort((a, b) => VERDICT_ORDER.indexOf(verdictKey(a.verdict!)) - VERDICT_ORDER.indexOf(verdictKey(b.verdict!)));
  if (said.length) return said.map((r) => `${r.name}: ${r.verdict!.label.toLowerCase()}`).join(' · ');
  return rows.some((r) => r.verdict?.state === 'no-signal') ? 'Sin cambios claros en tus resultados recientes.' : 'Aún no hay datos suficientes para valorar tu ritmo.';
}
