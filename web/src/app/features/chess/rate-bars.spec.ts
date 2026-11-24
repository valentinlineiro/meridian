import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PointsBars, RateRows } from './components/rate-bars';
import { Point } from './periods';

@Component({
  imports: [PointsBars, RateRows],
  template: `
    <app-points-bars id="pb" title="Puntos fuertes" [points]="strong" empty="Nada destaca todavía." />
    <app-points-bars id="pe" title="Puntos débiles" [points]="[]" empty="Nada destaca todavía." />
    <app-rate-rows id="rr" title="Aperturas" [points]="rows" empty="Sin aperturas." />
  `,
})
class Host {
  strong: Point[] = [{ kind: 'opening', label: 'Italiana', n: 10, rate: 0.9, delta: 40 }, { kind: 'color', label: 'Con blancas', n: 20, rate: 0.7, delta: 20 }];
  rows: Point[] = [{ kind: 'opening', label: 'Siciliana', n: 12, rate: 0.5, delta: 0 }, { kind: 'opening', label: 'Escandinava', n: 3, rate: 1, delta: 50 }];
}

describe('rate bars', () => {
  const render = () => { const f = TestBed.createComponent(Host); f.detectChanges(); return f.nativeElement as HTMLElement; };

  it('shouldListEveryPointWithItsRateAndGamesWhenRendering', () => {
    const items = [...render().querySelectorAll('#pb li')].map((li) => li.textContent!.replace(/\s+/g, ' ').trim());
    expect(items).toHaveLength(2);
    expect(items[0]).toContain('Italiana');
    expect(items[0]).toContain('90 %');
    expect(items[0]).toContain('10 partidas');
    expect(items[0]).toContain('+40');
    expect(items[1]).toContain('Con blancas');
  });

  it('shouldShowTheEmptyMessageWhenThereAreNoPoints', () => {
    const el = render().querySelector('#pe')!;
    expect(el.querySelectorAll('li')).toHaveLength(0);
    expect(el.textContent).toContain('Nada destaca todavía.');
  });

  it('shouldDimAndLabelRowsBelowMinGamesWhenRendering', () => {
    const rows = [...render().querySelectorAll('#rr li')];
    expect(rows[0]!.classList.contains('rate-few')).toBe(false);
    expect(rows[1]!.classList.contains('rate-few')).toBe(true);
    expect(rows[1]!.textContent).toContain('pocas partidas');
  });

  it('shouldHideTheDecorativeBarsFromAssistiveTechWhenRendering', () => {
    expect(render().querySelectorAll('#pb [aria-hidden="true"]').length).toBeGreaterThan(0);
    expect(render().querySelector('#pb ul')!.getAttribute('aria-label') ?? render().querySelector('#pb h3')!.textContent).toBeTruthy();
  });
});
