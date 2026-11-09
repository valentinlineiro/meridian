import { Component, computed, DestroyRef, inject, output, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { map } from 'rxjs';
import { ApiClient } from '../../core/api-client';
import { safe } from '../../core/guard';
import { Modal } from '../../shared/modal';
import { Day, dayLine, GAME_NAMES, localToday } from './games.model';

const URL = '/api/me/linkedin-games';
interface Saved { ok?: boolean; error?: string; day?: Day | null }

/**
 * Port of the LinkedIn Games entry modal (src/frontend.ts #lgModal, src/dashboard.client.js:1972–2007). Manual entry:
 * nothing is read from LinkedIn. The write is a same-origin PUT (the Worker's IDENTITY_WRITE: owner session + same origin).
 */
@Component({
  selector: 'app-games-entry-modal',
  imports: [Modal],
  template: `
    @if (isOpen()) {
      <app-modal modalId="lgModal" labelledby="lgTitle" initialFocus="#lgScore" cardClass="lgcard" (dismissed)="close()">
          <div class="gamehead"><b id="lgTitle">Registrar resultado</b><button class="btn btn-g" type="button" (click)="close()" aria-label="Cerrar">✕</button></div>
          <div class="muted">Lo introduces tú; no se lee nada de LinkedIn. Tiempos como M:SS.</div>
          <label for="lgGame">Juego</label>
          <select id="lgGame" (change)="game.set(val($event))">@for (g of games; track g[0]) {<option [value]="g[0]" [selected]="g[0] === game()">{{ g[1] }}</option>}</select>
          <label for="lgDate">Fecha de la partida</label>
          <input id="lgDate" type="date" [value]="date()" (change)="setDate(val($event))">
          <label for="lgScore">Tu tiempo (M:SS)</label>
          <input id="lgScore" type="text" inputmode="numeric" placeholder="0:08" autocomplete="off" [value]="score()" (input)="score.set(val($event))">
          <label for="lgAvg">Promedio de hoy (opcional)</label>
          <input id="lgAvg" type="text" inputmode="numeric" placeholder="0:17" autocomplete="off" [value]="avg()" (input)="avg.set(val($event))">
          <label for="lgNumber">Nº de puzzle (opcional)</label>
          <input id="lgNumber" type="number" min="1" step="1" inputmode="numeric" [value]="num()" (input)="num.set(val($event))">
          <button id="lgSave" type="button" class="btn btn-p lgsave" [disabled]="saving()" (click)="save()">Guardar</button>
          <div id="lgStatus" class="muted" role="status" style="margin-top:8px">{{ statusText() }}</div>
          <h3 style="margin:14px 0 4px">Registrado ese día</h3>
          <ul id="lgDay" class="lgday">@for (l of dayLines(); track $index) {<li [class.muted]="l.muted">{{ l.text }}</li>}</ul>
      </app-modal>
    }
  `,
})
export class GamesEntryModal {
  /** A result was stored: the page refreshes its summary and today's chips. */
  readonly saved = output<void>();

  private readonly api = inject(ApiClient);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly games = Object.entries(GAME_NAMES);
  protected readonly isOpen = signal(false);
  protected readonly game = signal('zip');
  protected readonly date = signal(''); // kept across openings, as in legacy
  protected readonly score = signal('');
  protected readonly avg = signal('');
  protected readonly num = signal('');
  protected readonly status = signal('');
  protected readonly saving = signal(false);

  // The day shown under the form. A new date cancels the request for the previous one; closing drops it.
  private readonly day = rxResource({
    params: () => this.isOpen() && this.date() ? this.date() : undefined,
    stream: ({ params: date }) => this.api.get<{ day?: Day | null }>(URL, { date }).pipe(map((b) => b?.day ?? null)),
  });
  protected readonly statusText = computed(() => this.status() || (this.day.error() ? 'No se pudo cargar el día.' : ''));
  protected readonly dayLines = computed(() => {
    if (!this.day.hasValue()) return [];
    const d = this.day.value();
    return safe(() => {
      const g = d?.games ?? {};
      if (typeof g !== 'object' || g === null) throw new TypeError('day.games is not an object');
      const keys = Object.keys(g);
      return keys.length ? keys.map((k) => ({ text: dayLine(k, g[k]), muted: false })) : [{ text: 'Nada todavía.', muted: true }];
    }, [{ text: 'No disponible', muted: true }]);
  });

  open(game?: string): void {
    if (this.isOpen()) return;
    if (game) this.game.set(game);
    if (!this.date()) this.date.set(localToday());
    this.status.set('');
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }

  protected setDate(v: string): void {
    this.status.set('');
    this.date.set(v);
  }

  protected save(): void {
    if (this.saving()) return;
    const n = this.num().trim();
    const payload = {
      date: this.date(), game: this.game(), score: this.score().trim(), avg: this.avg().trim() || null,
      number: n === '' ? null : Number(n), tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
    this.status.set('Guardando…');
    this.saving.set(true);
    this.api.put<Saved>(URL, payload).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (r) => {
        this.saving.set(false);
        if (!r?.ok) { this.status.set('No se pudo guardar: ' + (r?.error || 200)); return; }
        this.status.set('Guardado.');
        this.score.set(''); this.avg.set(''); this.num.set('');
        if (this.date() === payload.date) this.day.set(r.day ?? null); // the answer is that day; a newer date loads its own
        this.saved.emit();
      },
      error: (e: unknown) => {
        this.saving.set(false);
        // a refusal carries the server's reason (or its status); a request that never got an answer is just "could not"
        this.status.set(e instanceof HttpErrorResponse && e.status !== 0 ? 'No se pudo guardar: ' + ((e.error as Saved | null)?.error || e.status) : 'No se pudo guardar.');
      },
    });
  }

  protected val(e: Event): string { return (e.target as HTMLInputElement).value; }
}
