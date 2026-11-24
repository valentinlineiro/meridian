import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api-client';
import { fmtDate } from '../../core/format';
import { agoLabel, isStale } from '../../core/xp-week';
import { StatsService } from '../../core/stats.service';
import { ErrorBlock } from '../../shared/error-block';
import { Help } from '../../shared/help';
import { Segmented } from '../../shared/segmented';
import { Sparkline } from '../../shared/sparkline';
import { RateRows, PointsBars } from './components/rate-bars';
import { eloTrend, PERIODS, periodSummary, PeriodKey, Point, rankPoints, sliceWeeks, sumTally, winRate } from './periods';
import { Weekly } from './weekly.model';

const OPENINGS_SHOWN = 8;
const POINTS_SHOWN = 3;

/** Ajedrez by period: the ELO and its trend, strengths and weaknesses, colour, openings and long games — all from one weekly request. */
@Component({
  selector: 'app-chess-periods',
  imports: [NgTemplateOutlet, Segmented, Sparkline, PointsBars, RateRows, ErrorBlock, Help],
  template: `
    <section id="chessPeriods" aria-labelledby="chessPeriodsH">
      <h2 id="chessPeriodsH" class="sr-only">Tu ajedrez por periodos</h2>
      @if (weekly.isLoading() && !weekly.hasValue()) {
        <span class="sr-only" role="status">Cargando tus periodos</span>
        <div class="hero-card" aria-hidden="true"><i class="sk sk-t"></i><i class="sk sk-n"></i><i class="sk"></i></div>
      } @else if (failed()) {
        <app-error-block message="No pudimos cargar tus periodos de ajedrez." [loading]="weekly.isLoading()" (retry)="weekly.reload()" />
      } @else if (!all().weeks.length) {
        <p class="muted">Aún no hay partidas con fecha para mostrar por periodos.</p>
      } @else {
        <app-segmented groupId="chessPeriodSeg" label="Periodo" caption="Periodo" idPrefix="chessPeriod-" event="chess-period" [options]="periods" [value]="period()" (picked)="period.set($any($event))" />
        <div class="card u-mt-12">
          <div class="u-d-flex u-ai-baseline u-gap-8 u-wrap-wrap">
            <span id="chessPeriodElo" class="hc-big">{{ elo() ?? '—' }}</span><span class="muted u-fs-sm">ELO</span>@if (age(); as a) { <span id="chessAge" class="pill" [class.pill-warn]="a.stale">{{ a.text }}</span> }
            @if (trend().delta !== null) { <span id="chessPeriodDelta" class="u-fwt-700">{{ delta() }}</span><span class="muted u-fs-sm">{{ deltaWhy() }}</span> }
          </div>
          @if (summary().rate !== null) {
            <p id="chessSummary" class="u-mt-8"><b>{{ summaryRate() }} de victorias</b><span class="muted"> en {{ periodLabel() }}</span>@if (summaryDelta(); as d) { <span class="muted"> · {{ d }}</span> }</p>
          }
          @if (eloPoints().length === 1) {
            <p class="muted u-mt-8">Una sola lectura de ELO en este periodo: la tendencia aparecerá con la siguiente.</p>
            <ng-container *ngTemplateOutlet="recent" />
          } @else if (!eloPoints().length) {
            <ng-container *ngTemplateOutlet="recent" />
          } @else if (eloPoints().length > 1) {
            <div class="u-mt-8"><m-sparkline [points]="eloPoints()" /></div>
            @if (eloSince(); as since) { <p id="chessEloSince" class="muted u-fs-sm">ELO observado en las sincronizaciones desde la semana del {{ fmtDate(since) }}; antes no hay lecturas.</p> }
            <details class="u-mt-8"><summary class="dsum">Datos de la gráfica</summary>
              <table id="chessEloTable" class="u-mt-6"><caption class="sr-only">ELO al cierre de cada semana</caption>
                <thead><tr><th scope="col">Semana del</th><th scope="col">ELO</th></tr></thead>
                <tbody>@for (p of eloPoints(); track p.date) { <tr><td>{{ fmtDate(p.date) }}</td><td>{{ p.elo }}</td></tr> }</tbody>
              </table>
            </details>
          }
          @if (games()) {
            <p class="muted u-fs-sm u-mt-8">{{ games() }} partidas con resultado en {{ weeksLabel() }}.</p>
            @if (all().undated.games) { <p id="chessUndated" class="muted u-fs-sm">Además, {{ all().undated.games }} partidas sin fecha que no entran en estas cifras.</p> }
          } @else {
            <p class="muted u-mt-8">Sin partidas en este periodo. Prueba con uno más largo.</p>
          }
        </div>
        @if (games()) {
          <div class="card u-mt-12" id="chessStrengths">
            <h2>Puntos fuertes y débiles</h2>
            @if (!ranked().strong.length && !ranked().weak.length) {
              <p id="chessNoDiff" class="muted">Sin diferencias claras con tu media del periodo ({{ baseline() }}).</p>
            } @else {
            <p class="muted u-fs-sm">Frente a tu porcentaje medio de victorias del periodo ({{ baseline() }}).</p>
            <div class="grid2">
              <div>
                <app-points-bars id="chessStrongTop" title="Puntos fuertes" [points]="strongSplit().top" [scale]="scale()" empty="Ninguna diferencia clara con tu media." />
                @if (strongSplit().rest.length) {
                  <details id="chessStrongRest" class="u-mt-6"><summary class="dsum">Otros {{ strongSplit().rest.length }} puntos fuertes</summary>
                    <app-points-bars title="" [points]="strongSplit().rest" [scale]="scale()" empty="" />
                  </details>
                }
              </div>
              <div>
                <app-points-bars id="chessWeakTop" title="Puntos débiles" [points]="weakSplit().top" [scale]="scale()" empty="Ninguna diferencia clara con tu media." />
                @if (weakSplit().rest.length) {
                  <details id="chessWeakRest" class="u-mt-6"><summary class="dsum">Otros {{ weakSplit().rest.length }} puntos débiles</summary>
                    <app-points-bars title="" [points]="weakSplit().rest" [scale]="scale()" empty="" />
                  </details>
                }
              </div>
            </div>
            }
            <app-help label="Cómo se decide" helpId="chessStrengthsHelp">Un punto se señala solo si el intervalo de confianza del 95 % de su porcentaje queda entero por encima o por debajo de tu media del periodo, y con {{ min }} partidas o más. Con diez partidas, +4 puntos puede ser casualidad.</app-help>
          </div>
          <details id="chessDetail" class="card u-mt-12">
            <summary class="dsum dsum-main">Ver detalle: color, aperturas y partidas largas</summary>
            <div id="chessColorOpenings">
              <app-rate-rows title="Por color" [points]="byKind('color')" empty="Sin partidas con color." />
              <app-rate-rows id="chessOpeningsTop" title="Aperturas" [points]="openingsSplit().top" empty="Sin aperturas identificadas en este periodo." />
              @if (openingsSplit().rest.length) {
                <details id="chessOpeningsRest" class="u-mt-6"><summary class="dsum">Otras {{ openingsSplit().rest.length }} aperturas, menos jugadas</summary>
                  <app-rate-rows title="" [points]="openingsSplit().rest" empty="" />
                </details>
              }
              <app-rate-rows id="chessLong" title="Partidas largas" [points]="longRows()" empty="Sin partidas largas en este periodo." />
            </div>
          </details>
        }
      }
    </section>
    <ng-template #recent>
      @if (last5().length) {
        <p id="chessLast5" class="u-mt-8"><span class="muted">Últimas {{ last5().length }} partidas </span>@for (r of last5(); track $index) {<span [class]="r.cls">{{ r.label }}</span> }</p>
      }
    </ng-template>
  `,
})
export class ChessPeriods {
  private readonly api = inject(ApiClient);
  private readonly stats = inject(StatsService);
  protected readonly periods = PERIODS;
  protected readonly min = 8;
  protected readonly fmtDate = fmtDate;
  protected readonly period = signal<PeriodKey>('90d');
  protected readonly weekly = rxResource<Weekly | null, unknown>({
    stream: () => this.api.get<Weekly>('/api/stats/weekly').pipe(catchError(() => of(null))),
  });
  constructor() {
    // The header's "actualizado": it comes with the weekly answer, so the page asks for nothing else to say it.
    effect(() => { const at = this.weekly.value()?.syncedAt; if (at) this.stats.chessUpdated.set('Ajedrez · actualizado ' + agoLabel(at)); });
  }

