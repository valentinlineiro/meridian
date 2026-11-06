import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Kpi } from '../../shared/kpi.component';
import { dec1, pc0 } from './chess.model';
import { MatchesService } from './matches.service';

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
const per100 = (r: number | null | undefined) => r == null ? '—' : dec1(r);
const pct = (a: number, b: number) => b ? pc0(100 * a / b) : '—';
const pawns = (cp: number | null | undefined) => cp == null ? '—' : dec1(cp / 100);
const bar = (label: string, rate: number | null, max: number, detail: string) =>
  ({ label, w: max > 0 && rate != null ? Math.max(2, Math.round(100 * rate / max)) : 0, rate: per100(rate), detail });

// Descriptive only: the observed highest rate, never a training recommendation. Phases under 50 own moves are not compared.
function verdict(a: Section) {
  const ph = PHASES.filter(([k]) => a.byPhase[k].moves >= 50 && a.byPhase[k].ratePer100 != null)
    .sort((x, y) => a.byPhase[y[0]].ratePer100! - a.byPhase[x[0]].ratePer100!);
  const parts: string[] = [];
  if (ph.length >= 2) {
    const [hi, lo] = [ph[0], ph[ph.length - 1]];
    parts.push(`Mayor tasa observada de errores graves: ${hi[1].toLowerCase()} (${per100(a.byPhase[hi[0]].ratePer100)} por 100 jugadas; ${lo[1].toLowerCase()}: ${per100(a.byPhase[lo[0]].ratePer100)}).`);
  }
  const dc = a.decisive.competitive || a.decisive; // P3: competitive losses; the disconnections are reported apart
  if (dc.lossGames && dc.medianMove != null)
    parts.push(`Hay un momento decisivo en ${pct(dc.withDecisive, dc.lossGames)} de tus derrotas sin desconexión (${dc.withDecisive} de ${dc.lossGames}), con mediana en tu jugada ${dc.medianMove}.`);
  return parts.join(' ');
}

