import { afterNextRender, Component, computed, DestroyRef, ElementRef, inject, input, signal } from '@angular/core';
import { fmtDate } from '../../core/format';
import { speedWords } from '../../core/words';
import { Bucket } from './games.model';

const L = 40, R = 8, DEFAULT_W = 320, MIN_W = 300, MAX_W = 1100;
const f = (v: number) => v.toFixed(1);
type Pt = { cx: string; cy: string; title: string };

/**
 * Port of gamesChartSvg (src/dashboard.client.js:1885–1904), drawn with template bindings: efficiency (top) and the
 * beat-the-average rate (middle) on the same X axis, plus n per bucket (bars). Raw bucket values, no smoothing; a bucket
 * with no observations has no point and no bar, so the gap stays visible. The server builds the dense axis.
 */
/** W is the drawing width in px (1 viewBox unit = 1 px), so the plot uses the whole card at any screen size. */
export function chartGeometry(b: readonly Bucket[], W = DEFAULT_W) {
  const x = (i: number) => b.length < 2 ? L + (W - L - R) / 2 : L + i * (W - L - R) / (b.length - 1);
  const effs = b.filter((p) => p.eff != null).map((p) => p.eff!);
  if (!effs.length) return null;
  let lo = Math.min(1, ...effs), hi = Math.max(1, ...effs);
  if (hi - lo < .2) { hi += .1; lo -= .1; }
  const ya = (v: number) => 10 + (hi - v) / (hi - lo) * 60, yb = (v: number) => 95 + (1 - v) * 45, maxN = Math.max(...b.map((p) => p.n), 1);
  const bw = b.length < 2 ? 6 : Math.max(3, Math.min(10, (W - L - R) / (b.length - 1) * .55));
  const series = (key: 'eff' | 'beat', yf: (v: number) => number, fmt: (v: number) => string) => {
    const lines: string[] = [], dots: Pt[] = [];
    let seg: [number, number][] = [];
    const flush = () => { if (seg.length > 1) lines.push(seg.map((p) => f(p[0]) + ',' + f(p[1])).join(' ')); seg = []; };
    b.forEach((p, i) => {
      const v = p[key];
      if (v == null) { flush(); return; }
      seg.push([x(i), yf(v)]);
      dots.push({ cx: f(x(i)), cy: f(yf(v)), title: p.start + ' · ' + p.n + (p.n === 1 ? ' partida' : ' partidas') + ' · ' + fmt(v) });
    });
    flush();
    return { lines, dots };
  };
  return {
    W, L, bw: f(bw), xr: W - R, viewBox: '0 0 ' + W + ' 196',
    showHi: ya(1) - ya(hi) > 11, showLo: ya(lo) - ya(1) > 11,
    y1: f(ya(1)), hiY: f(ya(hi) + 3), loY: f(ya(lo) + 3), y1t: f(ya(1) + 3), mid: f(yb(.5)),
    eff: series('eff', ya, (v) => 'frente a la media: ' + speedWords(v)), beat: series('beat', yb, (v) => 'le ganas a la media en el ' + Math.round(v * 100) + ' %'),
    bars: b.flatMap((p, i) => p.n ? [{ x: f(x(i) - bw / 2), y: f(178 - p.n / maxN * 22), h: f(p.n / maxN * 22), title: p.start + ' · ' + p.n + (p.n === 1 ? ' partida' : ' partidas') }] : []),
    first: fmtDate(b[0].start), last: fmtDate(b[b.length - 1].start),
  };
}

@Component({
  selector: 'app-games-chart',
  host: { style: 'display:block' },
  template: `
    @if (g(); as c) {
      <svg class="gchart" [attr.viewBox]="c.viewBox" role="img" aria-label="Evolución de lo rápido que vas frente a la media y de los días que le ganas, con las partidas de cada punto. Los mismos datos están en la tabla siguiente.">
        <line [attr.x1]="c.L" [attr.x2]="c.xr" [attr.y1]="c.y1" [attr.y2]="c.y1" stroke="var(--line)" stroke-width="1" stroke-dasharray="3 3" />
        @if (c.showHi) {<text x="2" [attr.y]="c.hiY" fill="var(--muted)" font-size="11">rápido</text>}@if (c.showLo) {<text x="2" [attr.y]="c.loY" fill="var(--muted)" font-size="11">lento</text>}<text x="2" [attr.y]="c.y1t" fill="var(--muted)" font-size="11">media</text>
        @for (l of c.eff.lines; track $index) {<polyline [attr.points]="l" fill="none" stroke="var(--link)" stroke-width="1.5" />}
        @for (p of c.eff.dots; track $index) {<circle [attr.cx]="p.cx" [attr.cy]="p.cy" r="3" fill="var(--link)"><title>{{ p.title }}</title></circle>}
        <line [attr.x1]="c.L" [attr.x2]="c.xr" [attr.y1]="c.mid" [attr.y2]="c.mid" stroke="var(--line)" stroke-width="1" stroke-dasharray="3 3" />
        <text x="2" y="98" fill="var(--muted)" font-size="11">todos</text><text x="2" y="143" fill="var(--muted)" font-size="11">ninguno</text>
        @for (l of c.beat.lines; track $index) {<polyline [attr.points]="l" fill="none" stroke="var(--ok)" stroke-width="1.5" />}
        @for (p of c.beat.dots; track $index) {<circle [attr.cx]="p.cx" [attr.cy]="p.cy" r="3" fill="var(--ok)"><title>{{ p.title }}</title></circle>}
        <line [attr.x1]="c.L" [attr.x2]="c.xr" y1="178" y2="178" stroke="var(--line)" stroke-width="1" /><text x="2" y="176" fill="var(--muted)" font-size="9">partidas</text>
        @for (r of c.bars; track $index) {<rect [attr.x]="r.x" [attr.y]="r.y" [attr.width]="c.bw" [attr.height]="r.h" fill="var(--neutral)"><title>{{ r.title }}</title></rect>}
        <text [attr.x]="c.L" y="192" fill="var(--muted)" font-size="11">{{ c.first }}</text><text [attr.x]="c.xr" y="192" fill="var(--muted)" font-size="11" text-anchor="end">{{ c.last }}</text>
      </svg>
    } @else {
      <div class="muted">Sin observaciones con media en este periodo.</div>
    }
  `,
})
export class GamesChart {
  readonly buckets = input.required<readonly Bucket[]>();
  private readonly width = signal(DEFAULT_W);
  protected readonly g = computed(() => chartGeometry(this.buckets(), this.width()));

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement, destroyed = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') return;
      const ro = new ResizeObserver(([e]) => { const w = Math.round(e.contentRect.width); if (w >= MIN_W) this.width.set(Math.min(w, MAX_W)); });
      ro.observe(host);
      destroyed.onDestroy(() => ro.disconnect());
    });
  }
}
