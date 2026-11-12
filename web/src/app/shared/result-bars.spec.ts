import { TestBed } from '@angular/core/testing';
import { ResultBars, resultBars } from './result-bars';

describe('resultBars', () => {
  const s = (effs: number[]) => effs.map((eff, i) => ({ date: `2026-10-${String(10 + i).padStart(2, '0')}`, eff }));

  it('shouldKeepOnlyTheLast14ResultsAndCountTheBetterOnes', () => {
    const r = resultBars(s(Array.from({ length: 20 }, (_, i) => (i % 4 === 0 ? 0.8 : 1.5))));
    expect(r.bars).toHaveLength(14);
    expect(r.bars.filter((b) => b.win)).toHaveLength(11);
    expect(r.aria).toBe('Últimas 14 partidas con media: 11 mejores que la media y 3 peores.');
  });

  it('shouldMakeTheHeightTheDistanceToTheAverageCappedAtHalfAndNeverInvisible', () => {
    const [a, b, c] = resultBars(s([1.5, 0.8, 1.01])).bars;
    expect([a.h, b.h]).toEqual([100, 40]);
    expect(c.h).toBe(8);
    expect(resultBars(s([3])).bars[0].h).toBe(100);
  });

  it('shouldSayThereAreNoResultsWithAverageWhenTheSeriesIsEmpty', () => {
    expect(resultBars([]).aria).toBe('Sin partidas con media.');
  });
});

describe('ResultBars', () => {
  it('shouldDrawBetterResultsAboveTheLineAndWorseBelowIt', async () => {
    const f = TestBed.createComponent(ResultBars);
    f.componentRef.setInput('data', resultBars([{ date: '2026-10-10', eff: 1.25 }, { date: '2026-10-11', eff: 0.75 }]));
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.gb')).toHaveLength(2);
    expect(el.querySelectorAll('.gb-up i')).toHaveLength(1);
    expect(el.querySelectorAll('.gb-dn i')).toHaveLength(1);
    expect(el.querySelector('.gbars')!.getAttribute('role')).toBe('img');
  });
});
