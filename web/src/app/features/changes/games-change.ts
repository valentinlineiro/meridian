import { Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';
import { ApiClient } from '../../core/api-client';
import { localDateOf } from '../../core/format';
import { safe } from '../../core/guard';
import { VerdictPill } from '../../shared/verdict';
import { GamesChange, gamesChangeView } from './games-change.model';

/** What changed in each LinkedIn Games game between two instants (their local play dates), or its state now when `since` is null. Fails on its own. */
@Component({
  selector: 'app-games-change',
  imports: [VerdictPill],
  template: `
    <section id="changesGames" class="u-mb-16">
      @if (res.value() === null) {
        <div class="card"><h3 class="u-m-0">Games</h3><div class="muted u-fs-sm u-mt-6">No disponible</div></div>
      } @else if (view(); as v) {
        <h2 class="u-m-18-0-10" id="changesGamesHeading">{{ v.heading }}</h2>
        @if (v.summary) {<div class="muted u-fs-sm u-mb-10" id="changesGamesSummary">{{ v.summary }}</div>}
        @if (v.notice) {<div class="empty" id="changesGamesNotice">{{ v.notice }}</div>}
        @for (r of v.rows; track r.game) {
          <div class="card u-mb-10 cg-row"><app-verdict [verdict]="r.verdict" /> <span class="cg-text">{{ r.text }}</span></div>
        }
      }
    </section>
  `,
})
export class GamesChangeCard {
  private readonly api = inject(ApiClient);
  readonly since = input<string | null>(null);
  readonly until = input.required<string>();

  protected readonly res = rxResource({
    params: () => ({ since: this.since(), until: this.until() }),
    stream: ({ params }) => this.api.get<{ change: GamesChange }>('/api/me/linkedin-games/changes',
      { ...(params.since ? { since: localDateOf(params.since) } : {}), until: localDateOf(params.until) }).pipe(
      map((b) => b.change), catchError(() => of(null))),
  });
  protected readonly view = computed(() => { const c = this.res.value(); return c ? safe(() => gamesChangeView(c), null) : null; });
}
