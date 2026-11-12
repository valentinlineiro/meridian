import { Component, input } from '@angular/core';
import { fmtDate } from '../core/format';

export interface ResultBar { win: boolean; h: number; title: string }
export interface ResultBarsData { bars: ResultBar[]; aria: string }

export const RECENT_RESULTS = 14;
/** A result 50 % away from the average fills its half of the strip; further away is capped, and a near-equal one keeps a stub. */
const FULL = 0.5, MIN_PCT = 8;

/** The last 14 results against the average (eff > 1 is better), as bars whose height is the distance to it. */
export function resultBars(series: { date: string; eff: number }[]): ResultBarsData {
  const bars = series.slice(-RECENT_RESULTS).map((p) => ({
    win: p.eff > 1, h: Math.min(100, Math.max(MIN_PCT, Math.round(Math.abs(p.eff - 1) / FULL * 100))),
    title: fmtDate(p.date) + (p.eff > 1 ? ': mejor que la media' : ': peor que la media'),
  }));
  const wins = bars.filter((b) => b.win).length;
  return { bars, aria: bars.length ? `Últimas ${bars.length} partidas con media: ${wins} mejores que la media y ${bars.length - wins} peores.` : 'Sin partidas con media.' };
}

/** Above the dashed line: better than the LinkedIn average that day; below: worse. Same strip on Games and on Hoy. */
@Component({
  selector: 'app-result-bars',
  template: `<div class="gbars" role="img" [attr.aria-label]="data().aria">@for (d of data().bars; track $index) {<span class="gb" [attr.title]="d.title"><span class="gb-up">@if (d.win) {<i class="bar-win" [style.height.%]="d.h"></i>}</span><span class="gb-dn">@if (!d.win) {<i class="bar-loss" [style.height.%]="d.h"></i>}</span></span>}</div>`,
})
export class ResultBars {
  readonly data = input.required<ResultBarsData>();
}