function gameRow(r: ReviewRow) {
  const res = r.result === 'win' ? ['pill pill-win', 'Victoria'] : r.result === 'loss' ? ['pill pill-loss', 'Derrota'] : r.result === 'draw' ? ['pill pill-draw', 'Tablas'] : ['pill', '—'];
  const date = r.playedAt ? new Date(r.playedAt * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  return {
    id: r.matchId, opp: r.opponent || 'Bot', cls: res[0], res: res[1],
    when: date + (r.color === 'white' ? ' · blancas' : r.color === 'black' ? ' · negras' : ''),
    what: (r.decisivePly ? `Se torció en tu jugada ${Math.ceil(r.decisivePly / 2)}. ` : '') +
      `${r.serious} errores graves en ${r.moves} jugadas · pérdida media de evaluación: ${pawns(r.acpl)} peones por jugada`,
  };
}

function compare(b: Section, a: Section) {
  const fix = (x: number | null, dec: number) => x == null ? '—' : x.toFixed(dec);
  const diff = (x: number | null, y: number | null, dec: number) => {
    if (x == null || y == null) return null;
    const d = y - x;
    return { cls: 'pill ' + (d < 0 ? 'pill-win' : d > 0 ? 'pill-loss' : 'pill-draw'), t: (d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d).toFixed(dec) };
  };
  const cp = (s: Section) => s.acpl == null ? null : s.acpl / 100;
  return {
    rows: [
      { label: 'Partidas', x: String(b.games), y: String(a.games), d: null },
      { label: 'Errores graves por 100 jugadas', x: fix(b.ratePer100, 1), y: fix(a.ratePer100, 1), d: diff(b.ratePer100, a.ratePer100, 1) },
      { label: 'Pérdida media por jugada (peones)', x: fix(cp(b), 2), y: fix(cp(a), 2), d: diff(cp(b), cp(a), 2) },
    ],
    warn: a.games < PROFILE_MIN_AFTER ? `Solo ${a.games} partidas después del corte: aún son pocas para sacar conclusiones (conviene llegar a ${PROFILE_MIN_AFTER}).` : '',
  };
}

function view(b: Profile, cut: string) {
  const notes: string[] = [];
  if (b.pending) notes.push(b.pending + ' partidas sin analizar');
  if (b.invalid) notes.push(b.invalid + ' no se pudieron evaluar');
  if (b.unknownVersion) notes.push(b.unknownVersion + ' con un formato que este panel no entiende');
  const common = {
    context: !b.analysed ? 'Calculado con Stockfish sobre tus partidas guardadas.'
      : `Calculado con Stockfish sobre ${b.analysed} partidas` + (b.bots?.share != null ? ` (${Math.round(100 * b.bots.share)} % contra bots; no describe cómo juegas contra personas)` : '') + '. Son cifras descriptivas, no una nota de nivel.',
    sinceNote: cut && !b.since ? 'No encontré esa partida con fecha: se muestra todo sin dividir.' : '',
    note: 'Error grave: jugada que cuesta 3 peones o más (300 cp) según Stockfish a profundidad 12. Son tasas descriptivas, sin intervalo: los errores de una partida no son independientes.' +
      (notes.length ? ' Fuera de las cifras: ' + notes.join(' · ') + '.' : ''),
  };
  if (!b.analysed) return { ...common, a: null };
  const a = b.all, d = a.decisive, c = a.conversion, dc = d.competitive || d, dd = d.disconnection || null;
  const maxP = Math.max(...PHASES.map(([k]) => a.byPhase[k].ratePer100 || 0), ...(['white', 'black'] as const).map((k) => a.byColor[k].ratePer100 || 0));
  const bl = b.blocks ?? [], maxB = Math.max(0, ...bl.map((x) => x.ratePer100 || 0));
  const dn = dc.byPhase.opening + dc.byPhase.middlegame + dc.byPhase.endgame;
  const conv = (label: string, x: Tally) => {
    const p = (n: number) => x.games ? Math.round(100 * n / x.games) : 0;
    return { label, games: x.games, w: p(x.win), d: p(x.draw), l: p(x.loss), won: `Ganadas ${pct(x.win, x.games)} (${x.win})`, draw: 'Tablas ' + x.draw, lost: 'Perdidas ' + x.loss };
  };
  return {
    ...common,
    a: {
      kpis: [
        { label: 'Errores graves', value: per100(a.ratePer100), sub: `por 100 jugadas · ${a.serious} de ${a.moves}` },
        { label: 'Pérdida media', value: pawns(a.acpl), sub: `peones por jugada · ${Math.round(a.acpl ?? NaN)} cp` },
        { label: 'Derrotas con momento decisivo', value: pct(dc.withDecisive, dc.lossGames),
          sub: (dc.lossGames ? `${dc.withDecisive} de ${dc.lossGames} derrotas sin desconexión` : 'sin derrotas fuera de las desconexiones') + (dd?.lossGames ? ` · ${dd.lossGames} por desconexión aparte` : '') },
        { label: 'Ventajas sostenidas ganadas', value: pct(c.advantage.win, c.advantage.games), sub: `${c.advantage.win} de ${c.advantage.games} · ${c.thrown} perdidas` },
      ],
      verdict: verdict(a),
      phases: PHASES.map(([k, l]) => bar(l, a.byPhase[k].ratePer100, maxP, `${a.byPhase[k].serious} de ${a.byPhase[k].moves}`)),
      colors: ([['white', 'Blancas'], ['black', 'Negras']] as const).map(([k, l]) => bar(l, a.byColor[k].ratePer100, maxP, `${a.byColor[k].serious} de ${a.byColor[k].moves}`)),
      trend: bl.length > 1 ? {
        cols: bl.map((x, i) => ({
          partial: !!x.partial, h: maxB > 0 && x.ratePer100 != null ? Math.max(3, Math.round(100 * x.ratePer100 / maxB)) : 0,
          title: `Partidas ${i * 50 + 1}–${i * 50 + x.games}: ${per100(x.ratePer100)} por 100 jugadas (${x.serious} de ${x.moves} jugadas)` + (x.partial ? ' · bloque incompleto' : ''),
        })),
        first: 'Primeras partidas · ' + per100(bl[0].ratePer100),
        last: 'Últimas · ' + per100(bl[bl.length - 1].ratePer100) + (bl[bl.length - 1].partial ? ' (incompleto)' : ''),
      } : null,
      decisive: !d.lossGames ? null : {
        competitive: dc.lossGames ? {
          head: `${dc.withDecisive} de ${dc.lossGames}`,
          tail: ' derrotas sin desconexión tienen un momento decisivo' + (dc.medianMove == null ? '' : `, a la mitad de los casos antes de tu jugada ${dc.medianMove}`) + '.',
          bars: PHASES.map(([k, l]) => ({ label: l, w: dn ? Math.round(100 * dc.byPhase[k] / dn) : 0, pct: pct(dc.byPhase[k], dn), n: dc.byPhase[k] + ' partidas' })),
        } : null,
        apart: dd?.lossGames ? { n: dd.lossGames, with: dd.withDecisive } : null,
      },
      conversion: [conv('Con ventaja de más de 3 peones', c.advantage), conv('Con desventaja de más de 3 peones', c.disadvantage)],
      worst: (b.review.worst ?? []).map(gameRow),
      best: (b.review.best ?? []).map(gameRow),
      cut: b.before && b.after ? compare(b.before, b.after) : null,
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './engine-profile.component.html',
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
