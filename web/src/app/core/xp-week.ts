// The week of Idiomas XP against the four before it, and the freshness rule it depends on. Shared by Hoy and Idiomas (a feature does not import
// another feature). Nothing here invents a number: a window with no baseline says so and data older than two days is old, never zero.
import { fmtDate } from './format';
import { es, toDay, XpDay } from './courses';

export const DAY = 864e5;
/** The app's one rule for "this data is old". */
export const STALE_AFTER_DAYS = 2;
export const isStale = (iso: string | null | undefined, now: number): boolean => !!iso && now - Date.parse(iso) > STALE_AFTER_DAYS * DAY;

/** Whole calendar days (reader's local dates) between a timestamp and now: the one way the app counts "hace N días". */
export const calendarDaysAgo = (iso: string, now: number): number => {
  const t = new Date(iso), n = new Date(now);
  return Math.max(0, Math.round((Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) - Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())) / DAY));
};

export const shift = (date: string, days: number) => new Date(Date.parse(date + 'T00:00:00Z') + days * DAY).toISOString().slice(0, 10);
/** '3 nov' within the current year, '3 nov 2025' otherwise. */
export const shortDate = (date: string, now: number) => { const f = fmtDate(date); return date.slice(0, 4) === new Date(now).toISOString().slice(0, 4) ? f.slice(0, -5) : f; };
export const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);

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
  if (isStale(syncedAt, now)) return { state: 'stale', ageDays: calendarDaysAgo(syncedAt, now) };
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

/** The one sentence for the week, whatever the state: what Hoy and Idiomas both say. */
export function xpWeekLine(w: XpWeek, today: string): string {
  if (w.state === 'none') return 'Sin sincronizar todavía';
  if (w.state === 'stale') return `Sin datos nuevos desde hace ${w.ageDays} ${w.ageDays === 1 ? 'día' : 'días'} · no se compara con tu media`;
  return xpLine(w, today);
}
