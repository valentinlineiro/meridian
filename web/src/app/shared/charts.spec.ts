import { TestBed } from '@angular/core/testing';
import { Type } from '@angular/core';
import { Kpi } from './kpi';
import { Donut } from './donut';
import { Sparkline } from './sparkline';

// Ports of kpi/donut/sparkline (src/dashboard.client.js:237–277): same markup and classes, so styles.css applies.
const render = async <T,>(type: Type<T>, inputs: Record<string, unknown>) => {
  const fixture = TestBed.createComponent(type);
  for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
};

describe('m-kpi', () => {
  it('shouldRenderLabelValueAndSubWhenGiven', async () => {
    const el = await render(Kpi, { label: 'Score', value: '62,0 %', sub: 'victoria 1 · tablas 0,5' });
    expect(el.classList).toContain('kpi');
    expect(el.innerHTML.replace(/<!--.*?-->/g, '')).toBe('<span class="kl">Score</span><b>62,0 %</b><small>victoria 1 · tablas 0,5</small>');
  });

  it('shouldLeaveSubEmptyWhenMissing', async () => {
    const el = await render(Kpi, { label: 'Partidas', value: '1234' });
    expect(el.querySelector('small')!.textContent).toBe('');
  });

  it('shouldPrintMarkupAsTextWhenTheValueContainsIt', async () => {
    const el = await render(Kpi, { label: 'x', value: '<img src=x>' });
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('b')!.textContent).toBe('<img src=x>');
  });
});

describe('m-donut', () => {
  it('shouldDrawOneArcPerResultAndTheScoreWhenGivenCounts', async () => {
    const el = await render(Donut, { wins: 5, losses: 3, draws: 2 });
    const arcs = [...el.querySelectorAll('circle')].slice(1);
    expect(arcs.map((c) => [c.getAttribute('stroke'), c.getAttribute('stroke-dasharray'), c.getAttribute('stroke-dashoffset')])).toEqual([
      ['var(--ok)', '50.00 50', '100.00'],
      ['var(--err)', '30.00 70', '50.00'],
      ['var(--neutral)', '20.00 80', '20.00'],
    ]);
    expect(el.querySelector('.legend')!.textContent).toBe('Victorias 5 · 50,0 %Derrotas 3 · 30,0 %Tablas 2 · 20,0 %');
    expect(el.textContent).toContain('60,0 % score');
  });

  it('shouldNotDivideByZeroWhenThereAreNoGames', async () => {
    const el = await render(Donut, { wins: 0, losses: 0, draws: 0 });
    expect(el.textContent).toContain('0,0 % score');
    expect(el.textContent).not.toContain('NaN');
  });
});

describe('m-sparkline', () => {
  it('shouldSaySinDatosWhenThereAreNoPoints', async () => {
    const el = await render(Sparkline, { points: [] });
    expect(el.textContent!.trim()).toBe('Sin datos');
  });

  it('shouldShowTheFirstSnapshotWhenThereIsOnePoint', async () => {
    const el = await render(Sparkline, { points: [{ date: '2026-11-03', elo: 912 }] });
    expect(el.querySelector('svg')).toBeNull();
    expect(el.textContent).toContain('912');
    expect(el.textContent).toContain('Primera lectura · 3 nov 2026');
    expect(el.textContent).toContain('La evolución aparecerá cuando haya más días de datos.');
  });

  it('shouldDrawTheLineAndTheRangeWhenThereAreSeveralPoints', async () => {
    const el = await render(Sparkline, { points: [{ date: '2026-11-01', elo: 900 }, { date: '2026-11-02', elo: 920 }, { date: '2026-11-03', elo: 910 }] });
    const [area, line] = [...el.querySelectorAll('path')];
    expect(line.getAttribute('d')).toBe('M10.0 80.0 L260.0 10.0 L510.0 45.0');
    expect(area.getAttribute('d')).toBe('M10.0 80.0 L260.0 10.0 L510.0 45.0 L510.0 80 L10.0 80 Z');
    expect([...el.querySelectorAll('text')].map((t) => t.textContent)).toEqual(['920', '900']);
    expect(el.querySelector('.muted')!.textContent).toBe('2026-11-012026-11-03');
  });

  it('shouldKeepAllLineCoordinatesWithinVisibleArea', async () => {
    const el = await render(Sparkline, {
      points: [
        { date: '2026-11-01', elo: 750 },
        { date: '2026-11-02', elo: 1200 },
        { date: '2026-11-03', elo: 800 },
        { date: '2026-11-04', elo: 1100 },
      ],
    });
    const line = el.querySelector('path:nth-of-type(2)')!;
    const d = line.getAttribute('d')!;
    const coords = d.split(/[ML]/).filter(Boolean).map((pt) => {
      const [x, y] = pt.trim().split(' ').map(Number);
      return { x, y };
    });
    for (const { x, y } of coords) {
      expect(x).toBeGreaterThanOrEqual(10);
      expect(x).toBeLessThanOrEqual(510);
      expect(y).toBeGreaterThanOrEqual(10);
      expect(y).toBeLessThanOrEqual(80);
    }
  });
});
