import { Component, computed, input } from '@angular/core';

export interface EloPoint { date: string; elo: number }

const W = 520, H = 90, PAD = 10;

/** Port of legacy sparkline(points): ELO line over time; one point is shown as the first snapshot. */
@Component({
  selector: 'm-sparkline',
  template: `
    @let ps = points();
    @if (!ps.length) {
      <div class="muted">Sin datos</div>
    } @else if (ps.length === 1) {
      <div style="min-height:96px;display:flex;flex-direction:column;justify-content:center">
        <div style="font-size:var(--fs-display);font-weight:800;line-height:1">{{ ps[0].elo }}</div>
        <div class="muted u-mt-4">Primera lectura · {{ firstLabel() }}</div>
        <div class="muted" style="margin-top:8px;font-style:italic">La evolución aparecerá cuando haya más días de datos.</div>
      </div>
    } @else {
      @let c = chart()!;
      <svg class="u-d-block" [attr.viewBox]="'0 0 ' + W + ' ' + H" width="100%" height="96">
        <path [attr.d]="c.area" fill="#1f6feb18" stroke="none" />
        <path [attr.d]="c.line" fill="none" stroke="var(--info)" stroke-width="1.8" stroke-linejoin="round" />
        <text [attr.x]="PAD" y="12" fill="var(--muted)" font-size="10">{{ c.max }}</text>
        <text [attr.x]="PAD" [attr.y]="H - 2" fill="var(--muted)" font-size="10">{{ c.min }}</text>
      </svg>
      <div class="muted u-d-flex u-jc-space-between"><span>{{ ps[0].date }}</span><span>{{ ps[ps.length - 1].date }}</span></div>
    }
  `,
})
export class Sparkline {
  readonly points = input.required<readonly EloPoint[]>();
  protected readonly W = W;
  protected readonly H = H;
  protected readonly PAD = PAD;

  protected readonly firstLabel = computed(() =>
    new Date(this.points()[0].date + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }));

  protected readonly chart = computed(() => {
    const ps = this.points();
    if (ps.length < 2) return null;
    const xs = ps.map((_, i) => PAD + i / (ps.length - 1) * (W - PAD * 2));
    const elos = ps.map((p) => p.elo);
    const min = Math.min(...elos), max = Math.max(...elos);
    const span = Math.max(5, max - min);
    const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);
    const line = ps.map((p, i) => (i ? 'L' : 'M') + xs[i].toFixed(1) + ' ' + y(p.elo).toFixed(1)).join(' ');
    const area = `${line} L${xs[xs.length - 1].toFixed(1)} ${H - PAD} L${xs[0].toFixed(1)} ${H - PAD} Z`;
    return { line, area, min, max };
  });
}
