import { Component, computed, input } from '@angular/core';
import { MIN_GAMES, Point } from '../periods';

const pct = (rate: number) => `${Math.round(rate * 100)} %`;
const games = (n: number) => `${n} ${n === 1 ? 'partida' : 'partidas'}`;
const signed = (delta: number) => `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(Math.round(delta))} pts`;

/**
 * Points ranked against the period's own average: a bar to the right (above average) or to the left (below). The text carries every
 * value, so the bars are decoration and the list is its own data table.
 */
@Component({
  selector: 'app-points-bars',
  template: `
    @if (title()) { <h3 class="rate-title">{{ title() }}</h3> }
    @if (!points().length) {
      <p class="muted">{{ empty() }}</p>
    } @else {
      <ul class="rate-list">
        @for (r of rows(); track r.p.label) {
          <li class="rate-row">
            <span class="rate-label">{{ r.p.label }}</span>
            <span class="pb-track" aria-hidden="true"><i class="pb-fill" [class.pb-up]="r.p.delta > 0" [class.pb-down]="r.p.delta < 0" [style.width.%]="r.w" [style.left.%]="r.left"></i></span>
            <span class="rate-text"><b>{{ signed(r.p.delta) }}</b> · {{ pct(r.p.rate) }} · {{ games(r.p.n) }}</span>
          </li>
        }
      </ul>
    }
  `,
})
export class PointsBars {
  readonly title = input.required<string>();
  readonly points = input.required<readonly Point[]>();
  readonly empty = input.required<string>();
  /** The largest |delta| the bars are scaled to; lists shown in pieces pass one scale so the pieces stay comparable. */
  readonly scale = input<number>();
  protected readonly pct = pct;
  protected readonly games = games;
  protected readonly signed = signed;
  protected readonly rows = computed(() => {
    const ps = this.points(), max = this.scale() ?? Math.max(1, ...ps.map((p) => Math.abs(p.delta)));
    return ps.map((p) => { const w = Math.abs(p.delta) / max * 50; return { p, w, left: p.delta >= 0 ? 50 : 50 - w }; });
  });
}

/** A win rate per row on a 0–100 % bar; rows under MIN_GAMES are dimmed and say so. */
@Component({
  selector: 'app-rate-rows',
  template: `
    @if (title()) { <h3 class="rate-title">{{ title() }}</h3> }
    @if (!points().length) {
      <p class="muted">{{ empty() }}</p>
    } @else {
      <ul class="rate-list">
        @for (p of points(); track p.label) {
          <li class="rate-row" [class.rate-few]="p.n < min">
            <span class="rate-label">{{ p.label }}</span>
            <span class="bar rate-bar" aria-hidden="true"><i class="bar-win" [style.width.%]="p.rate * 100"></i></span>
            <span class="rate-text"><b>{{ pct(p.rate) }}</b> · {{ games(p.n) }}@if (p.n < min) { · pocas partidas }</span>
          </li>
        }
      </ul>
    }
  `,
})
export class RateRows {
  readonly title = input.required<string>();
  readonly points = input.required<readonly Point[]>();
  readonly empty = input.required<string>();
  protected readonly min = MIN_GAMES;
  protected readonly pct = pct;
  protected readonly games = games;
}
