import { Component, computed, inject, input, output } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';
import { ApiClient } from '../../../core/api-client';
import { colorConclusion } from '../../../core/format';
import { ColorStats, dec1, Group, list, NA, scaleDelta } from '../chess.model';
import { Profile } from './engine-profile';
import { MatchesService } from '../services/matches.service';

interface Evaluation { id: string; status?: string; criteria?: { minDiffPp?: number | null } }
const DENOMINATOR = (n: number) => `Denominador: ${n} partidas guardadas en el historial (elegibles para análisis)`;
const DENOMINATOR_UNKNOWN = 'Denominador: partidas guardadas en el historial (elegibles para análisis)';

/**
 * Port of renderChessPatterns / paintColorConclusion / updateChessEngineCoverage / updateChessPatternSuggested
 * (src/dashboard.client.js:1227–1293). Rates per colour live in «Comparativa»; here only the conclusion, said once.
 */
@Component({
  selector: 'app-patterns',
  template: `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">
      <h2 style="margin:0">Patrones observados &amp; cobertura de análisis</h2>
      <span class="muted" style="font-size:var(--fs-xs)">Intervalos Wilson al 95 % · Muestras explícitas (n)</span>
    </div>
    <div class="grid2" id="chessPatternsGrid" style="margin-top:10px">
      <div class="card" id="chessPatternColorCard" style="margin:0;background:var(--sunken);border:1px solid var(--line)">
        <div style="font-weight:600;font-size:var(--fs-md);color:var(--muted);margin-bottom:4px">Diferencia entre colores</div>
        <div id="chessPatternColorConclusion" style="font-size:var(--fs-sm);margin:4px 0 8px">{{ conclusion() }}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-g" type="button" style="font-size:var(--fs-xs);padding:3px 8px" (click)="color.emit('white')">Blancas</button>
          <button class="btn btn-g" type="button" style="font-size:var(--fs-xs);padding:3px 8px" (click)="color.emit('black')">Negras</button>
        </div>
      </div>
      <div class="card" id="chessPatternEngineCard" style="margin:0;background:var(--sunken);border:1px solid var(--line)">
        <div style="font-weight:600;font-size:var(--fs-md);color:var(--muted);margin-bottom:4px">Cobertura Stockfish</div>
        <div id="chessEngineCoverageVal" style="font-size:var(--fs-xl);font-weight:700">{{ coverage().val }}</div>
        <div id="chessEngineCoverageMeta" class="muted" style="font-size:var(--fs-xs);margin:4px 0 8px">{{ coverage().meta }}</div>
        <div><button class="btn btn-g" type="button" style="font-size:var(--fs-xs);padding:3px 8px" (click)="engine.emit()">Ver análisis de motor ▾</button></div>
      </div>
    </div>
    <div id="chessPatternSuggested" class="muted" style="font-size:var(--fs-xs);margin-top:10px">{{ suggested().text }}@if (suggested().game; as w) {<button type="button" class="btn btn-g btn-sm" (click)="matches.open(w.matchId)">Revisar vs {{ w.opponent || 'Rival' }} ({{ w.serious || 0 }} errores graves)</button>}</div>
  `,
})
export class Patterns {
  protected readonly matches = inject(MatchesService);
  private readonly api = inject(ApiClient);
  /** undefined = not loaded yet; null = that request failed. */
  readonly games = input<number | null | undefined>(undefined);
  readonly colorStats = input<ColorStats | null | undefined>(undefined);
  readonly profile = input<Profile | null | undefined>(undefined);
  readonly color = output<string>();
  readonly engine = output<void>();

  private readonly delta = computed(() => {
    const c = this.colorStats(), g = list<Group>(c?.groups ?? []);
    if (!g) return { known: false, d: null, unreadable: true };
    const wh = g.find((x) => x.key === 'white'), bl = g.find((x) => x.key === 'black');
    return wh && bl && wh.winRate != null && bl.winRate != null ? { known: true, d: scaleDelta(c!.difference, 100), unreadable: false } : { known: false, d: null, unreadable: false };
  });
  // The persistence verdict lives in the trajectory evaluation; it is asked only when there is an interval to qualify.
  private readonly persistence = rxResource<Evaluation | null, true | undefined>({
    params: () => this.delta().d ? true : undefined,
    stream: () => this.api.get<{ evaluations?: Evaluation[] }>('/api/trajectory').pipe(
      map((d) => (d?.evaluations || []).find((e) => e.id === 'CHESS_COLOR_ASYMMETRY_LONGITUDINAL') || null),
      catchError(() => of(null)),
    ),
  });

  protected readonly conclusion = computed(() => {
    const c = this.colorStats();
    if (c === undefined) return '—';
    if (c === null) return NA; // a failed request is not "not enough data"
    const { known, d, unreadable } = this.delta();
    if (unreadable) return NA;
    if (!known) return 'Sin datos de color suficientes';
    const first = colorConclusion(d?.diff, d?.lower, d?.upper, { known: false });
    if (!first || !d) return '';
    if (this.persistence.isLoading() || !this.persistence.hasValue()) return first.line1 + ' · patrón persistente: comprobando…';
    const ev = this.persistence.value();
    const label = `Patrón persistente (≥ ${ev?.criteria?.minDiffPp ?? 15} pp y en ambas mitades)`;
    return first.line1 + ' · ' + colorConclusion(d.diff, d.lower, d.upper, ev ? { met: ev.status === 'emitted', label } : { known: false, label })!.line2;
  });

  protected readonly coverage = computed(() => {
    const b = this.profile(), total = this.games() || 0;
    // still loading is not "0 analysed", and a failed profile is not "analysis pending"
    if (b === undefined || this.games() === undefined) return { val: '—', meta: DENOMINATOR_UNKNOWN };
    if (b === null) return { val: NA, meta: DENOMINATOR_UNKNOWN };
    const analysed = b.analysed || 0;
    if (!analysed) return { val: `0 de ${total} partidas analizadas (0 %)`, meta: 'Análisis pendiente · ' + DENOMINATOR(total) };
    const date = b.observedAt || b.updatedAt || b.analyzedAt;
    return { val: `${analysed} de ${total} partidas analizadas (${total > 0 ? dec1(analysed / total * 100) : '0'} %)`, meta: DENOMINATOR(total) + (date ? ' · observado ' + String(date).slice(0, 10) : '') };
  });

  protected readonly suggested = computed(() => {
    const b = this.profile();
    if (b === undefined) return { text: '', game: null };
    if (b === null) return { text: 'Partida sugerida para revisión: ' + NA, game: null };
    const w = b.review?.worst?.[0];
    return w ? { text: 'Partida sugerida para revisión (mayor pérdida media por jugada): ', game: w }
      : { text: 'Partidas sugeridas para revisión: disponibles tras el análisis de motor.', game: null };
  });
}
