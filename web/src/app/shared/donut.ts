import { Component, computed, input } from '@angular/core';
import { pc1 } from '../core/format';

/** Port of legacy donut(w, l, d): results ring plus legend and score (win 1, draw 0,5). */
@Component({
  selector: 'm-donut',
  template: `
    <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
      <svg width="96" height="96" viewBox="0 0 72 72">
        <circle r="16" cx="36" cy="36" fill="transparent" stroke="var(--line)" stroke-width="8" />
        @for (s of segs(); track s.k) {
          <circle r="16" cx="36" cy="36" fill="transparent" [attr.stroke]="s.c" stroke-width="8"
            [attr.stroke-dasharray]="s.dash" [attr.stroke-dashoffset]="s.off" transform="rotate(-90 36 36)" />
        }
      </svg>
      <div>
        <div style="font-size:var(--fs-display);font-weight:800">{{ score() }} % <span class="muted" style="font-weight:400;font-size:var(--fs-md)">score</span></div>
        <div class="legend">
          @for (s of segs(); track s.k) {<span><i class="dot" [style.background]="s.c"></i>{{ s.legend }}</span>}
        </div>
      </div>
    </div>
  `,
})
export class Donut {
  readonly wins = input.required<number>();
  readonly losses = input.required<number>();
  readonly draws = input.required<number>();

  private readonly total = computed(() => this.wins() + this.losses() + this.draws() || 1);
  protected readonly score = computed(() => ((this.wins() + 0.5 * this.draws()) / this.total() * 100).toFixed(1).replace('.', ','));
  protected readonly segs = computed(() => {
    let acc = 0;
    return [
      { v: this.wins(), c: 'var(--ok)', k: 'Victorias' },
      { v: this.losses(), c: 'var(--err)', k: 'Derrotas' },
      { v: this.draws(), c: 'var(--neutral)', k: 'Tablas' },
    ].map((s) => {
      const dash = (s.v / this.total() * 100).toFixed(2);
      const off = (100 - acc).toFixed(2);
      acc += parseFloat(dash);
      return { ...s, dash: `${dash} ${100 - parseFloat(dash)}`, off, legend: `${s.k} ${s.v} · ${pc1(s.v / this.total() * 100)}` };
    });
  });
}
