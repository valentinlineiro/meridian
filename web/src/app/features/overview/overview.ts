import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, map, Observable, of } from 'rxjs';
import { ApiClient } from '../../core/api-client';
import { StatsService } from '../../core/stats.service';
import { es, Langs, XpDay } from '../../core/courses';
import { relDate, sparkPoints } from '../../core/format';
import { VerdictPill } from '../../shared/verdict';
import { chessRow, ChessRecentIn, ChessSummaryIn, gamesRow, GamesSummaryIn, headline, isStale, syncChip, TimelineIn, xpLine, xpWeek } from './overview.model';

/**
 * Hoy: how you are doing against your own normal, one row per domain. The rows come from overview.model.ts; totals live in each domain's view.
 * Each request fails on its own into null ("No disponible"), never into an empty or zero value.
 */
interface Match { played_at?: number | null }
interface OverviewData {
  langs: Langs | null; summaries: XpDay[] | null;
  stats: ChessSummaryIn | null; recent: ChessRecentIn | null; timeline: TimelineIn | null; matches: Match[] | null;
  games: GamesSummaryIn | null;
}

const NA = 'No disponible';
const orNull = <T>(o: Observable<T>) => o.pipe(catchError(() => of(null)));

function view(d: OverviewData, now: number) {
  const today = new Date(now).toISOString().slice(0, 10);

  const snaps = d.timeline?.snapshots ?? [];
  const chessSynced = snaps[snaps.length - 1]?.createdAt ?? null;
  const c = chessRow({ recent: d.recent, summary: d.stats, timeline: d.timeline, matches: d.matches, now });
  const spark = sparkPoints(snaps.filter((s) => s.elo != null).slice(-30).map((s) => s.elo!));

  // The sync time is the catalogue's. The XP rows' own updatedAt is only "when that day last CHANGED" (a row is rewritten only if it differs),
  // so on a quiet stretch it would make fresh data look old.
  const xpSynced = d.langs?.updatedAt ?? null;
  const w = d.summaries ? xpWeek(d.summaries, xpSynced, now) : null;
  const old = isStale(d.langs?.updatedAt, now);
  const streak = d.langs?.streak;
  const bars = w?.state === 'ok' ? (() => {
    const max = Math.max(1, ...w.days.map((x) => x.xp));
    return w.days.map((x) => ({ letter: 'DLMXJVS'[new Date(x.date + 'T00:00:00Z').getUTCDay()]!, h: Math.max(2, Math.round(x.xp / max * 28)), xp: x.xp }));
  })() : [];

  let g: ReturnType<typeof gamesRow> | null = null;
  try { g = d.games ? gamesRow(d.games) : null; } catch { g = null; } // a malformed summary is unavailable, not an empty log

  return {
    headline: headline([{ name: 'Ajedrez', verdict: c.verdict }, { name: g?.name ?? 'Games', verdict: g?.verdict ?? null }]),
    chess: { ...c, form: c.form ?? NA, spark, freshChip: syncChip(chessSynced, now) },
    lang: {
      line: !d.summaries ? NA : !w || w.state === 'none' ? 'Sin sincronizar todavía'
        : w.state === 'stale' ? `Sin datos nuevos desde hace ${w.ageDays} ${w.ageDays === 1 ? 'día' : 'días'} · no se compara con tu media` : xpLine(w, today),
      streak: streak == null ? '' : old ? `Racha de Duolingo: ${es(Number(streak))} días (dato de hace ${relDate(d.langs!.updatedAt!, now).replace(/^hace /, '')})` : `🔥 Racha de Duolingo: ${es(Number(streak))} días`,
      bars, aria: 'XP de los últimos 7 días completos: ' + bars.map((b) => `${b.letter} ${b.xp}`).join(', '),
      freshChip: syncChip(xpSynced, now),
    },
    games: { line: d.games ? g?.line ?? NA : NA, verdict: g?.verdict ?? null, streak: g?.streak ?? '' },
  };
}

@Component({
  selector: 'app-overview',
  imports: [RouterLink, VerdictPill],
  templateUrl: './overview.html',
})
export class Overview {
  private readonly api = inject(ApiClient);
  private readonly stats = inject(StatsService);

  protected readonly data = rxResource<OverviewData, unknown>({ stream: () => this.load() });
  protected readonly v = computed(() => { const d = this.data.value(); return d ? view(d, Date.now()) : null; });

  private load(): Observable<OverviewData> {
    const stat = this.stats.session();
    return forkJoin({
      langs: orNull(this.api.get<Langs>('/api/languages')),
      xp: orNull(this.api.get<{ summaries?: XpDay[] }>('/api/languages/xp', { days: 45 })), // 7 days + 4 weeks, with room for a sync that is a few days old
      stats: orNull(stat<ChessSummaryIn>('summary', '/api/stats/summary')),
      timeline: orNull(stat<TimelineIn>('timeline', '/api/stats/timeline')),
      recent: orNull(stat<ChessRecentIn>('recent', '/api/stats/recent', { limit: 50 })),
      matches: orNull(this.api.get<{ rows?: Match[] }>('/api/matches', { limit: 100 })),
      games: orNull(this.api.get<{ summary?: GamesSummaryIn }>('/api/me/linkedin-games/summary', { today: new Date().toLocaleDateString('sv-SE') })),
    }).pipe(map((r): OverviewData => ({
      langs: r.langs, summaries: r.xp ? r.xp.summaries ?? [] : null,
      stats: r.stats, recent: r.recent, timeline: r.timeline, matches: r.matches ? r.matches.rows ?? [] : null,
      games: r.games?.summary ?? null,
    })));
  }
}
