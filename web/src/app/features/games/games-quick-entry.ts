import { Component, computed, DestroyRef, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, map, of, switchMap } from 'rxjs';
import { ApiClient } from '../../core/api-client';
import { gameName, localToday } from './games.model';

const URL = '/api/me/linkedin-games/import';
interface Line { line: number; text: string; reason: string }
interface Imported { game: string; score: string; avg: string | null; status: 'new' | 'changed' | 'same' }
interface Result { forText?: string; ok: boolean; applied: boolean; errors: Line[]; days: { date: string; games: Imported[] }[] }
const BADGE = { new: 'nuevo', changed: 'cambia', same: 'igual' } as const;

/**
 * One box to register results as they are played: `Z, 6, 12` (game, my seconds, average), several lines, a date line (`ayer`,
 * `2026-11-08`) or a pasted spreadsheet table. The server reads the text (it is the only parser) and answers what would change; Enter
 * saves. Shift+Enter adds a line. Nothing is stored while the text has an error.
 */
@Component({
  selector: 'app-games-quick-entry',
  template: `
    <div id="lgQuick">
      <label class="muted" for="lgQuickText" style="display:block;font-size:var(--fs-xs);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Registro rápido · juego, mis segundos, media</label>
      <textarea #box id="lgQuickText" rows="2" style="width:100%" placeholder="Z, 6, 12" autocomplete="off" autocapitalize="characters" spellcheck="false"
        [value]="text()" (input)="onInput($event)" (keydown)="onKey($event)"></textarea>
      <div id="lgQuickPreview" role="status" class="muted" style="margin-top:6px;font-size:var(--fs-sm)">
        @if (message(); as m) { {{ m }} }
        @else if (preview(); as p) {
          @for (e of p.errors; track e.line) { <div class="lgquick-err">Línea {{ e.line }}: {{ e.reason }} («{{ e.text }}»)</div> }
          @for (d of p.days; track d.date) {
            <div><b>{{ d.date === today ? 'Hoy' : d.date }}</b>:
              @for (g of d.games; track g.game; let last = $last) { {{ name(g.game) }} {{ g.score }}{{ g.avg ? ' (media ' + g.avg + ')' : '' }} · {{ badge(g.status) }}{{ last ? '' : ' ·' }} }
            </div>
          }
        }
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
        <button id="lgQuickSave" class="btn btn-p" type="button" [disabled]="!canSave()" (click)="save()">Guardar</button>
        <span class="muted" style="font-size:var(--fs-xs)">Enter guarda · Mayús+Enter, otra línea</span>
      </div>
    </div>
  `,
})
export class GamesQuickEntry {
  /** Results were stored: the page refreshes its summary and today's chips. */
  readonly saved = output<void>();

  private readonly api = inject(ApiClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  protected readonly today = localToday();

  private readonly box = viewChild.required<ElementRef<HTMLTextAreaElement>>('box');
  protected readonly text = signal('');
  protected readonly message = signal('');
  private readonly saving = signal(false);

  private body(apply: boolean) { return { text: this.text(), today: localToday(), tz: this.tz, apply }; }

  // The preview follows what is typed (a short pause so a half-typed line is not judged). Each answer remembers the text it is for:
  // while the text has moved on, nothing is shown and nothing can be saved on the strength of an older answer.
  private readonly answer = toSignal(toObservable(this.text).pipe(
    debounceTime(250),
    switchMap((t) => t.trim() === '' ? of(null) : this.api.post<Result>(URL, { text: t, today: localToday(), tz: this.tz, apply: false }).pipe(
      map((r): Result | null => ({ ...r, forText: t })),
      catchError(() => of<Result>({ forText: t, ok: false, applied: false, days: [], errors: [{ line: 0, text: '', reason: 'No se pudo comprobar el texto.' }] })),
    )),
  ), { initialValue: null });
  protected readonly preview = computed(() => { const a = this.answer(); return a && a.forText === this.text() ? a : null; });

  protected readonly canSave = computed(() => {
    const p = this.preview();
    return !this.saving() && !!p && p.ok && p.errors.length === 0 && p.days.some((d) => d.games.some((g) => g.status !== 'same'));
  });

  /** A game chip: starts a line for that game (a new line if something is already written) and puts the cursor there. */
  prefill(game: string): void {
    const t = this.text();
    this.message.set('');
    this.text.set((t.trim() ? t.replace(/\n*$/, '\n') : '') + game + ', ');
    const el = this.box().nativeElement;
    el.value = this.text();
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }

  protected name(k: string): string { return gameName(k); }
  protected badge(s: Imported['status']): string { return BADGE[s]; }
  protected onInput(e: Event): void { this.message.set(''); this.text.set((e.target as HTMLTextAreaElement).value); }

  protected onKey(e: KeyboardEvent): void {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    this.save();
  }

  protected save(): void {
    if (!this.canSave()) return;
    this.saving.set(true);
    this.api.post<Result>(URL, this.body(true)).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (r) => {
        this.saving.set(false);
        if (!r.applied) { this.message.set('No se guardó nada.'); return; }
        const n = r.days.reduce((s, d) => s + d.games.filter((g) => g.status !== 'same').length, 0);
        this.text.set('');
        this.message.set(`Guardado: ${n} ${n === 1 ? 'juego' : 'juegos'}.`);
        this.saved.emit();
      },
      error: () => { this.saving.set(false); this.message.set('No se pudo guardar.'); },
    });
  }
}
