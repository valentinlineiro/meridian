import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { safe } from '../../core/guard';
import { gamesTable, nextSort, Range, Sort, Summary } from './games.model';

/** Port of sortGames/renderGamesTable (src/dashboard.client.js:1859–1884): the comparison table; headers sort it. */
@Component({
  selector: 'app-games-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let v = view();
    <div class="tblwrap"><table class="gtable" id="gamesTable"><caption class="sr-only">Comparativa de juegos en el periodo seleccionado. Los encabezados ordenan la tabla. Cada porcentaje y cada mediana muestran su n.</caption>
      <thead id="gamesHead">@if (v) {<tr>@for (h of v.head; track h.k) {<th scope="col" [id]="'gth-' + h.k" [attr.aria-sort]="h.aria"><button type="button" class="thbtn" (click)="sortBy(h.k)">{{ h.l }}</button></th>}</tr>}</thead>
      <tbody id="gamesRows">
        @if (v) {
          @for (r of v.rows; track r.k) {<tr>@for (c of r.cells; track $index) {<td [class.num]="c.num" [attr.title]="c.title">{{ c.text }}@if (c.sr) {<span class="sr-only">{{ c.sr }}</span>}</td>}</tr>}
        } @else if (v === null) {<tr><td class="muted">No disponible</td></tr>}
      </tbody>
    </table></div>
  `,
})
export class GamesTable {
  /** undefined: nothing to show (loading, failed, or no games yet). */
  readonly summary = input<Summary | undefined>();
  readonly range = input.required<Range>();
  private readonly sort = signal<Sort>({ key: 'eff', dir: -1 });

  /** undefined: empty table; null: the body could not be read. */
  protected readonly view = computed(() => {
    const s = this.summary();
    if (!s || !Object.keys(s.games).length) return undefined;
    return safe(() => gamesTable(s, this.range(), this.sort()), null);
  });

  protected sortBy(key: string): void { this.sort.update((s) => nextSort(s, key)); }
}
