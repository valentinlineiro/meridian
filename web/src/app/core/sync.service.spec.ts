import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
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
  afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

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

  // Ported from tests/syncUi.test.ts (legacy doSync/trackSync/resumeSync): the rest of the state machine.
  describe('the rest of the legacy sync state machine', () => {
    type Script = (r: TestRequest) => void;
    const post = (runId = 7): Script => (r) => r.request.method === 'POST' && r.flush({ ok: true, runId });
    const fail = (status: number) => (r: TestRequest) => r.flush({}, { status, statusText: 'x' });
    /** Answers every pending request with the script, then lets the service's timers run, until it is idle. */
    async function drive(sync: SyncService, script: Script): Promise<number> {
      const http = TestBed.inject(HttpTestingController);
      let polls = 0;
      for (let i = 0; i < 3000; i++) {
        await vi.advanceTimersByTimeAsync(0);
        const pending = http.match(() => true).filter((r) => !r.cancelled);
        for (const r of pending) {
          if (r.request.url === '/api/me/sync/status') polls++;
          script(r);
        }
        if (!pending.length && !sync.busy()) break;
        await vi.advanceTimersByTimeAsync(1000); // under the 10 s request timeout
      }
      return polls;
    }
    const run = (statusReply: (n: number) => Script): Script => {
      let n = 0;
      return (r) => (r.request.method === 'POST' ? post()(r) : statusReply(++n)(r));
    };
    const ok = (body: object): Script => (r) => r.flush(body);

    it('shouldNotReloadThePageWhenTheSyncFails', async () => {
      const sync = TestBed.inject(SyncService);
      sync.start();
      await drive(sync, run(() => ok({ status: 'completed', conclusion: 'failure' })));
      await vi.advanceTimersByTimeAsync(5000);
      expect(location.reload).not.toHaveBeenCalled();
      expect(sync.lastSyncLabel()).toBe('Sincronizar');
      expect(localStorage.getItem('meridian.syncRun')).toBeNull();
    });

    it('shouldDoNothingOnLoadWhenNoRunIsStored', () => {
      const sync = TestBed.inject(SyncService);
      expect(sync.busy()).toBe(false);
      TestBed.inject(HttpTestingController).verify();
    });

    it('shouldNeverShowInternalErrorDetailsWhenTheServerRejectsTheRequest', async () => {
      const sync = TestBed.inject(SyncService);
      sync.start();
      await drive(sync, (r) => r.flush({ ok: false, error: 'GITHUB_ACTIONS_TOKEN not set' }, { status: 500, statusText: 'x' }));
      expect(sync.note()).toBe('Sincronización fallida. Inténtalo de nuevo.');
    });

    it('shouldSayTheManualSyncCouldNotStartWhenGithubRefusesTheServer', async () => {
      const sync = TestBed.inject(SyncService);
      sync.start();
      await drive(sync, (r) => r.flush({ ok: false, code: 'SYNC_UNAVAILABLE', error: 'github responded 401' }, { status: 502, statusText: 'Bad Gateway' }));
      expect(sync.note()).toBe('No se pudo iniciar la sincronización manual. La recogida automática sigue programada diariamente.');
      expect(sync.note()).not.toContain('401'); // no internals
      expect(sync.lastSyncLabel()).toBe('Sincronizar');
      expect(sync.busy()).toBe(false);
      expect(localStorage.getItem('meridian.syncRun')).toBeNull();
    });

    it('shouldKeepTheGenericMessageForAnyOtherServerError', async () => {
      for (const [status, body] of [[502, { ok: false, error: 'bad gateway' }], [500, { ok: false, code: 'SYNC_UNAVAILABLE' }], [503, { ok: false, code: 'SYNC_NOT_CONFIGURED' }]] as const) {
        const sync = TestBed.runInInjectionContext(() => new SyncService());
        sync.start();
        await drive(sync, (r) => r.flush(body, { status, statusText: 'x' }));
        expect(sync.note()).toBe('Sincronización fallida. Inténtalo de nuevo.');
      }
    });

    it('shouldNotTreatALongRunAsAFailure', async () => {
      const sync = TestBed.inject(SyncService);
      const notes: string[] = [];
      sync.start();
      await drive(sync, run((n) => (r) => { notes.push(sync.note()); ok({ status: n < 30 ? 'in_progress' : 'completed', conclusion: 'success' })(r); }));
      expect(notes).toContain('Sigue en marcha. Puedes salir de esta página; la sincronización continuará.');
      expect(notes.some((t) => /fallida/.test(t))).toBe(false);
      expect(sync.lastSyncLabel()).toBe('✓ Sincronizado');
    });

    it('shouldKeepTrackingWhenAStatusReadFailsOnceAndThenAnswers', async () => {
      const sync = TestBed.inject(SyncService);
      sync.start();
      await drive(sync, run((n) => (n === 1 ? fail(503) : ok({ status: 'completed', conclusion: 'success' }))));
      expect(sync.lastSyncLabel()).toBe('✓ Sincronizado');
      expect(sync.note()).toBe('Sincronización completada.');
      expect(localStorage.getItem('meridian.syncRun')).toBeNull(); // cleared because it finished
    });

    it('shouldStopAfterThreeFailuresInARowButKeepTheRunIdToResume', async () => {
      const sync = TestBed.inject(SyncService);
      sync.start();
      const polls = await drive(sync, run(() => fail(503)));
      expect(polls).toBe(3);
      expect(sync.lastSyncLabel()).toBe('Sincronizar');
      expect(sync.note()).toContain('Puede seguir en marcha');
      expect(sync.note()).not.toMatch(/fallida/);
      expect(localStorage.getItem('meridian.syncRun')).toBe('7');
    });

    it('shouldGiveUpPollingAfterThreeStatusRequestsThatNeverAnswer', async () => { // tests/frontendNetwork.test.ts
      const sync = TestBed.inject(SyncService);
      sync.start();
      const polls = await drive(sync, (r) => { if (r.request.method === 'POST') post()(r); }); // status reads are left to time out
      expect(polls).toBe(3);
      expect(sync.busy()).toBe(false);
      expect(sync.note()).toContain('Puede seguir en marcha');
      expect(localStorage.getItem('meridian.syncRun')).toBe('7');
    });

    it('shouldCountOnlyConsecutiveFailures', async () => {
      const sync = TestBed.inject(SyncService);
      sync.start();
      await drive(sync, run((n) => (n % 3 === 0 ? ok({ status: 'in_progress' }) : n > 9 ? ok({ status: 'completed', conclusion: 'success' }) : fail(503))));
      expect(sync.lastSyncLabel()).toBe('✓ Sincronizado');
    });

    it('shouldStopPollingAfterFifteenMinutesWithoutCallingItAFailureOrDroppingTheRun', async () => {
      const sync = TestBed.inject(SyncService);
      sync.start();
      const polls = await drive(sync, run(() => ok({ status: 'in_progress' })));
      expect(polls).toBeGreaterThan(20);
      expect(polls).toBeLessThan(200);
      expect(sync.busy()).toBe(false);
      expect(sync.lastSyncLabel()).toBe('Sincronizar');
      expect(sync.note()).toContain('Sigue en marcha; puedes salir');
      expect(localStorage.getItem('meridian.syncRun')).toBe('7');
    });

    it.each([401, 403, 429])('shouldKeepTheRunIdWhenTheStatusReadAnswers%i', async (status) => {
      const sync = TestBed.inject(SyncService);
      sync.start();
      await drive(sync, run(() => fail(status)));
      expect(localStorage.getItem('meridian.syncRun')).toBe('7');
    });
  });
  it('shouldBumpTheDataVersionBeforeReloadingSoTheCachedStatsAreSkipped', async () => {
    const sync = TestBed.inject(SyncService);
    const http = TestBed.inject(HttpTestingController);
    sync.start();
    http.expectOne({ method: 'POST', url: '/api/me/sync' }).flush({ runId: 7 });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(3000);
    http.expectOne(status(7)).flush({ status: 'completed', conclusion: 'success' });
    await vi.advanceTimersByTimeAsync(0);
    expect(Number(localStorage.getItem('meridian.dataVersion'))).toBeGreaterThan(0);
  });
});
