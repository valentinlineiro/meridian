import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BROWSER_LOCATION } from './api-client';
import { SyncService } from './sync.service';

describe('SyncService', () => {
  const location = { pathname: '/overview', search: '', href: '', reload: vi.fn() };

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    location.reload.mockClear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: BROWSER_LOCATION, useValue: location }],
    });
  });
  afterEach(() => vi.useRealTimers());

  const status = (runId: number) => (r: { url: string; params: { get(k: string): string | null } }) =>
    r.url === '/api/me/sync/status' && r.params.get('runId') === String(runId);

  it('shouldPollSyncStatusUntilDoneThenReload', async () => {
    const sync = TestBed.inject(SyncService);
    const http = TestBed.inject(HttpTestingController);

    sync.start();
    expect(sync.busy()).toBe(true);
    http.expectOne({ method: 'POST', url: '/api/me/sync' }).flush({ runId: 7 });
    await vi.advanceTimersByTimeAsync(0);
    expect(localStorage.getItem('meridian.syncRun')).toBe('7');

    http.expectOne(status(7)).flush({ status: 'queued' });
    await vi.advanceTimersByTimeAsync(0);
    expect(sync.lastSyncLabel()).toBe('En cola…');
    expect(sync.note()).toBe('La sincronización está en cola.');

    await vi.advanceTimersByTimeAsync(3000);
    http.expectOne(status(7)).flush({ status: 'in_progress' });
    await vi.advanceTimersByTimeAsync(0);
    expect(sync.lastSyncLabel()).toBe('Sincronizando…');
    expect(sync.busy()).toBe(true);

    await vi.advanceTimersByTimeAsync(3000);
    http.expectOne(status(7)).flush({ status: 'completed', conclusion: 'success' });
    await vi.advanceTimersByTimeAsync(0);
    expect(sync.lastSyncLabel()).toBe('✓ Sincronizado');
    expect(sync.note()).toBe('Sincronización completada.');
    expect(sync.busy()).toBe(false);
    expect(localStorage.getItem('meridian.syncRun')).toBeNull();
    expect(location.reload).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(800);
    expect(location.reload).toHaveBeenCalledOnce();
    http.verify();
  });

  it('shouldFollowTheRunningSyncWhenStartReturns409', async () => {
    const sync = TestBed.inject(SyncService);
    const http = TestBed.inject(HttpTestingController);

    sync.start();
    http.expectOne('/api/me/sync').flush({ runId: 9 }, { status: 409, statusText: 'Conflict' });
    await vi.advanceTimersByTimeAsync(0);

    http.expectOne(status(9)).flush({ status: 'completed', conclusion: 'failure' });
    await vi.advanceTimersByTimeAsync(0);
    expect(sync.note()).toBe('Sincronización fallida. Inténtalo de nuevo.');
    expect(sync.busy()).toBe(false);
  });

  it('shouldResumeTheStoredRunWhenCreated', async () => {
    localStorage.setItem('meridian.syncRun', '5');
    const sync = TestBed.inject(SyncService);
    expect(sync.busy()).toBe(true);
    expect(sync.lastSyncLabel()).toBe('Sincronizando…');

    TestBed.inject(HttpTestingController).expectOne(status(5)).flush(null, { status: 404, statusText: 'Not Found' });
    await vi.advanceTimersByTimeAsync(0);
    expect(sync.busy()).toBe(false);
    expect(localStorage.getItem('meridian.syncRun')).toBeNull();
    expect(sync.note()).toBe('No se pudo consultar el estado de la sincronización.');
  });
});
