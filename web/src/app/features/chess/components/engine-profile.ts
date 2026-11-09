import { Component, computed, inject, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Kpi } from '../../../shared/kpi';
import { dec1, pc0 } from '../chess.model';
import { MatchesService } from '../services/matches.service';
import { safe } from '../../../core/guard';

interface Rate { games?: number; moves: number; serious: number; ratePer100: number | null }
interface Decisive { lossGames: number; withDecisive: number; medianMove?: number | null; byPhase: Record<PhaseKey, number> }
interface Tally { games: number; win: number; draw: number; loss: number }
interface Section {
  games: number; moves: number; serious: number; ratePer100: number | null; acpl: number | null;
  byPhase: Record<PhaseKey, Rate>; byColor: Record<'white' | 'black', Rate>;
  decisive: Decisive & { competitive?: Decisive; disconnection?: Decisive | null };
  conversion: { advantage: Tally; disadvantage: Tally; thrown: number };
}
interface ReviewRow { matchId: string; result?: string; opponent?: string | null; playedAt?: number | null; color?: string; moves: number; serious: number; acpl: number | null; decisivePly?: number | null }
/** GET /api/stats/profile (src/api/stats.ts handleStatsProfile). */
export interface Profile {
  analysed: number; pending?: number; invalid?: number; unknownVersion?: number; bots?: { share?: number | null } | null; since?: unknown;
  all: Section; before?: Section | null; after?: Section | null; blocks?: (Rate & { games: number; partial?: boolean })[];
  review: { worst?: ReviewRow[]; best?: ReviewRow[] };
  observedAt?: string; updatedAt?: string; analyzedAt?: string;
}
type PhaseKey = 'opening' | 'middlegame' | 'endgame';

export const PROFILE_CUT_KEY = 'profile_since';
const PROFILE_MIN_AFTER = 50, REVIEW_SHOWN = 5;
const PHASES: [PhaseKey, string][] = [['opening', 'Apertura'], ['middlegame', 'Medio juego'], ['endgame', 'Final']];
/** A count or rate as the API promised it; anything else makes its section unreadable (never NaN on screen). */
const num = (v: unknown): number => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError('not a number: ' + String(v)); return v; };
const opt = (v: unknown) => v == null ? null : num(v);
const per100 = (r: number | null | undefined) => r == null ? '—' : dec1(num(r));
const pct = (a: number, b: number) => num(b) ? pc0(100 * num(a) / b) : '—';
const pawns = (cp: number | null | undefined) => cp == null ? '—' : dec1(num(cp) / 100);
const bar = (label: string, rate: number | null, max: number, detail: string) =>
  ({ label, w: max > 0 && rate != null ? Math.max(2, Math.round(100 * num(rate) / max)) : 0, rate: per100(rate), detail });
/** A section whose body cannot be read is `na`: it alone says "No disponible". */
const sect = <T>(build: () => T): { v: T | null; na: boolean } => safe(() => ({ v: build(), na: false }), { v: null, na: true });

// Descriptive only: the observed highest rate, never a training recommendation. Phases under 50 own moves are not compared.
function verdict(a: Section) {
  const ph = PHASES.filter(([k]) => num(a.byPhase[k].moves) >= 50 && opt(a.byPhase[k].ratePer100) != null)
    .sort((x, y) => a.byPhase[y[0]].ratePer100! - a.byPhase[x[0]].ratePer100!);
  const parts: string[] = [];
  if (ph.length >= 2) {
    const [hi, lo] = [ph[0], ph[ph.length - 1]];
    parts.push(`Mayor tasa observada de errores graves: ${hi[1].toLowerCase()} (${per100(a.byPhase[hi[0]].ratePer100)} por 100 jugadas; ${lo[1].toLowerCase()}: ${per100(a.byPhase[lo[0]].ratePer100)}).`);
  }
  const dc = a.decisive.competitive || a.decisive; // P3: competitive losses; the disconnections are reported apart
  if (dc.lossGames && dc.medianMove != null)
    parts.push(`Hay un momento decisivo en ${pct(dc.withDecisive, dc.lossGames)} de tus derrotas sin desconexión (${num(dc.withDecisive)} de ${dc.lossGames}), con mediana en tu jugada ${num(dc.medianMove)}.`);
  return parts.join(' ');
}

