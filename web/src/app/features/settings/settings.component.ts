import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiClient } from '../../core/api-client';

const URL = '/api/me/settings';
const LOAD_ERROR = 'No se pudo cargar la configuración.';
interface Reply { ok?: boolean; error?: string; dailyGoalXp?: unknown }

/** Port of src/settingsPage.ts (daily XP goal). Empty = no goal. */
@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card">
      <h2 style="margin-bottom:4px">Objetivo diario</h2>
      <div class="muted">XP que quieres conseguir cada día. Lo defines tú: no se toma del dato que reporta Duolingo. Vacío = sin objetivo.</div>
      <div class="goal-field">
        <label for="goalInput" class="muted">XP por día</label>
        <input id="goalInput" type="number" min="1" max="10000" step="1" inputmode="numeric" placeholder="sin objetivo"
          [value]="goal()" (input)="onInput($event)">
        <button id="goalSave" type="button" class="btn btn-p" [disabled]="saving() || loadFailed()" (click)="save()">Guardar</button>
        <span id="goalStatus" class="muted" role="status">{{ status() }}</span>
      </div>
    </section>
  `,
})
export class Settings {
  private readonly api = inject(ApiClient);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly goal = signal('');
  protected readonly status = signal('');
  protected readonly saving = signal(false);
  // The stored goal is unknown after a failed load: Save is off so an empty field cannot silently delete it.
  protected readonly loadFailed = signal(false);
  private bad = false;
  protected touched = false; // the user typed (or saved): a late load answer must not overwrite it

  constructor() {
    this.api.get<Reply | null>(URL).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (b) => { if (!this.touched) this.goal.set(typeof b?.dailyGoalXp === 'number' ? String(b.dailyGoalXp) : ''); },
      error: () => { this.loadFailed.set(true); this.status.set(LOAD_ERROR); },
    });
  }

  protected save(): void {
    if (this.saving()) return;
    const raw = this.goal().trim();
    const value = raw === '' ? null : Number(raw);
    if (this.bad || (value !== null && !(Number.isInteger(value) && value >= 1 && value <= 10000))) {
      this.status.set('Introduce un entero entre 1 y 10000, o déjalo vacío.');
      return;
    }
    this.touched = true;
    this.status.set('Guardando…');
    this.saving.set(true);
    this.api.put<Reply | null>(URL, { dailyGoalXp: value }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (b) => {
        this.saving.set(false);
        if (!b?.ok) { this.status.set('No se pudo guardar: ' + (b?.error || 200)); return; }
        this.goal.set(b.dailyGoalXp == null ? '' : String(b.dailyGoalXp));
        this.status.set(b.dailyGoalXp == null ? 'Objetivo eliminado.' : 'Guardado.');
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.status.set(e instanceof HttpErrorResponse && e.status !== 0 ? 'No se pudo guardar: ' + ((e.error as Reply | null)?.error || e.status) : 'No se pudo guardar.');
      },
    });
  }

  protected onInput(e: Event): void {
    const el = e.target as HTMLInputElement;
    this.touched = true;
    this.bad = el.validity.badInput; // a type=number field reports unparsable text (e.g. "1e") as '' — that is not "sin objetivo"
    this.goal.set(el.value);
  }
}
