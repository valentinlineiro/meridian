import { afterNextRender, Component, computed, DestroyRef, effect, inject, Injector, linkedSignal, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, map, Observable, of } from 'rxjs';
import { ApiClient } from '../../core/api-client';
import { fmtDelta, pc1, pctCi } from '../../core/format';
import { StatsService } from '../../core/stats.service';
import { Kpi } from '../../shared/kpi';
import { Section } from '../../shared/section';
import { Segmented } from '../../shared/segmented';
import { Donut } from '../../shared/donut';
import { EloPoint, Sparkline } from '../../shared/sparkline';
import { Compare } from './components/compare';
import { MatchesService } from './services/matches.service';
import { MatchesTable } from './components/matches-table';
import { MatchDetailModal } from './components/match-detail-modal';
import { Openings as OpeningsBlock } from './components/openings';
import { Patterns } from './components/patterns';
import { EngineProfile, Profile, PROFILE_CUT_KEY } from './components/engine-profile';
import {
  ChessData, ColorStats, es, fmt, Group, list, Mates, NA, OpponentElo, Openings, Opponents, Phases, Recent, Results, scaleDelta, signedInt, streakWord,
  Summary, Threats, Timeline,
} from './chess.model';

// Port of loadChessDashboard/renderChessView (src/dashboard.client.js:1004–1100, 1447–1625).
const orNull = <T>(o: Observable<T>) => o.pipe(catchError(() => of(null)));
const WR_LABEL = '% de victorias (historial completo, todos los rivales)';
// The experiment cut lives in this browser only; storage may be blocked (then it lasts as long as the view).
const readCut = () => { try { return localStorage.getItem(PROFILE_CUT_KEY) || ''; } catch { return ''; } };
const saveCut = (v: string) => { try { if (v) localStorage.setItem(PROFILE_CUT_KEY, v); else localStorage.removeItem(PROFILE_CUT_KEY); } catch { /* storage blocked */ } };
const counts = (s: Summary) => s.wins != null && s.losses != null && s.draws != null ? { w: s.wins, l: s.losses, d: s.draws } : null;

function hero(d: ChessData | null, failed: boolean) {
  if (!d) return { elo: '—', sub: 'ELO', meta: failed ? 'No se pudieron cargar las estadísticas' : '—', pill: 'pill', streak: '—', games: '—', wr: WR_LABEL, distMeta: '—', dist: null };
  const s = d.s;
  const elo = s.currentElo ?? s.latestElo ?? null;
  const delta = elo != null && s.firstElo != null ? elo - s.firstElo : null;
  // An unknown timeline (failed request) is not "a single observation": the summary still knows the first ELO.
  const single = d.t ? (d.t.snapshots?.length ?? 0) <= 1 : false;
  const n = s.currentStreak;
  const bots = list<{ key: string; games: number }>(d.o?.macro)?.find((m) => m.key === 'bot');
  const c = counts(s);
  const sum = c ? c.w + c.l + c.d : 0;
  const wP = sum ? Number((c!.w / sum * 100).toFixed(1)) : 0, lP = sum ? Number((c!.l / sum * 100).toFixed(1)) : 0;
  return {
    elo: elo != null ? String(elo) : '—',
    sub: elo != null ? 'ELO' + (single ? ' · sin histórico comparable' : delta != null ? ` · ${signedInt(delta)} vs primer snapshot` : '') : 'ELO',
    meta: s.games ? es(s.games) + ' partidas disputadas · ELO observado en sincronizaciones' : 'Sin partidas registradas',
    pill: 'pill' + (n ? (s.currentStreakKind === 'loss' ? ' pill-loss' : ' pill-win') : ''),
    streak: n ? `🔥 ${n} ${streakWord(n, s.currentStreakKind)}${n === 1 ? ' consecutiva' : ' consecutivas'}` : '🔥 Sin racha activa',
    games: !s.games || !d.o ? '—' : bots && bots.games >= 0 ? `${es(bots.games)} de ${es(s.games)} partidas contra bots` : '',
    wr: s.winRate != null ? `${pc1(s.winRate * 100)} de victorias (historial completo, todos los rivales)` : WR_LABEL,
    distMeta: c ? `${c.w}W · ${c.l}L · ${c.d}D` : '—',
    // the historical rate is the one reference here; the 20/50/100 windows live in "Forma actual"
    dist: c && sum > 0 ? { ...c, wP, lP, dP: Number(Math.max(0, 100 - wP - lP).toFixed(1)) } : null,
  };
}