function gameRow(r: ReviewRow) {
  const res = r.result === 'win' ? ['pill pill-win', 'Victoria'] : r.result === 'loss' ? ['pill pill-loss', 'Derrota'] : r.result === 'draw' ? ['pill pill-draw', 'Tablas'] : ['pill', '—'];
  const date = r.playedAt ? new Date(num(r.playedAt) * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  return {
    id: String(r.matchId), opp: r.opponent || 'Bot', cls: res[0], res: res[1],
    when: date + (r.color === 'white' ? ' · blancas' : r.color === 'black' ? ' · negras' : ''),
    what: (r.decisivePly ? `Se torció en tu jugada ${Math.ceil(num(r.decisivePly) / 2)}. ` : '') +
      `${num(r.serious)} errores graves en ${num(r.moves)} jugadas · pérdida media de evaluación: ${pawns(r.acpl)} peones por jugada`,
  };
}
/** Legacy `(b.review.worst||[])`: an absent list is empty, a list of another type is unreadable. */
const gameRows = (v: unknown) => {
  if (v != null && !Array.isArray(v)) throw new TypeError('review rows');
  return ((v ?? []) as ReviewRow[]).map(gameRow);
};

function compare(b: Section, a: Section) {
  const fix = (x: number | null, dec: number) => x == null ? '—' : num(x).toFixed(dec);
  const diff = (x: number | null, y: number | null, dec: number) => {
    if (x == null || y == null) return null;
    const d = num(y) - num(x);
    return { cls: 'pill ' + (d < 0 ? 'pill-win' : d > 0 ? 'pill-loss' : 'pill-draw'), t: (d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d).toFixed(dec) };
  };
  const cp = (s: Section) => s.acpl == null ? null : num(s.acpl) / 100;
  return {
    rows: [
      { label: 'Partidas', x: String(num(b.games)), y: String(num(a.games)), d: null },
      { label: 'Errores graves por 100 jugadas', x: fix(b.ratePer100, 1), y: fix(a.ratePer100, 1), d: diff(b.ratePer100, a.ratePer100, 1) },
      { label: 'Pérdida media por jugada (peones)', x: fix(cp(b), 2), y: fix(cp(a), 2), d: diff(cp(b), cp(a), 2) },
    ],
    warn: a.games < PROFILE_MIN_AFTER ? `Solo ${a.games} partidas después del corte: aún son pocas para sacar conclusiones (conviene llegar a ${PROFILE_MIN_AFTER}).` : '',
  };
}

const kpi = (label: string, build: () => { value: string; sub: string }) => ({ label, ...safe(build, { value: '—', sub: 'No disponible' }) });

function view(b: Profile, cut: string) {
  // Not a profile at all (no body, or analysed games without their figures): the whole panel says it could not load.
  if (typeof b !== 'object' || (b.analysed && (typeof b.all !== 'object' || !b.all))) throw new TypeError('not a profile');
  const notes: string[] = [];
  if (b.pending) notes.push(b.pending + ' partidas sin analizar');
  if (b.invalid) notes.push(b.invalid + ' no se pudieron evaluar');
  if (b.unknownVersion) notes.push(b.unknownVersion + ' con un formato que este panel no entiende');
  const common = {
    context: !b.analysed ? 'Calculado con Stockfish sobre tus partidas guardadas.' : safe(() =>
      `Calculado con Stockfish sobre ${num(b.analysed)} partidas` + (b.bots?.share != null ? ` (${Math.round(100 * num(b.bots.share))} % contra bots; no describe cómo juegas contra personas)` : '') + '. Son cifras descriptivas, no una nota de nivel.', 'No disponible'),
    sinceNote: cut && !b.since ? 'No encontré esa partida con fecha: se muestra todo sin dividir.' : '',
    note: 'Error grave: una jugada que te cuesta 3 peones o más según Stockfish. Son cifras de tus partidas, sin margen de error: los errores de una partida no son independientes.' +
      (notes.length ? ' Fuera de las cifras: ' + notes.join(' · ') + '.' : ''),
  };
  if (!b.analysed) return { ...common, a: null };
  const a = b.all, d = a.decisive, c = a.conversion, dc = d?.competitive || d, dd = d?.disconnection || null;
  const conv = (label: string, x: Tally) => {
    const p = (n: number) => num(x.games) ? Math.round(100 * num(n) / x.games) : 0;
    return { label, games: x.games, w: p(x.win), d: p(x.draw), l: p(x.loss), won: `Ganadas ${pct(x.win, x.games)} (${x.win})`, draw: 'Tablas ' + x.draw, lost: 'Perdidas ' + x.loss };
  };
  return {
    ...common,
    a: {
      kpis: [
        kpi('Errores graves', () => ({ value: per100(a.ratePer100), sub: `por 100 jugadas · ${num(a.serious)} de ${num(a.moves)}` })),
        kpi('Pérdida media', () => ({ value: pawns(a.acpl), sub: 'peones por jugada' })),
        kpi('Derrotas con momento decisivo', () => ({ value: pct(dc.withDecisive, dc.lossGames),
          sub: (dc.lossGames ? `${num(dc.withDecisive)} de ${dc.lossGames} derrotas sin desconexión` : 'sin derrotas fuera de las desconexiones') + (dd?.lossGames ? ` · ${num(dd.lossGames)} por desconexión aparte` : '') })),
        kpi('Ventajas sostenidas ganadas', () => ({ value: pct(c.advantage.win, c.advantage.games), sub: `${num(c.advantage.win)} de ${c.advantage.games} · ${num(c.thrown)} perdidas` })),
      ],
      verdict: safe(() => verdict(a), 'No disponible'),
      // phases and colours share one scale: one unreadable rate makes both unreadable
      quality: sect(() => {
        const maxP = Math.max(...PHASES.map(([k]) => opt(a.byPhase[k].ratePer100) || 0), ...(['white', 'black'] as const).map((k) => opt(a.byColor[k].ratePer100) || 0));
        return {
          phases: PHASES.map(([k, l]) => bar(l, a.byPhase[k].ratePer100, maxP, `${num(a.byPhase[k].serious)} de ${num(a.byPhase[k].moves)}`)),
          colors: ([['white', 'Blancas'], ['black', 'Negras']] as const).map(([k, l]) => bar(l, a.byColor[k].ratePer100, maxP, `${num(a.byColor[k].serious)} de ${num(a.byColor[k].moves)}`)),
        };
      }),
      trend: sect(() => {
        const bl = b.blocks ?? [];
        if (!Array.isArray(bl)) throw new TypeError('blocks');
        const maxB = Math.max(0, ...bl.map((x) => opt(x.ratePer100) || 0));
        return bl.length > 1 ? {
          cols: bl.map((x, i) => ({
            partial: !!x.partial, h: maxB > 0 && x.ratePer100 != null ? Math.max(3, Math.round(100 * x.ratePer100 / maxB)) : 0,
            title: `Partidas ${i * 50 + 1}–${i * 50 + num(x.games)}: ${per100(x.ratePer100)} por 100 jugadas (${num(x.serious)} de ${num(x.moves)} jugadas)` + (x.partial ? ' · bloque incompleto' : ''),
          })),
          first: 'Primeras partidas · ' + per100(bl[0].ratePer100),
          last: 'Últimas · ' + per100(bl[bl.length - 1].ratePer100) + (bl[bl.length - 1].partial ? ' (incompleto)' : ''),
        } : null;
      }),
      decisive: sect(() => {
        if (!d.lossGames) return null;
        const dn = num(dc.byPhase.opening) + num(dc.byPhase.middlegame) + num(dc.byPhase.endgame);
        return {
          competitive: dc.lossGames ? {
            head: `${num(dc.withDecisive)} de ${num(dc.lossGames)}`,
            tail: ' derrotas sin desconexión tienen un momento decisivo' + (dc.medianMove == null ? '' : `, a la mitad de los casos antes de tu jugada ${num(dc.medianMove)}`) + '.',
            bars: PHASES.map(([k, l]) => ({ label: l, w: dn ? Math.round(100 * dc.byPhase[k] / dn) : 0, pct: pct(dc.byPhase[k], dn), n: dc.byPhase[k] + ' partidas' })),
          } : null,
          apart: dd?.lossGames ? { n: num(dd.lossGames), with: num(dd.withDecisive) } : null,
        };
      }),
      conversion: sect(() => [conv('Con ventaja de más de 3 peones', c.advantage), conv('Con desventaja de más de 3 peones', c.disadvantage)]),
      worst: sect(() => gameRows(b.review?.worst)),
      best: sect(() => gameRows(b.review?.best)),
      cut: sect(() => b.before && b.after ? compare(b.before, b.after) : null),
    },
  };
}

/**
 * Port of the engine profile section (src/dashboard.client.js:1680–1790, paintProfile): Stockfish figures over the
 * analysed games, with the experiment cut kept in this browser only (localStorage PROFILE_CUT_KEY, owned by the parent).
 */
@Component({
  selector: 'app-engine-profile',
  imports: [Kpi, NgTemplateOutlet],
  templateUrl: './engine-profile.html',
})
export class EngineProfile {
  private readonly matches = inject(MatchesService);
  /** undefined = still loading, null = the request failed. */
  readonly profile = input<Profile | null | undefined>(undefined);
  readonly cut = input('');
  readonly cutChange = output<string>();

  // A body the panel cannot read is reported like a failed request, never half-painted.
  private readonly viewed = computed(() => {
    const b = this.profile();
    if (b == null) return b;
    try { return view(b, this.cut()); } catch (e) { console.error(e); return null; }
  });
  protected readonly failed = computed(() => this.viewed() === null);
  protected readonly v = computed(() => this.viewed() ?? null);
  protected readonly reviewShown = REVIEW_SHOWN;

  protected open(e: Event, id: string): void { e.preventDefault(); this.matches.open(id); }
  protected apply(value: string): void { this.cutChange.emit(value.trim()); }
}
