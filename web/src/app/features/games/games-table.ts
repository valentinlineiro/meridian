import { Component, computed, input, signal } from '@angular/core';
import { safe } from '../../core/guard';
import { gamesTable, nextSort, Range, Sort, Summary } from './games.model';

/** Port of sortGames/renderGamesTable (src/dashboard.client.js:1859–1884): the comparison table; headers sort it. */
@Component({
  selector: 'app-games-table',
  template: `
    @let v = view();
    <div class="tblwrap" tabindex="0" role="region" aria-label="Comparativa de juegos (desplazable)"><table class="gtable gstack" id="gamesTable"><caption class="sr-only">Comparativa de juegos en el periodo seleccionado. Los encabezados ordenan la tabla. «Cómo vas» mira siempre las últimas 4 semanas. Días seguidos con un guion: sin racha activa; el último registro está en la cabecera.</caption>
      <thead id="gamesHead">@if (v) {<tr>@for (h of v.head; track h.k) {<th scope="col" [id]="'gth-' + h.k" [attr.aria-sort]="h.aria"><button type="button" class="thbtn" (click)="sortBy(h.k)">{{ h.l }}</button></th>}</tr>}</thead>
      <tbody id="gamesRows">
        @if (v) {
          @for (r of v.rows; track r.k) {<tr>@for (c of r.cells; track $index) {<td [class.num]="c.num" [attr.title]="c.title" [attr.data-l]="v.head[$index].l">@if (c.pill) {<span [class]="c.pill">{{ c.text }}</span>} @else {{{ c.text }}}</td>}</tr>}
        } @else if (v === null) {<tr><td class="muted">No disponible</td></tr>}
      </tbody>
    </table></div>
  `,
})
export class GamesTable {
  /** undefined: nothing to show (loading, failed, or no games yet). */
  readonly summary = input<Summary | undefined>();
  readonly range = input.required<Range>();
  private readonly sort = signal<Sort>({ key: 'speed', dir: -1 });

  /** undefined: empty table; null: the body could not be read. */
  protected readonly view = computed(() => {
    const s = this.summary();
    if (!s || !Object.keys(s.games).length) return undefined;
    return safe(() => gamesTable(s, this.range(), this.sort()), null);
  });

  protected sortBy(key: string): void { this.sort.update((s) => nextSort(s, key)); }
}
