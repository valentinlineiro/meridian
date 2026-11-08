import { Component, computed, input } from '@angular/core';
import { fmtDate } from '../../core/format';
import { beatText, Bucket, effText } from './games.model';

const W = 320, L = 34, R = 8;
const f = (v: number) => v.toFixed(1);
type Pt = { cx: string; cy: string; title: string };

/**
 * Port of gamesChartSvg (src/dashboard.client.js:1885–1904), drawn with template bindings: efficiency (top) and the
 * beat-the-average rate (middle) on the same X axis, plus n per bucket (bars). Raw bucket values, no smoothing; a bucket
 * with no observations has no point and no bar, so the gap stays visible. The server builds the dense axis.
 */
export function chartGeometry(b: readonly Bucket[]) {
  const x = (i: number) => b.length < 2 ? L + (W - L - R) / 2 : L + i * (W - L - R) / (b.length - 1);
  const effs = b.filter((p) => p.eff != null).map((p) => p.eff!);
  if (!effs.length) return null;
  let lo = Math.min(1, ...effs), hi = Math.max(1, ...effs);
  if (hi - lo < .2) { hi += .1; lo -= .1; }
  const ya = (v: number) => 10 + (hi - v) / (hi - lo) * 60, yb = (v: number) => 95 + (1 - v) * 45, maxN = Math.max(...b.map((p) => p.n), 1);
  const series = (key: 'eff' | 'beat', yf: (v: number) => number, fmt: (v: number) => string) => {
    const lines: string[] = [], dots: Pt[] = [];
    let seg: [number, number][] = [];
    const flush = () => { if (seg.length > 1) lines.push(seg.map((p) => f(p[0]) + ',' + f(p[1])).join(' ')); seg = []; };
    b.forEach((p, i) => {
      const v = p[key];
      if (v == null) { flush(); return; }
      seg.push([x(i), yf(v)]);
      dots.push({ cx: f(x(i)), cy: f(yf(v)), title: p.start + ' · n=' + p.n + ' · ' + fmt(v) });
    });
    flush();
    return { lines, dots };
  };
  // ponytail: tick labels take the decimal comma (legacy toFixed gave "×1.3").
  const tick = (v: number) => '×' + v.toFixed(1).replace('.', ',');
  return {
    W, L, xr: W - R, viewBox: '0 0 ' + W + ' 196',
    y1: f(ya(1)), hiY: f(ya(hi) + 3), loY: f(ya(lo) + 3), y1t: f(ya(1) + 3), hi: tick(hi), lo: tick(lo), mid: f(yb(.5)),
    eff: series('eff', ya, effText), beat: series('beat', yb, (v) => beatText(v)),
    bars: b.flatMap((p, i) => p.n ? [{ x: f(x(i) - 1.5), y: f(178 - p.n / maxN * 22), h: f(p.n / maxN * 22), title: p.start + ' · n=' + p.n }] : []),
    first: fmtDate(b[0].start), last: fmtDate(b[b.length - 1].start),
  };
}

@Component({
  selector: 'app-games-chart',
  template: `
    @if (g(); as c) {
      <svg class="gchart" [attr.viewBox]="c.viewBox" role="img" aria-label="Evolución de la eficiencia y del porcentaje que gana a la media, con el n de cada punto. Los mismos datos están en la tabla siguiente.">
        <line [attr.x1]="c.L" [attr.x2]="c.xr" [attr.y1]="c.y1" [attr.y2]="c.y1" stroke="#1e2e44" stroke-width="1" stroke-dasharray="3 3" />
        <text x="2" [attr.y]="c.hiY" fill="#8ea0b8" font-size="8">{{ c.hi }}</text><text x="2" [attr.y]="c.loY" fill="#8ea0b8" font-size="8">{{ c.lo }}</text><text x="2" [attr.y]="c.y1t" fill="#8ea0b8" font-size="8">×1</text>
        @for (l of c.eff.lines; track $index) {<polyline [attr.points]="l" fill="none" stroke="#7aa7e6" stroke-width="1.5" />}
        @for (p of c.eff.dots; track $index) {<circle [attr.cx]="p.cx" [attr.cy]="p.cy" r="2.4" fill="#7aa7e6"><title>{{ p.title }}</title></circle>}
        <line [attr.x1]="c.L" [attr.x2]="c.xr" [attr.y1]="c.mid" [attr.y2]="c.mid" stroke="#1e2e44" stroke-width="1" stroke-dasharray="3 3" />
        <text x="2" y="98" fill="#8ea0b8" font-size="8">100 %</text><text x="2" y="143" fill="#8ea0b8" font-size="8">0 %</text>
        @for (l of c.beat.lines; track $index) {<polyline [attr.points]="l" fill="none" stroke="#2ea043" stroke-width="1.5" />}
        @for (p of c.beat.dots; track $index) {<circle [attr.cx]="p.cx" [attr.cy]="p.cy" r="2.4" fill="#2ea043"><title>{{ p.title }}</title></circle>}
        <line [attr.x1]="c.L" [attr.x2]="c.xr" y1="178" y2="178" stroke="#1e2e44" stroke-width="1" /><text x="2" y="176" fill="#8ea0b8" font-size="8">n</text>
        @for (r of c.bars; track $index) {<rect [attr.x]="r.x" [attr.y]="r.y" width="3" [attr.height]="r.h" fill="#6e7a8e"><title>{{ r.title }}</title></rect>}
        <text [attr.x]="c.L" y="192" fill="#8ea0b8" font-size="8">{{ c.first }}</text><text [attr.x]="c.xr" y="192" fill="#8ea0b8" font-size="8" text-anchor="end">{{ c.last }}</text>
      </svg>
    } @else {
      <div class="muted">Sin observaciones con media en este periodo.</div>
    }
  `,
})
export class GamesChart {
  readonly buckets = input.required<readonly Bucket[]>();
  protected readonly g = computed(() => chartGeometry(this.buckets()));
}
