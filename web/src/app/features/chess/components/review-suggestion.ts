import { Component, computed, inject, input, output } from '@angular/core';
import { ErrorBlock } from '../../../shared/error-block';
import { Profile } from './engine-profile';
import { MatchesService } from '../services/matches.service';

/**
 * The one thing the old «Patrones» card had that no other block has: which game to review first.
 * Colour rates live in «Comparativa» and the analysed count in the engine profile, so they are not repeated here.
 */
@Component({
  selector: 'app-review-suggestion',
  imports: [ErrorBlock],
  template: `
    @if (profile() === null) {
      <app-error-block id="chessPatternSuggested" role="status" message="No pudimos cargar la partida sugerida." [loading]="loading()" (retry)="retry.emit()" />
    } @else {
    <div id="chessPatternSuggested" class="u-fs-sm">{{ suggested().text }}@if (suggested().game; as w) {<button type="button" class="btn btn-g btn-sm" (click)="matches.open(w.matchId)">Revisar vs {{ w.opponent || 'Rival' }} ({{ w.serious || 0 }} errores graves)</button>}</div>
    }
  `,
})
export class ReviewSuggestion {
  protected readonly matches = inject(MatchesService);
  /** undefined = not loaded yet; null = that request failed. */
  readonly profile = input<Profile | null | undefined>(undefined);
  readonly loading = input(false);
  readonly retry = output<void>();

  protected readonly suggested = computed(() => {
    const b = this.profile();
    if (b === undefined) return { text: '', game: null };
    if (b === null) return { text: '', game: null };
    const w = b.review?.worst?.[0];
    return w ? { text: 'Partida sugerida para revisión (mayor pérdida media por jugada): ', game: w }
      : { text: 'Partidas sugeridas para revisión: el motor las analiza solo tras cada sincronización y aparecerán aquí.', game: null };
  });
}