  /** With fewer than two ELO readings the period has no trend to show: the latest games say how it is going instead. Asked only then. */
  private readonly needRecent = computed(() => !this.failed() && this.weekly.hasValue() && this.all().weeks.length > 0 && this.eloPoints().length < 2);
  private readonly recentRes = rxResource<{ rows?: { result?: string | null; outcome?: string | null }[] } | null, boolean | undefined>({
    params: () => this.needRecent() || undefined,
    stream: () => this.api.get<{ rows?: { result?: string | null; outcome?: string | null }[] }>('/api/matches', { limit: 5 }).pipe(catchError(() => of(null))),
  });
  protected readonly last5 = computed(() => (this.recentRes.value()?.rows ?? []).slice(0, 5).map((m) => {
    const r = (m.result || m.outcome || '').toLowerCase();
    return r.includes('win') || r === 'won' ? { cls: 'pill pill-win', label: 'Victoria' } : r.includes('los') || r.includes('defeat') ? { cls: 'pill pill-loss', label: 'Derrota' } : r.includes('draw') || r.includes('tie') ? { cls: 'pill pill-draw', label: 'Tablas' } : null;
  }).filter((x): x is { cls: string; label: string } => x !== null));
  protected readonly failed = computed(() => !this.weekly.isLoading() && (!this.weekly.hasValue() || this.weekly.value() === null));
  protected readonly all = computed(() => this.weekly.value() ?? { weeks: [], undated: { games: 0, w: 0, d: 0, l: 0, u: 0, disconnections: 0 } });
  protected readonly slice = computed(() => sliceWeeks(this.all().weeks, this.period(), new Date()));
  protected readonly trend = computed(() => eloTrend(this.slice().current, this.slice().previous));
  /** The ELO the period ends on; a period without ELO shows the latest known one. */
  protected readonly elo = computed(() => this.trend().now ?? this.all().weeks.map((w) => w.eloEnd).filter((e) => e != null).at(-1) ?? null);
  protected readonly delta = computed(() => { const d = this.trend().delta ?? 0; return `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d)}`; });
  protected readonly deltaWhy = computed(() => this.slice().previous.some((w) => w.eloEnd != null) ? 'frente al cierre del periodo anterior' : 'desde la primera lectura del periodo');
  protected readonly eloPoints = computed(() => this.slice().current.filter((w) => w.eloEnd != null).map((w) => ({ date: w.week, elo: w.eloEnd as number })));
  /** The first week with an ELO reading when the period reaches back before it (readings only exist since the first sync). */
  protected readonly eloSince = computed(() => {
    const first = this.all().weeks.find((w) => w.eloEnd != null)?.week;
    const start = this.slice().current[0]?.week;
    return first && start && start < first ? first : null;
  });
  protected readonly ranked = computed(() => rankPoints(this.slice().current));
  protected readonly summary = computed(() => periodSummary(this.slice().current, this.slice().previous));
  /** How old the data behind the figures is, said where the figures are (a stale pill past two days, never a stale number read as current). */
  protected readonly age = computed(() => { const at = this.weekly.value()?.syncedAt; return at ? { text: 'sincronizado ' + agoLabel(at), stale: isStale(at, Date.now()) } : null; });
  protected readonly periodLabel = computed(() => PERIODS.find((p) => p.k === this.period())?.l.toLowerCase() ?? '');
  protected readonly summaryRate = computed(() => `${Math.round((this.summary().rate ?? 0) * 100)} %`);
  protected readonly summaryDelta = computed(() => { const d = this.summary().delta; if (d === null) return null; const r = Math.round(d); return r === 0 ? 'igual que el periodo anterior' : `${r > 0 ? '+' : '−'}${Math.abs(r)} pts frente al periodo anterior`; });
  /** One bar scale for strengths and weaknesses, so a folded row is never drawn longer than a visible one that beat it. */
  protected readonly scale = computed(() => Math.max(1, ...[...this.ranked().strong, ...this.ranked().weak].map((p) => Math.abs(p.delta))));
  protected readonly strongSplit = computed(() => ({ top: this.ranked().strong.slice(0, POINTS_SHOWN), rest: this.ranked().strong.slice(POINTS_SHOWN) }));
  protected readonly weakSplit = computed(() => ({ top: this.ranked().weak.slice(0, POINTS_SHOWN), rest: this.ranked().weak.slice(POINTS_SHOWN) }));
  protected byKind(kind: Point['kind']): Point[] { return this.ranked().all.filter((p) => p.kind === kind).sort((a, b) => b.rate - a.rate); }
  /** The eight most played openings (they carry the evidence), still ordered by win rate; the rarer ones fold away. */
  protected readonly openingsSplit = computed(() => {
    const all = this.byKind('opening');
    if (all.length <= OPENINGS_SHOWN) return { top: all, rest: [] as Point[] };
    const keep = new Set([...all].sort((a, b) => b.n - a.n).slice(0, OPENINGS_SHOWN));
    return { top: all.filter((p) => keep.has(p)), rest: all.filter((p) => !keep.has(p)) };
  });
  /** The block is titled "Partidas largas"; its one row says what that means. */
  protected readonly longRows = computed(() => this.byKind('long').map((p) => ({ ...p, label: 'Más de 80 jugadas' })));
  protected readonly games = computed(() => this.slice().current.reduce((n, w) => n + w.games, 0));
  protected readonly weeksLabel = computed(() => { const n = this.slice().current.length; return `${n} ${n === 1 ? 'semana' : 'semanas'}`; });
  protected readonly baseline = computed(() => { const r = winRate(sumTally(this.slice().current.map((w) => w.total)), true).rate; return r === null ? '—' : `${Math.round(r * 100)} %`; });
}