function form(r: Recent | null | undefined) {
  if (r === undefined) return undefined;
  if (r === null) return null;
  if (!r.before) return undefined; // legacy renderForm draws nothing without the games before the window
  const side = (x: Recent | Partial<Recent>, head: string) => ({
    head, wr: pctCi(x.winRate, x.winRateCi) + ' WR',
    detail: `${x.scoreRate != null ? pc1(x.scoreRate * 100) : '—'} score · ${x.wins}W ${x.losses}L ${x.draws}D`,
  });
  return {
    now: side(r, 'Últimas ' + r.games), before: side(r.before, 'Anteriores · ' + r.before.games),
    delta: r.delta ? fmtDelta(scaleDelta(r.delta, 100)) + ' vs anteriores' : '',
  };
}

function colDiff(c: ColorStats | null) {
  const g = list<Group>(c?.groups) ?? [], wh = g.find((x) => x.key === 'white'), bl = g.find((x) => x.key === 'black');
  if (!(wh && bl && wh.winRate != null && bl.winRate != null)) return '';
  return `Blancas ${pc1(wh.winRate * 100)} · Negras ${pc1(bl.winRate * 100)} → ${fmtDelta(scaleDelta(c!.difference, 100))}`;
}

function oppMacro(o: Opponents | null) {
  const macro = list<NonNullable<Opponents['macro']>[number]>(o?.macro) ?? [];
  const b = macro.find((m) => m.key === 'bot'), p = macro.find((m) => m.key === 'pvp');
  return b && p ? `Bots: ${es(b.games)} (${pctCi(b.winRate, b.winRateCi)}) · PvP: ${es(p.games)} (${pctCi(p.winRate, p.winRateCi)})` : '';
}

// Evolution: one point per day, the last ELO read that day.
function evolution(t: Timeline | null) {
  if (!t) return null;
  const byDay = new Map<string, number>();
  for (const snap of t.snapshots ?? []) if (snap.elo != null) byDay.set(snap.createdAt.slice(0, 10), snap.elo);
  const points: EloPoint[] = [...byDay.entries()].map(([date, elo]) => ({ date, elo })).sort((a, b) => a.date.localeCompare(b.date));
  let note = '';
  if (!points.length) note = 'Sin snapshots';
  else if (points.length > 1) {
    const elos = points.map((p) => p.elo);
    note = `${points.length} días con ELO leído · lecturas entre ${Math.min(...elos)} y ${Math.max(...elos)} · ${signedInt(elos[elos.length - 1] - elos[0])} desde la primera lectura`;
  }
  return { points, note };
}

function results(s: Summary, r: Results | null) {
  if (!r) return { loss: NA, rate: '', draw: '' };
  const ec = r.endConditions;
  if (!ec) return { loss: '', rate: '', draw: '' };
  const lossOf = (k: string) => ec[k]?.loss || 0, drawOf = (k: string) => ec[k]?.draw || 0;
  const discon = lossOf('disconnection'), mates = lossOf('checkmate'), losses = s.losses || 0;
  const lp: string[] = [];
  if (mates) lp.push(mates + ' mates');
  if (discon) lp.push(`${discon} desconexiones (${losses ? (discon / losses * 100).toFixed(0) : 0} %)`);
  for (const [k, v] of Object.entries(ec))
    if (k !== 'checkmate' && k !== 'disconnection' && k !== 'unknown' && v && (v.loss ?? 0) > 0)
      lp.push(v.loss + ' ' + (k === 'resignation' ? 'rendiciones' : k === 'timeout' ? 'por tiempo' : k));
  const decided = (s.wins || 0) + losses + (s.draws || 0), played = losses - discon;
  const dp: string[] = [];
  if (drawOf('stalemate')) dp.push(drawOf('stalemate') + ' ahogados');
  if (drawOf('repetition')) dp.push(drawOf('repetition') + ' repetición');
  const mat = drawOf('insufficient_material') + drawOf('material');
  if (mat) dp.push(mat + ' material');
  if (drawOf('fifty_moves')) dp.push(drawOf('fifty_moves') + ' 50 jugadas');
  for (const [k, v] of Object.entries(ec))
    if (!['stalemate', 'repetition', 'insufficient_material', 'material', 'fifty_moves', 'unknown'].includes(k) && v && (v.draw ?? 0) > 0) dp.push(v.draw + ' ' + k);
  return {
    loss: lp.length ? 'Derrotas: ' + lp.join(' · ') : '',
    rate: discon && decided ? `Sin contar desconexiones: ${played} derrotas de ${decided} partidas (${(played / decided * 100).toFixed(0)} %)` : '',
    draw: dp.length ? 'Tablas: ' + dp.join(' · ') : '',
  };
}

