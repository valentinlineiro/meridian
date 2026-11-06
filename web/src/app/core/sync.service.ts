import { inject, Injectable, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ApiClient, BROWSER_LOCATION } from './api-client';

// Port of doSync/trackSync/resumeSync (src/dashboard.client.js:168-225). Same storage key, so a run started on the
// legacy page resumes here and vice versa.
const SYNC_KEY = 'meridian.syncRun';
const store = {
  get: (): number | null => { try { return Number(localStorage.getItem(SYNC_KEY)) || null; } catch { return null; } },
  set: (id: number) => { try { localStorage.setItem(SYNC_KEY, String(id)); } catch { /* storage blocked */ } },
  clear: () => { try { localStorage.removeItem(SYNC_KEY); } catch { /* storage blocked */ } },
};
// A failed status read says nothing about the run: it keeps going remotely. Tolerate a few in a row, and never drop the
// run id for a transient failure or for the wait limit, so leaving and coming back resumes the same run. Only a 404
// (the API's "no such account/run") clears it; 401 (session, redirects to login), 403 and 429 may well be recoverable.
const SYNC_MAX_FAILS = 3;
const SYNC_MAX_WAIT_MS = 15 * 60 * 1000;
const STATUS_FAILED = 'No se pudo consultar el estado de la sincronización.';
const RUN_FAILED = 'Sincronización fallida. Inténtalo de nuevo.';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface SyncStatus { status: string; conclusion?: string | null }

@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly api = inject(ApiClient);
  private readonly location = inject(BROWSER_LOCATION);
  readonly busy = signal(false);
  readonly note = signal('');
  /** The sync button's label: what the run is doing now. */
  readonly lastSyncLabel = signal('Sincronizar');

  constructor() {
    const id = store.get();
    if (!id) return;
    this.ui('Sincronizando…', true, '');
    void this.track(id);
  }

  start(): void {
    void this.run();
  }

  private ui(label: string, busy: boolean, note: string): void {
    this.lastSyncLabel.set(label);
    this.busy.set(busy);
    this.note.set(note);
  }

  private idle(label: string, note: string): void {
    this.ui(label, false, note);
  }

  private async run(): Promise<void> {
    this.ui('Iniciando…', true, '');
    let runId: number | undefined;
    try {
      runId = (await firstValueFrom(this.api.post<{ runId?: number }>('/api/me/sync'))).runId;
    } catch (e) {
      // Status 0 / timeout: the request never got an answer. Any other status is an answer; 409 = a run is already going, follow it.
      if (!(e instanceof HttpErrorResponse) || e.status === 0) return this.idle('Sincronizar', 'No se pudo iniciar la sincronización.');
      if (e.status === 409) runId = e.error?.runId;
    }
    if (!runId) return this.idle('Sincronizar', RUN_FAILED);
    store.set(runId);
    return this.track(runId);
  }

  private async track(runId: number): Promise<void> {
    const t0 = Date.now();
    let fails = 0;
    for (;;) {
      let s: SyncStatus;
      try {
        s = await firstValueFrom(this.api.get<SyncStatus>('/api/me/sync/status', { runId }));
        fails = 0;
      } catch (e) {
        if (e instanceof HttpErrorResponse && e.status === 404) { store.clear(); return this.idle('Sincronizar', STATUS_FAILED); }
        if (++fails >= SYNC_MAX_FAILS) return this.idle('Sincronizar', STATUS_FAILED + ' Puede seguir en marcha; vuelve a abrir la página para retomarlo.');
        await sleep(3000);
        continue;
      }
      if (Date.now() - t0 > SYNC_MAX_WAIT_MS && s.status !== 'completed')
        return this.idle('Sincronizar', 'Sigue en marcha; puedes salir. La sincronización continuará.');
      if (s.status === 'completed') {
        store.clear();
        if (s.conclusion !== 'success') return this.idle('Sincronizar', RUN_FAILED);
        // A full reload is the one refresh known to show the new data (partial reloads left the list stale).
        this.idle('✓ Sincronizado', 'Sincronización completada.');
        setTimeout(() => this.location.reload(), 800);
        return;
      }
      const waiting = s.status !== 'in_progress';
      const slow = Date.now() - t0 > 60_000;
      this.ui(waiting ? 'En cola…' : 'Sincronizando…', true,
        waiting ? 'La sincronización está en cola.'
          : slow ? 'Sigue en marcha. Puedes salir de esta página; la sincronización continuará.'
            : 'El collector está en marcha. Puede tardar unos minutos.');
      await sleep(slow ? 10_000 : 3000);
    }
  }
}
