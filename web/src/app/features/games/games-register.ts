import { Component, computed, DestroyRef, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiClient } from '../../core/api-client';
import { GamesQuickEntry } from './games-quick-entry';
import { Day, GAME_NAMES, gameName, localToday } from './games.model';

const URL = '/api/me/linkedin-games/import';
interface Err { line: number; reason: string }
interface Answer { ok: boolean; applied: boolean; errors: Err[]; days: { games: { status: 'new' | 'changed' | 'same' }[] }[] }
type Cell = { score: string; avg: string };

/**
 * Today's results, one row per game: your time and LinkedIn's average (optional). The same dialog is a bottom sheet on a phone and a panel
 * on a desktop (CSS only). It writes the lines the server already parses (`zip, 0:48, 0:53`), so there is still one parser and one set of rules.
 * Every game here is scored by TIME and less is better; a game scored by points would need its own direction here and in the verdicts.
 */
@Component({
  selector: 'app-games-register',
  imports: [GamesQuickEntry],
  template: `
    <dialog #dlg id="gamesRegister" class="lgreg" aria-labelledby="lgRegTitle" closedby="any">
      <form (submit)="submit($event)">
        <div class="lgreg-head"><h2 id="lgRegTitle" class="u-m-0">Hoy, {{ date }}</h2><button type="button" class="btn btn-g" (click)="close()">Cerrar</button></div>
        <p class="muted u-fs-sm">Tu tiempo y la media de LinkedIn de cada juego. Deja vacío el que no hayas jugado.</p>
        <div class="lgreg-row muted u-fs-xs" aria-hidden="true"><span></span><span>Tu tiempo</span><span>Media</span></div>
        <div id="lgRegRows">
          @for (g of games; track g.k) {
            <div class="lgreg-row" [attr.data-game]="g.k">
              <span class="u-fwt-700">{{ g.name }}</span>
              <input type="text" inputmode="numeric" autocomplete="off" placeholder="mm:ss" [id]="'lgReg-' + g.k + '-score'" [attr.aria-label]="g.name + ': tu tiempo'" [value]="cell(g.k).score" (input)="set(g.k, 'score', $event)">
              <input type="text" inputmode="numeric" autocomplete="off" placeholder="mm:ss" [id]="'lgReg-' + g.k + '-avg'" [attr.aria-label]="g.name + ': media de LinkedIn'" [value]="cell(g.k).avg" (input)="set(g.k, 'avg', $event)">
              @if (errors()[g.k]; as e) { <div class="lgreg-err" role="alert">{{ e }}</div> }
            </div>
          }
        </div>
        <div id="lgRegMsg" role="status" class="muted u-fs-sm u-mt-8">{{ message() }}</div>
        <button id="lgRegSave" class="btn btn-p lgreg-save" type="submit" [disabled]="!canSave()">Guardar</button>
      </form>
      <details id="lgRegMore" class="u-mt-12">
        <summary class="muted">Pegar texto o varias fechas</summary>
        <app-games-quick-entry (saved)="pasted()" />
      </details>
    </dialog>
  `,
})
export class GamesRegister {
  /** Today's stored record (a failed request is null: the rows start empty). */
  readonly day = input<Day['games'] | null>(null);
  /** Results were stored: the page refreshes its summary. */
  readonly saved = output<void>();

  private readonly api = inject(ApiClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  protected readonly games = Object.keys(GAME_NAMES).map((k) => ({ k, name: gameName(k) }));
  protected readonly date = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

  private readonly values = signal<Record<string, Cell>>({});
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly message = signal('');
  private readonly saving = signal(false);

  protected cell(k: string): Cell { return this.values()[k] ?? { score: '', avg: '' }; }
  protected set(k: string, f: keyof Cell, e: Event): void {
    this.values.update((v) => ({ ...v, [k]: { ...this.cell(k), [f]: (e.target as HTMLInputElement).value } }));
    this.errors.update(({ [k]: _, ...rest }) => rest);
    this.message.set('');
  }

  /** The games with a time, in the order of the rows: each becomes one line for the server. */
  private readonly filled = computed(() => this.games.filter((g) => this.cell(g.k).score.trim() !== '').map((g) => g.k));
  protected readonly canSave = computed(() => !this.saving() && this.filled().length > 0);

  open(): void {
    const d = this.day() ?? {};
    this.values.set(Object.fromEntries(this.games.map((g) => [g.k, { score: d[g.k]?.score ?? '', avg: d[g.k]?.avg ?? '' }])));
    this.errors.set({});
    this.message.set('');
    const el = this.dlg().nativeElement;
    if (el.showModal) el.showModal(); else el.setAttribute('open', '');
  }
  protected close(): void {
    const el = this.dlg().nativeElement;
    if (el.close) el.close(); else el.removeAttribute('open');
  }
  protected pasted(): void { this.close(); this.saved.emit(); }

  protected submit(e: Event): void {
    e.preventDefault();
    if (!this.canSave()) return;
    const keys = this.filled();
    const text = keys.map((k) => { const c = this.cell(k), avg = c.avg.trim(); return `${k}, ${c.score.trim()}${avg ? ', ' + avg : ''}`; }).join('\n');
    this.saving.set(true);
    this.api.post<Answer>(URL, { text, today: localToday(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone, apply: true }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (r) => {
        this.saving.set(false);
        if (r.errors.length) { this.errors.set(Object.fromEntries(r.errors.filter((x) => keys[x.line - 1]).map((x) => [keys[x.line - 1], x.reason]))); return; }
        if (!r.applied) { this.message.set('No se guardó nada.'); return; }
        if (!r.days.some((d) => d.games.some((g) => g.status !== 'same'))) { this.message.set('Sin cambios: ya estaba guardado.'); return; }
        this.close();
        this.saved.emit();
      },
      error: () => { this.saving.set(false); this.message.set('No se pudo guardar.'); },
    });
  }
}