function opponentElo(e: OpponentElo | null, games: number) {
  if (!e) return null;
  const known = e.count, buckets = Object.entries(e.buckets ?? {}) as [string, number][];
  const max = Math.max(1, ...buckets.map(([, v]) => v));
  return {
    known,
    share: `${games ? pc1(known / games * 100) : '0 %'} de ${es(games)} · media ${e.average != null ? e.average.toFixed(0) : '—'} · ${fmt(e.min)} – ${fmt(e.max)}`,
    hist: buckets.map(([k, v]) => ({ k, v, w: (v / max * 100).toFixed(1) + '%' })),
    note: e.note || `${known} / ${games} partidas con ELO rival conocido — la mayoría son bots sin ELO`,
    meta: games ? `· muestra conocida: ${known} (${pc1(known / games * 100)})` : '',
  };
}

function view(d: ChessData) {
  const s = d.s;
  const last = d.t?.snapshots?.[d.t.snapshots.length - 1];
  return {
    syncMeta: last?.createdAt ? 'Ajedrez · actualizado ' + last.createdAt.slice(0, 10) : '',
    kpis: [
      { label: 'Partidas', value: s.games != null ? es(s.games) : '—', sub: '' },
      { label: 'Score', value: s.scoreRate != null ? pc1(s.scoreRate * 100) : '—', sub: 'victoria 1 · tablas 0,5' },
    ],
    streakNow: s.currentStreak ? `Racha actual: ${s.currentStreak} ${streakWord(s.currentStreak, s.currentStreakKind)}` : '',
    streakBest: 'Mejor racha: ' + (s.longestWin != null ? s.longestWin + 'W' : '—') + (s.longestLoss ? ` · Peor: ${s.longestLoss}L` : ''),
    total: s.games || 1,
    col: d.c ? list<Group>(d.c.groups ?? []) : null,
    colDiff: colDiff(d.c),
    oppMacro: oppMacro(d.o),
    opp: d.o ? list<Group>(d.o.segments || d.o.groups || []) : null,
    evo: evolution(d.t),
    counts: counts(s),
    res: results(s, d.r),
    elo: opponentElo(d.e, s.games || 0),
  };
}

@Component({
  selector: 'app-chess',
  imports: [Kpi, Section, Segmented, Donut, Sparkline, Compare, MatchesTable, MatchDetailModal, OpeningsBlock, Patterns, EngineProfile],
  providers: [MatchesService],
  templateUrl: './chess.html',
})
export class Chess {
  private readonly api = inject(ApiClient);
  private readonly stats = inject(StatsService);

  // summary is essential (an error with a retry); every other card degrades on its own to "No disponible".
  protected readonly data = rxResource<ChessData, unknown>({ stream: () => this.load() });
  protected readonly d = computed(() => this.data.hasValue() ? this.data.value() : null);
  // A body the view cannot read fails the load like a failed summary (legacy: the same catch), never a blank page.
  private readonly viewed = computed(() => {
    const d = this.d();
    if (!d) return null;
    try { return { ...view(d), hero: hero(d, false) }; } catch (e) { console.error(e); return 'unreadable' as const; }
  });
  protected readonly v = computed(() => { const x = this.viewed(); return x === 'unreadable' ? null : x; });
  protected readonly failed = computed(() => this.data.status() === 'error' || this.viewed() === 'unreadable');
  protected readonly hero = computed(() => this.v()?.hero ?? hero(null, this.failed()));

