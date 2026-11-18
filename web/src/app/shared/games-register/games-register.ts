import { Component, computed, DestroyRef, effect, ElementRef, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiClient } from '../../core/api-client';
import { GamesQuickEntry } from './games-quick-entry';
import { GAME_NAMES, gameName } from '../../core/words';
import { localToday } from '../../core/format';
import { Cell, dirtyGames, errorText, FieldCode, maskTime, plan, RowError, Values } from './games-register.model';

const URL = '/api/me/linkedin-games/day';
const DRAFT_KEY = 'meridian.gamesRegisterDraft';
interface Saved { game: string; score: string; avg: string | null; status: 'new' | 'changed' | 'same' }
interface Answer { ok: boolean; games: Saved[]; removed: string[] }
interface Rejected { errors?: { game: string; field: FieldCode; reason: string }[] }
const MSG = {
  noAnswer: 'No sabemos si se guardó. Tus tiempos siguen aquí; pulsa Guardar otra vez, no se duplica.',
  offline: 'Sin conexión. Tus tiempos siguen aquí; guarda cuando vuelva la red.',
  failed: 'No pudimos guardar. Tus tiempos siguen aquí; inténtalo de nuevo.',
  same: 'Sin cambios: ya estaba guardado.',
};
const list = (items: string[]) => new Intl.ListFormat('es', { style: 'long', type: 'conjunction' }).format(items);
const dayLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

/**
 * Today's results, one row per game: your time and LinkedIn's average (optional). The same dialog is a bottom sheet on a phone and a panel
 * on a desktop (CSS only). It saves through one structured call (`PUT …/day`): what the sheet touched is set or removed, the rest of the day is kept.
 * The time field is its own reading (see maskTime); what you type survives closing by accident, a lost session and a reload (a draft in this tab).
 * Every game here is scored by TIME and less is better; a game scored by points would need its own direction here and in the verdicts.
 */
@Component({
  selector: 'app-games-register',
  imports: [GamesQuickEntry],
  template: `
    <dialog #dlg id="gamesRegister" class="lgreg" aria-labelledby="lgRegTitle" (cancel)="$event.preventDefault(); requestClose()">
      <form (submit)="submit($event)">
        <div class="lgreg-head"><h2 id="lgRegTitle" class="u-m-0">Hoy, {{ label() }}</h2><button type="button" class="btn btn-g" (click)="requestClose()">Cerrar</button></div>
        <p id="lgRegHelp" class="muted u-fs-sm">Tu tiempo y la media de LinkedIn de cada juego, como m:ss (por ejemplo 1:06). Deja vacío el que no hayas jugado; vacía uno ya guardado para quitarlo.</p>
        @if (day() === null) {
          <p id="lgRegUnread" class="lgreg-note">No pudimos leer lo guardado de hoy. Lo que escribas se añade o cambia; no se borra nada. <button type="button" class="btn btn-g" (click)="reread.emit()">Volver a leer</button></p>
        }
        @if (restored()) { <p id="lgRegRestored" class="muted u-fs-sm">Recuperamos lo que habías escrito.</p> }
        <div class="lgreg-row muted u-fs-xs" aria-hidden="true"><span></span><span>Tu tiempo</span><span>Media LinkedIn</span></div>
        <div id="lgRegRows">
          @for (g of games; track g.k) {
            <div class="lgreg-row" [attr.data-game]="g.k">
              <span class="u-fwt-700">{{ g.name }}</span>
              @if (removed().has(g.k)) {
                <span class="lgreg-gone muted">Se quitará al guardar</span>
                <button type="button" class="btn btn-g" [attr.aria-label]="'Deshacer: quitar ' + g.name" (click)="undo(g.k)">Deshacer</button>
              } @else {
                @for (f of fields; track f) {
                  <input type="text" inputmode="numeric" autocomplete="off" placeholder="m:ss" [id]="'lgReg-' + g.k + '-' + f"
                    [attr.aria-label]="g.name + (f === 'score' ? ': tu tiempo' : ': media de LinkedIn')"
                    [attr.aria-describedby]="errors()[g.k]?.field === f ? 'lgReg-' + g.k + '-err lgRegHelp' : 'lgRegHelp'"
                    [attr.aria-invalid]="errors()[g.k]?.field === f ? 'true' : null"
                    [value]="cell(g.k)[f]" (input)="type(g.k, f, $event)">
                }
              }
              @if (errors()[g.k]; as e) { <div class="lgreg-err" [id]="'lgReg-' + g.k + '-err'">{{ e.text }}</div> }
            </div>
          }
        </div>
        <div id="lgRegMsg" role="status" class="muted u-fs-sm u-mt-8">{{ message() }}</div>
        @if (midnight()) {
          <div id="lgRegMidnight" class="lgreg-note" role="group" aria-label="Cambio de día">
            <p class="u-m-0">Ya es {{ dayLabel(now()) }}.</p>
            <button type="button" class="btn btn-p" (click)="send(now())">Guardar en {{ dayLabel(now()) }}</button>
            <button type="button" class="btn btn-g" (click)="send(date())">Guardar en {{ dayLabel(date()) }}</button>
          </div>
        }
        @if (discard()) {
          <div id="lgRegDiscard" class="lgreg-note" role="group" aria-label="Cambios sin guardar">
            <p class="u-m-0">Tienes cambios sin guardar: {{ dirtyNames() }}.</p>
            <button id="lgRegKeep" type="button" class="btn btn-p" (click)="discard.set(false)">Seguir editando</button>
            <button id="lgRegDrop" type="button" class="btn btn-g" (click)="drop()">Descartar cambios</button>
          </div>
        }
        <button id="lgRegSave" class="btn btn-p lgreg-save" type="submit" [disabled]="!canSave()" aria-describedby="lgRegSaveHint">{{ saving() ? 'Guardando…' : 'Guardar' }}</button>
        <p id="lgRegSaveHint" class="muted u-fs-sm u-m-0">{{ canSave() || saving() ? '' : 'Escribe al menos un tiempo.' }}</p>
      </form>
      <details id="lgRegMore" class="u-mt-12">
        <summary class="muted">Pegar texto o varias fechas</summary>
        <app-games-quick-entry (saved)="pasted()" />
      </details>
    </dialog>
  `,
})
export class GamesRegister {
  /** Today's stored record (a failed request is null: the rows start empty and nothing stored is touched). */
  readonly day = input<Record<string, { score?: string | null; avg?: string | null }> | null | undefined>(null);
  /** Results were stored: the page refreshes its summary and shows the note ("Guardado: Zip 0:48. Quitado: Queens."). */
  readonly saved = output<string>();
  /** The person asked to read the stored day again. */
  readonly reread = output<void>();

