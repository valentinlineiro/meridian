import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api-client';
import { fmtDate } from '../../core/format';
import { ErrorBlock } from '../../shared/error-block';
import { Segmented } from '../../shared/segmented';
import { Sparkline } from '../../shared/sparkline';
import { RateRows, PointsBars } from './components/rate-bars';
import { eloTrend, PERIODS, PeriodKey, Point, rankPoints, sliceWeeks, sumTally, winRate } from './periods';
import { Weekly } from './weekly.model';

/** Ajedrez by period: the ELO and its trend, strengths and weaknesses, colour, openings and long games — all from one weekly request. */
@Component({
  selector: 'app-chess-periods',
  imports: [Segmented, Sparkline, PointsBars, RateRows, ErrorBlock],
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
        <app-segmented groupId="chessPeriodSeg" label="Periodo" caption="Periodo" idPrefix="chessPeriod-" [options]="periods" [value]="period()" (picked)="period.set($any($event))" />
        <div class="card u-mt-12">
          <div class="u-d-flex u-ai-baseline u-gap-8 u-wrap-wrap">
            <span id="chessPeriodElo" class="hc-big">{{ elo() ?? '—' }}</span><span class="muted u-fs-sm">ELO</span>
            @if (trend().delta !== null) { <span id="chessPeriodDelta" class="u-fwt-700">{{ delta() }}</span><span class="muted u-fs-sm">{{ deltaWhy() }}</span> }
          </div>
          @if (eloPoints().length === 1) {
            <p class="muted u-mt-8">Una sola lectura de ELO en este periodo: la tendencia aparecerá con la siguiente.</p>
          } @else if (eloPoints().length > 1) {
            <div class="u-mt-8"><m-sparkline [points]="eloPoints()" /></div>
            <details class="u-mt-8"><summary class="dsum">Datos de la gráfica</summary>
              <table id="chessEloTable" class="u-mt-6"><caption class="sr-only">ELO al cierre de cada semana</caption>
                <thead><tr><th scope="col">Semana del</th><th scope="col">ELO</th></tr></thead>
                <tbody>@for (p of eloPoints(); track p.date) { <tr><td>{{ fmtDate(p.date) }}</td><td>{{ p.elo }}</td></tr> }</tbody>
              </table>
            </details>
          }
          @if (games()) {
            <p class="muted u-fs-sm u-mt-8">{{ games() }} partidas con resultado en {{ weeksLabel() }}.</p>
          } @else {
            <p class="muted u-mt-8">Sin partidas en este periodo. Prueba con uno más largo.</p>
          }
        </div>
        @if (games()) {
          <div class="card u-mt-12" id="chessStrengths">
            <h2>Puntos fuertes y débiles</h2>
            <p class="muted u-fs-sm">Frente a tu porcentaje medio de victorias del periodo ({{ baseline() }}). Solo con {{ min }} partidas o más.</p>
            <div class="grid2">
              <app-points-bars title="Puntos fuertes" [points]="ranked().strong" empty="Nada destaca todavía." />
              <app-points-bars title="Puntos débiles" [points]="ranked().weak" empty="Nada destaca todavía." />
            </div>
          </div>
          <div class="card u-mt-12" id="chessColorOpenings">
            <app-rate-rows title="Por color" [points]="byKind('color')" empty="Sin partidas con color." />
            <app-rate-rows title="Aperturas" [points]="openings()" empty="Sin aperturas identificadas en este periodo." />
            <app-rate-rows title="Partidas largas (más de 80 jugadas)" [points]="byKind('long')" empty="Sin partidas largas en este periodo." />
          </div>
        }
      }
    </section>
  `,
})
export class ChessPeriods {
  private readonly api = inject(ApiClient);
  protected readonly periods = PERIODS;
  protected readonly min = 8;
  protected readonly fmtDate = fmtDate;
  protected readonly period = signal<PeriodKey>('90d');
  protected readonly weekly = rxResource<Weekly | null, unknown>({
    stream: () => this.api.get<Weekly>('/api/stats/weekly').pipe(catchError(() => of(null))),
  });
  protected readonly failed = computed(() => !this.weekly.isLoading() && (!this.weekly.hasValue() || this.weekly.value() === null));
  protected readonly all = computed(() => this.weekly.value() ?? { weeks: [], undated: { games: 0, w: 0, d: 0, l: 0, u: 0, disconnections: 0 } });
  protected readonly slice = computed(() => sliceWeeks(this.all().weeks, this.period(), new Date()));
  protected readonly trend = computed(() => eloTrend(this.slice().current, this.slice().previous));
  /** The ELO the period ends on; a period without ELO shows the latest known one. */
  protected readonly elo = computed(() => this.trend().now ?? this.all().weeks.map((w) => w.eloEnd).filter((e) => e != null).at(-1) ?? null);
  protected readonly delta = computed(() => { const d = this.trend().delta ?? 0; return `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d)}`; });
  protected readonly deltaWhy = computed(() => this.slice().previous.some((w) => w.eloEnd != null) ? 'frente al cierre del periodo anterior' : 'desde la primera lectura del periodo');
  protected readonly eloPoints = computed(() => this.slice().current.filter((w) => w.eloEnd != null).map((w) => ({ date: w.week, elo: w.eloEnd as number })));
  protected readonly ranked = computed(() => rankPoints(this.slice().current));
  private readonly everyPoint = computed(() => { const r = this.ranked(); return [...r.strong, ...r.weak, ...r.sparse]; });
  protected byKind(kind: Point['kind']): Point[] { return this.everyPoint().filter((p) => p.kind === kind).sort((a, b) => b.rate - a.rate); }
  protected readonly openings = computed(() => this.byKind('opening'));
  protected readonly games = computed(() => this.slice().current.reduce((n, w) => n + w.games, 0));
  protected readonly weeksLabel = computed(() => { const n = this.slice().current.length; return `${n} ${n === 1 ? 'semana' : 'semanas'}`; });
  protected readonly baseline = computed(() => { const r = winRate(sumTally(this.slice().current.map((w) => w.total)), true).rate; return r === null ? '—' : `${Math.round(r * 100)} %`; });
}