  // "Forma actual": the window chosen later owns the card; the resource cancels the earlier request.
  protected readonly recentN = signal<number | null>(null);
  private readonly recentRes = rxResource<Recent | null, number | undefined>({
    params: () => this.recentN() ?? undefined,
    stream: ({ params: limit }) => orNull(this.api.get<Recent>('/api/stats/recent', { limit })),
  });
  // While a window loads the card keeps what it showed.
  private readonly recent = linkedSignal<Recent | null | undefined, Recent | null | undefined>({
    source: () => this.recentN() == null ? this.d()?.rec : this.recentRes.isLoading() || !this.recentRes.hasValue() ? undefined : this.recentRes.value(),
    computation: (src, prev) => src === undefined ? prev?.value : src,
  });
  protected readonly form = computed(() => form(this.recent()));

  // Engine profile: asked with the saved cut; a new cut cancels the request for the previous one.
  protected readonly cut = signal(readCut());
  private readonly profileRes = rxResource<Profile | null, string>({
    params: () => this.cut(),
    stream: ({ params: since }) => orNull(this.api.get<Profile>('/api/stats/profile', since ? { since } : undefined)),
  });
  /** undefined = loading, null = failed. */
  protected readonly profile = computed(() => this.profileRes.isLoading() || !this.profileRes.hasValue() ? undefined : this.profileRes.value());

  private readonly matches = inject(MatchesService);

  // On phones only the first block starts open: the page is a list of blocks to expand.
  protected readonly phone = typeof matchMedia === 'function' && matchMedia('(max-width:760px)').matches;

  constructor() {
    effect(() => this.stats.chessUpdated.set(this.v()?.syncMeta ?? ''));
    inject(DestroyRef).onDestroy(() => this.stats.chessUpdated.set(''));
    // /profile (legacy showTab('profile')): open the engine section and scroll to it, once the cards above it hold
    // their data (scrolled earlier, the cards growing above push the section out of view on phones).
    if (inject(ActivatedRoute).snapshot.data['engineSection']) {
      const injector = inject(Injector);
      const once = effect(() => {
        if (this.data.isLoading() || this.profile() === undefined) return;
        once.destroy();
        afterNextRender(() => this.engineDetails().reveal(), { injector });
      });
    }
  }

  private readonly engineDetails = viewChild.required<Section>('engineDetails');

  protected readonly recentOptions = [20, 50, 100].map((n) => ({ k: String(n), l: String(n) }));
  protected setRecent(n: number): void { this.recentN.set(n); }

  protected setCut(v: string): void {
    saveCut(v);
    this.cut.set(v);
  }

  /** Evidence one tap away: filter the matches by colour and scroll to them. */
  protected filterColor(value: string, card: HTMLElement): void {
    this.matches.setFilter('color', value);
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Page index: scroll to a block (sections use their own reveal()). Buttons, not #anchors: the URL belongs to the router. */
  protected jump(el: HTMLElement): void {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private load(): Observable<ChessData> {
    const stat = this.stats.session();
    return forkJoin({
      s: stat<Summary>('summary', '/api/stats/summary'),
      r: orNull(stat<Results>('results', '/api/stats/results')),
      c: orNull(stat<ColorStats>('color', '/api/stats/color')),
      o: orNull(stat<Opponents>('opponents', '/api/stats/opponents')),
      e: orNull(stat<OpponentElo>('opponentElo', '/api/stats/opponent-elo')),
      t: orNull(stat<Timeline>('timeline', '/api/stats/timeline')),
      op: orNull(this.api.get<Openings>('/api/stats/openings')),
      ph: orNull(this.api.get<Phases>('/api/stats/phases')),
      mt: orNull(this.api.get<Mates>('/api/stats/mates')),
      th: orNull(this.api.get<Threats>('/api/stats/threats')),
      rec: orNull(stat<Recent>('recent', '/api/stats/recent', { limit: 50 })),
    }).pipe(map((x) => { if (!x.s || typeof x.s !== 'object') throw new Error('summary'); return x as ChessData; }));
  }
}