  private readonly api = inject(ApiClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  protected readonly games = Object.keys(GAME_NAMES).map((k) => ({ k, name: gameName(k) }));
  protected readonly keys = this.games.map((g) => g.k);
  protected readonly fields = ['score', 'avg'] as const;
  protected readonly dayLabel = dayLabel;

  /** The date the sheet was opened on: the day its times go to unless the person chooses the new one after midnight. */
  protected readonly date = signal(localToday());
  protected readonly now = signal(localToday());
  protected readonly label = computed(() => dayLabel(this.date()));
  private readonly values = signal<Values>({});
  protected readonly removed = signal<ReadonlySet<string>>(new Set());
  protected readonly errors = signal<Record<string, RowError>>({});
  protected readonly message = signal('');
  protected readonly restored = signal(false);
  protected readonly midnight = signal(false);
  protected readonly discard = signal(false);
  protected readonly saving = signal(false);
  private readonly isOpen = signal(false);
  private listening = false;

  constructor() {
    // The stored day arrived (or was read again) while the sheet is open: fill the rows still empty, never over what was typed.
    effect(() => {
      const d = this.day();
      if (d && untracked(this.isOpen)) untracked(() => this.values.update((all) => Object.fromEntries(this.keys.map((k) => {
        const c = all[k] ?? { score: '', avg: '' };
        return [k, !c.score && !c.avg && d[k] && !this.removed().has(k) ? { score: d[k]!.score ?? '', avg: d[k]!.avg ?? '' } : c];
      }))));
    });
  }

  protected cell(k: string): Cell { return this.values()[k] ?? { score: '', avg: '' }; }
  protected readonly canSave = computed(() => !this.saving() && (this.removed().size > 0 || this.keys.some((k) => this.cell(k).score || this.cell(k).avg)));
  private readonly dirty = computed(() => dirtyGames(this.values(), this.removed(), this.day(), this.keys));
  protected readonly dirtyNames = computed(() => list(this.dirty().map(gameName)));

  /** Opens with what is stored for today, or with the draft kept from a closed or interrupted sheet. */
  open(game?: string): void {
    const d = this.day() ?? {};
    this.date.set(localToday());
    this.now.set(localToday());
    this.values.set(Object.fromEntries(this.keys.map((k) => [k, { score: d[k]?.score ?? '', avg: d[k]?.avg ?? '' }])));
    this.removed.set(new Set());
    this.errors.set({});
    this.message.set('');
    this.midnight.set(false);
    this.discard.set(false);
    const draft = readDraft();
    this.restored.set(!!draft && draft.date === this.date());
    if (draft && draft.date === this.date()) { this.values.set({ ...this.values(), ...draft.values }); this.removed.set(new Set(draft.removed)); }
    const el = this.dlg().nativeElement;
    this.isOpen.set(true);
    if (!this.listening) { this.listening = true; el.addEventListener('click', (e) => { if (e.target === el) this.requestClose(); }); } // a tap on the backdrop
    if (!el.open) { if (el.showModal) el.showModal(); else el.setAttribute('open', ''); }
    const first = game && this.keys.includes(game) ? game : this.keys.find((k) => !this.values()[k]?.score); // typing starts at once: the keypad opens on the asked game, else on the first empty time
    if (first) el.querySelector<HTMLElement>(`#lgReg-${first}-score`)?.focus();
  }
  /** True when a draft of today's sheet is waiting: the host reopens the sheet after a login redirect or a reload. */
  static hasDraft(): boolean { return readDraft()?.date === localToday(); }

  protected requestClose(): void {
    if (this.saving()) return;
    if (this.dirty().length) { this.discard.set(true); setTimeout(() => this.dlg().nativeElement.querySelector<HTMLElement>('#lgRegKeep')?.focus()); return; }
    this.finish();
  }
  protected drop(): void { this.finish(); }
  private finish(): void {
    clearDraft();
    this.isOpen.set(false);
    this.discard.set(false);
    const el = this.dlg().nativeElement;
    if (el.close) el.close(); else el.removeAttribute('open');
  }
  protected pasted(): void { this.finish(); this.saved.emit('Guardado.'); }

  protected type(k: string, f: keyof Cell, e: Event): void {
    const el = e.target as HTMLInputElement;
    const v = maskTime(el.value);
    el.value = v;
    el.setSelectionRange?.(v.length, v.length);
    this.values.update((all) => ({ ...all, [k]: { ...this.cell(k), [f]: v } }));
    if (f === 'score' && !v && this.day()?.[k]) this.removed.update((s) => new Set(s).add(k)); // emptying a stored time removes the game, until Guardar
    this.touched(k);
  }
  protected undo(k: string): void {
    const had = this.day()?.[k];
    this.removed.update((s) => { const n = new Set(s); n.delete(k); return n; });
    this.values.update((all) => ({ ...all, [k]: { score: had?.score ?? '', avg: had?.avg ?? '' } }));
    this.touched(k);
    this.message.set(`${gameName(k)}: se mantiene`);
  }
  private touched(k: string): void {
    this.errors.update(({ [k]: _, ...rest }) => rest);
    if (!this.message().endsWith('se mantiene')) this.message.set('');
    this.restored.set(false);
    if (this.dirty().length) writeDraft({ date: this.date(), values: this.values(), removed: [...this.removed()] });
    else clearDraft();
  }

  protected submit(e: Event): void {
    e.preventDefault();
    if (!this.canSave()) return;
    const p = plan(this.values(), this.removed(), this.day(), this.keys);
    if (Object.keys(p.errors).length) { this.rejected(p.errors); return; }
    if (localToday() !== this.date()) { this.now.set(localToday()); this.midnight.set(true); return; }
    this.send(this.date());
  }

  protected send(date: string): void {
    this.midnight.set(false);
    const p = plan(this.values(), this.removed(), this.day(), this.keys);
    this.date.set(date);
    this.saving.set(true);
    this.message.set('');
    this.api.put<Answer>(URL, { date, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, set: p.set, remove: p.remove }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (r) => {
        this.saving.set(false);
        const changed = r.games.filter((g) => g.status !== 'same');
        if (!changed.length && !r.removed.length) { this.message.set(MSG.same); return; }
        this.finish();
        this.saved.emit([
          changed.length ? `Guardado: ${list(changed.map((g) => `${gameName(g.game)} ${g.score}`))}.` : '',
          r.removed.length ? `Quitado: ${list(r.removed.map(gameName))}.` : '',
        ].filter(Boolean).join(' '));
      },
      error: (err: unknown) => {
        this.saving.set(false);
        const body = err instanceof HttpErrorResponse && err.status === 422 ? (err.error as Rejected) : null;
        if (body?.errors?.length) {
          this.rejected(Object.fromEntries(body.errors.map((x) => [x.game, { field: x.field, text: errorText(x.field, this.cell(x.game)[x.field === 'avg' ? 'avg' : 'score'], x.reason) }])));
        } else if (typeof navigator !== 'undefined' && navigator.onLine === false) this.message.set(MSG.offline);
        else this.message.set(err instanceof HttpErrorResponse && err.status >= 400 ? MSG.failed : MSG.noAnswer); // no status: timeout or dropped connection
      },
    });
  }

  private rejected(errors: Record<string, RowError>): void {
    this.errors.set(errors);
    const bad = this.keys.filter((k) => errors[k]);
    this.message.set(`Revisa: ${list(bad.map(gameName))}.`);
    const first = bad[0];
    if (first) setTimeout(() => this.dlg().nativeElement.querySelector<HTMLElement>(`#lgReg-${first}-${errors[first]!.field === 'avg' ? 'avg' : 'score'}`)?.focus());
  }
}

interface Draft { date: string; values: Values; removed: string[] }
function readDraft(): Draft | null {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null') as Draft | null; } catch { return null; }
}
function writeDraft(d: Draft): void { try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* storage blocked: the sheet works without a draft */ } }
function clearDraft(): void { try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* as above */ } }
