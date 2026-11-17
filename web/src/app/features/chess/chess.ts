import { afterNextRender, Component, computed, DestroyRef, effect, ElementRef, inject, input, Injector, linkedSignal, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { rxResource } from '@angular/core/rxjs-interop';
import { catchError, finalize, forkJoin, map, Observable, of } from 'rxjs';
import { ApiClient } from '../../core/api-client';
import { scrollBehavior } from '../../core/motion';
import { fmtDelta, pc1, pctCi } from '../../core/format';
import { StatsService } from '../../core/stats.service';
import { ErrorBlock } from '../../shared/error-block';
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
import { ReviewSuggestion } from './components/review-suggestion';
import { EngineProfile, Profile, PROFILE_CUT_KEY } from './components/engine-profile';
import {
  ChessData, ColorStats, es, fmt, Group, list, Mates, NA, OpponentElo, Openings, Opponents, Phases, Recent, Results, scaleDelta, signedInt, streakWord,
  Summary, Threats, Timeline,
} from './chess.model';

// Port of loadChessDashboard/renderChessView (src/dashboard.client.js:1004–1100, 1447–1625).
const orNull = <T>(o: Observable<T>) => o.pipe(catchError(() => of(null)));
const WR_LABEL = '% de victorias en las últimas 50 partidas';
// The experiment cut lives in this browser only; storage may be blocked (then it lasts as long as the view).
const readCut = () => { try { return localStorage.getItem(PROFILE_CUT_KEY) || ''; } catch { return ''; } };
const saveCut = (v: string) => { try { if (v) localStorage.setItem(PROFILE_CUT_KEY, v); else localStorage.removeItem(PROFILE_CUT_KEY); } catch { /* storage blocked */ } };
const counts = (s: Summary) => s.wins != null && s.losses != null && s.draws != null ? { w: s.wins, l: s.losses, d: s.draws } : null;

function hero(d: ChessData | null, failed: boolean) {
  if (!d) return failed ? { elo: '', sub: '', meta: '', pill: 'pill', streak: '', games: '', hist: '', wr: '', distMeta: '', dist: null }
    : { elo: '—', sub: 'ELO', meta: '—', pill: 'pill', streak: '—', games: '—', hist: '', wr: WR_LABEL, distMeta: '—', dist: null };
  const s = d.s;
  const elo = s.currentElo ?? s.latestElo ?? null;
  const delta = elo != null && s.firstElo != null ? elo - s.firstElo : null;
  // An unknown timeline (failed request) is not "a single observation": the summary still knows the first ELO.
  const single = d.t ? (d.t.snapshots?.length ?? 0) <= 1 : false;
  // the change is against the first reading: say when it was
  const first = d.t?.snapshots?.[0]?.createdAt;
  const since = first ? ` (${new Date(first).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })})` : '';
  const n = s.currentStreak;
  const bots = list<{ key: string; games: number }>(d.o?.macro)?.find((m) => m.key === 'bot');
  // The headline is the recent window (what is happening now); the whole history stays one line away in distMeta.
  const rc = d.rec && (d.rec.games ?? 0) > 0 && d.rec.winRate != null ? d.rec : null;
  const c = rc ? { w: rc.wins ?? 0, l: rc.losses ?? 0, d: rc.draws ?? 0 } : counts(s);
  const sum = c ? c.w + c.l + c.d : 0;
  const wP = sum ? Number((c!.w / sum * 100).toFixed(1)) : 0, lP = sum ? Number((c!.l / sum * 100).toFixed(1)) : 0;
  return {
    elo: elo != null ? String(elo) : '—',
    sub: elo != null ? 'ELO' + (single ? ' · sin histórico comparable' : delta != null ? ` · ${signedInt(delta)} vs primera lectura${since}` : '') : 'ELO',
    meta: s.games ? es(s.games) + ' partidas disputadas · ELO observado en sincronizaciones' : 'Sin partidas registradas',
    pill: 'pill' + (n ? (s.currentStreakKind === 'loss' ? ' pill-loss' : ' pill-win') : ''),
    streak: n ? `${n} ${streakWord(n, s.currentStreakKind)}${n === 1 ? ' consecutiva' : ' consecutivas'}` : 'Sin racha activa',
    games: !s.games || !d.o ? '—' : bots && bots.games >= 0 ? `${es(bots.games)} de ${es(s.games)} partidas contra bots` : '',
    wr: rc ? `${pc1(rc.winRate! * 100)} de victorias en las últimas ${rc.games} partidas` : s.winRate != null ? `${pc1(s.winRate * 100)} de victorias en todo el historial` : WR_LABEL,
    distMeta: c ? `${c.w} victorias · ${c.l} derrotas · ${c.d} tablas` : '—',
    // the whole-history rate is the one reference for the recent window; it lives in «Estadísticas», next to the scope of the data
    hist: rc && s.winRate != null ? `Historial: ${pc1(s.winRate * 100)} de victorias` : '',
    // the historical rate is the one reference here; the 20/50/100 windows live in "Forma actual"
    dist: c && sum > 0 ? { ...c, wP, lP, dP: Number(Math.max(0, 100 - wP - lP).toFixed(1)) } : null,
  };
}

/** One sentence for the win-rate change against the earlier games: it names a direction only when the 95 % interval excludes 0. */
function formVerdict(d: Recent['delta'] | undefined, earlier: number | undefined): string {
  if (!d) return '';
  const n = earlier ? `las ${earlier} partidas anteriores` : 'las partidas anteriores';
  const pts = (Math.abs(d.diff) * 100).toFixed(1).replace('.', ',');
  if (d.lower > 0) return `Vas mejor que antes: ${pts} puntos de % más de victorias que en ${n}.`;
  if (d.upper < 0) return `Vas peor que antes: ${pts} puntos de % menos de victorias que en ${n}.`;
  return `Sin diferencia clara con ${n}.`;
}

function form(r: Recent | null | undefined) {
  if (r === undefined) return undefined;
  if (r === null) return null;
  if (!r.before) return undefined; // legacy renderForm draws nothing without the games before the window
  const side = (x: Recent | Partial<Recent>, head: string) => ({
    head, wr: pctCi(x.winRate, x.winRateCi) + ' de victorias',
    detail: `${x.scoreRate != null ? pc1(x.scoreRate * 100) : '—'} de puntuación · ${x.wins} victorias · ${x.losses} derrotas · ${x.draws} tablas`,
  });
  return {
    now: side(r, 'Últimas ' + r.games), before: side(r.before, 'Anteriores · ' + r.before.games),
    delta: r.delta ? fmtDelta(scaleDelta(r.delta, 100)) + ' vs anteriores' : '',
    verdict: formVerdict(r.delta, r.before.games),
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
  if (!points.length) note = 'Sin lecturas de ELO';
  else if (points.length > 1) {
    const elos = points.map((p) => p.elo);
    note = `${points.length} días con ELO leído · lecturas entre ${Math.min(...elos)} y ${Math.max(...elos)} · ${signedInt(elos[elos.length - 1] - elos[0])} desde la primera lectura`;
  }
  return { points, note };
}

/** A count of games that ended one way; it opens the Partidas list filtered to exactly those games. */
interface EndItem { t: string; result: 'loss' | 'draw'; end: string }

function results(s: Summary, r: Results | null) {
  if (!r) return { na: NA, loss: [] as EndItem[], rate: '', draw: [] as EndItem[] };
  const ec = r.endConditions;
  if (!ec) return { na: '', loss: [] as EndItem[], rate: '', draw: [] as EndItem[] };
  const lossOf = (k: string) => ec[k]?.loss || 0, drawOf = (k: string) => ec[k]?.draw || 0;
  const discon = lossOf('disconnection'), mates = lossOf('checkmate'), losses = s.losses || 0;
  const lp: EndItem[] = [];
  if (mates) lp.push({ t: mates + ' mates', result: 'loss', end: 'checkmate' });
  if (discon) lp.push({ t: `${discon} desconexiones (${losses ? (discon / losses * 100).toFixed(0) : 0} %)`, result: 'loss', end: 'disconnection' });
  for (const [k, v] of Object.entries(ec))
    if (k !== 'checkmate' && k !== 'disconnection' && k !== 'unknown' && v && (v.loss ?? 0) > 0)
      lp.push({ t: v.loss + ' ' + (k === 'resignation' ? 'rendiciones' : k === 'timeout' ? 'por tiempo' : k), result: 'loss', end: k });
  const decided = (s.wins || 0) + losses + (s.draws || 0), played = losses - discon;
  const dp: EndItem[] = [];
  const draw = (n: number, label: string, end: string) => { if (n) dp.push({ t: n + ' ' + label, result: 'draw', end }); };
  draw(drawOf('stalemate'), 'ahogados', 'stalemate');
  draw(drawOf('repetition'), 'repetición', 'repetition');
  draw(drawOf('insufficient_material') + drawOf('material'), 'material', 'insufficient_material');
  draw(drawOf('fifty_moves'), '50 jugadas', 'fifty_moves');
  for (const [k, v] of Object.entries(ec))
    if (!['stalemate', 'repetition', 'insufficient_material', 'material', 'fifty_moves', 'unknown'].includes(k) && v && (v.draw ?? 0) > 0) draw(v.draw ?? 0, k, k);
  return {
    na: '', loss: lp, draw: dp,
    rate: discon && decided ? `Sin contar desconexiones: ${played} derrotas de ${decided} partidas (${(played / decided * 100).toFixed(0)} %)` : '',
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
      { label: 'Puntuación', value: s.scoreRate != null ? pc1(s.scoreRate * 100) : '—', sub: 'victoria 1 · tablas 0,5' },
    ],
    streakNow: s.currentStreak ? `Resultados seguidos: ${s.currentStreak} ${streakWord(s.currentStreak, s.currentStreakKind)}` : '',
    streakBest: 'Mejor serie: ' + (s.longestWin != null ? s.longestWin + ' victorias' : '—') + (s.longestLoss ? ` · Peor: ${s.longestLoss} derrotas` : ''),
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
  imports: [ErrorBlock, Kpi, Section, Segmented, Donut, Sparkline, Compare, MatchesTable, MatchDetailModal, OpeningsBlock, ReviewSuggestion, EngineProfile],
  providers: [MatchesService],
  templateUrl: './chess.html',
})
export class Chess {
  private readonly api = inject(ApiClient);
  private readonly stats = inject(StatsService);

  // summary is essential (an error with a retry); every other card degrades on its own to "No disponible".
  protected readonly data = rxResource<ChessData, unknown>({ stream: () => this.load() });
  /** A block retried on its own (openings, phases, mates, threats) lands here; a new page load clears it. */
  private readonly patch = linkedSignal<ChessData | undefined, Partial<ChessData>>({ source: () => this.data.hasValue() ? this.data.value() : undefined, computation: () => ({}) });
  protected readonly retrying = signal<ReadonlySet<string>>(new Set());
  protected readonly d = computed(() => { const b = this.data.hasValue() ? this.data.value() : null; return b ? { ...b, ...this.patch() } : null; });
  // A body the view cannot read fails the load like a failed summary (legacy: the same catch), never a blank page.
  private readonly viewed = computed(() => {
    const d = this.d();
    if (!d) return null;
    try { return { ...view(d), hero: hero(d, false) }; } catch (e) { console.error(e); return 'unreadable' as const; }
  });
  protected readonly v = computed(() => { const x = this.viewed(); return x === 'unreadable' ? null : x; });
  protected readonly failed = computed(() => this.data.status() === 'error' || this.viewed() === 'unreadable');
  protected readonly hero = computed(() => this.v()?.hero ?? hero(null, this.failed()));
  /** First load: blocks in the shape of the page instead of dashes that read as values; after 3 s a line says it is still going. */
  protected readonly loadingFirst = computed(() => this.data.isLoading() && !this.data.hasValue());
  protected readonly slow = signal(false);
  protected readonly retried = signal(false);
  protected retryPage(): void { this.retried.set(true); this.data.reload(); }
  protected readonly failMessage = computed(() => this.failed() && typeof navigator !== 'undefined' && navigator.onLine === false
    ? 'Sin conexión. Pulsa Reintentar cuando vuelva la red.' : 'No pudimos cargar tus estadísticas de ajedrez.');

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
  /** The window that last loaded stays on screen under the failure of the next one. */
  private readonly recentShown = linkedSignal<Recent | null | undefined, Recent | null | undefined>({ source: () => this.recent(), computation: (src, prev) => src ?? prev?.value });
  protected readonly recentLoading = computed(() => this.recentRes.isLoading());
  protected readonly formFailed = computed(() => this.recent() === null);
  protected readonly form = computed(() => form(this.recentShown()));
  protected readonly formMessage = computed(() => `No pudimos cargar las últimas ${this.recentN() ?? 50} partidas.`);
  protected retryForm(): void { if (this.recentN() == null) this.recentN.set(50); else this.recentRes.reload(); }
  protected readonly formShort = computed(() => this.recent() && !this.recent()!.before ? `Aún no hay partidas anteriores a las últimas ${this.recentN() ?? 50} con las que comparar. Elige una ventana menor.` : '');

  // Engine profile: asked with the saved cut; a new cut cancels the request for the previous one.
  protected readonly cut = signal(readCut());
  private readonly profileRes = rxResource<Profile | null, string>({
    params: () => this.cut(),
    stream: ({ params: since }) => orNull(this.api.get<Profile>('/api/stats/profile', since ? { since } : undefined)),
  });
  /** undefined = loading, null = failed. */
  protected readonly profile = computed(() => this.profileRes.isLoading() || !this.profileRes.hasValue() ? undefined : this.profileRes.value());

  private readonly matches = inject(MatchesService);
  private readonly injector = inject(Injector);
  /** A count in «Resultados»: open the full list already filtered to those games, and move there. */
  protected showEnding(result: 'loss' | 'draw', end: string): void {
    this.matches.showEnding(result, end);
    afterNextRender(() => this.show('partidas'), { injector: this.injector });
  }
  protected retryProfile(): void { this.profileRes.reload(); }
  protected readonly profileLoading = computed(() => this.profileRes.isLoading());
  protected retryBlock(k: 'op' | 'ph' | 'mt' | 'th'): void {
    const route = { op: 'openings', ph: 'phases', mt: 'mates', th: 'threats' }[k];
    this.retrying.update((s) => new Set(s).add(k));
    this.api.get<unknown>('/api/stats/' + route).pipe(orNull, finalize(() => this.retrying.update((s) => { const n = new Set(s); n.delete(k); return n; })))
      .subscribe((v) => this.patch.update((p) => ({ ...p, [k]: v })));
  }


  constructor() {
    effect(() => this.stats.chessUpdated.set(this.v()?.syncMeta ?? ''));
    effect((onCleanup) => {
      if (!this.loadingFirst()) return;
      const t = setTimeout(() => this.slow.set(true), 3000);
      onCleanup(() => { clearTimeout(t); this.slow.set(false); });
    });
    inject(DestroyRef).onDestroy(() => this.stats.chessUpdated.set(''));
    // A block named in the URL (link, Back) opens once the cards above it hold their data, as /profile does below.
    const injector = inject(Injector);
    const ready = computed(() => !this.data.isLoading() && this.profile() !== undefined);
    effect(() => {
      const k = this.s();
      if (k && ready()) afterNextRender(() => this.show(k), { injector });
    });
    // /profile (legacy showTab('profile')): open the engine section and scroll to it, once the cards above it hold
    // their data (scrolled earlier, the cards growing above push the section out of view on phones).
    if (inject(ActivatedRoute).snapshot.data['engineSection']) {
      const once = effect(() => {
        if (this.data.isLoading() || this.profile() === undefined) return;
        once.destroy();
        afterNextRender(() => this.within(this.engineDetails()), { injector });
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

  /** The `?s=` query param (bound by the router): the block a link or Back points at. */
  readonly s = input<string>();
  private readonly cgStats = viewChild.required<Section>('cgStats');
  private readonly cgComp = viewChild.required<Section>('cgComp');
  private readonly cgOpen = viewChild.required<Section>('cgOpen');
  private readonly cgEvo = viewChild.required<Section>('cgEvo');
  private readonly allMatches = viewChild.required<ElementRef<HTMLElement>>('allMatches');


  /** Blocks live inside the collapsed «Estadísticas»: open it, then the block. */
  private within(block: Section): void { this.cgStats().expand(); block.reveal(); }

  private show(k: string | undefined): void {
    if (k === 'comparativa') this.within(this.cgComp());
    else if (k === 'aperturas') this.within(this.cgOpen());
    else if (k === 'evolucion') this.within(this.cgEvo());
    else if (k === 'partidas') {
      const card = this.allMatches().nativeElement;
      card.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      const h = card.querySelector<HTMLElement>('h2');
      if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
    }
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
