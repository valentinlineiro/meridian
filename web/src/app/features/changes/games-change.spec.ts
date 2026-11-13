import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import { GamesChangeCard } from './games-change';
import { GamesChange } from './games-change.model';

const change = (extra: Partial<GamesChange> = {}): GamesChange => ({
  mode: 'compare', since: '2026-10-08', until: '2026-11-13', elapsedDays: 36, playedDaysInWindow: 9,
  games: [
    { game: 'zip', from: { kind: 'estable' }, to: { kind: 'bajando' }, outcome: { kind: 'cambio_confirmado', from: { kind: 'estable' }, to: { kind: 'bajando' } } },
    { game: 'wend', from: { kind: 'estable' }, to: { kind: 'estable' }, outcome: { kind: 'sin_cambios', state: { kind: 'estable' } } },
  ], ...extra });

describe('GamesChangeCard', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<GamesChangeCard>;
  const tick = async () => { TestBed.tick(); await new Promise((r) => setTimeout(r)); TestBed.tick(); };
  const open = async (since: string | null, until: string) => {
    fixture = TestBed.createComponent(GamesChangeCard);
    fixture.componentRef.setInput('since', since);
    fixture.componentRef.setInput('until', until);
    await tick();
  };
  const req = () => http.expectOne((r) => r.url === '/api/me/linkedin-games/changes');

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  it('shouldAskForTheLocalPlayDatesOfTheWindow', async () => {
    const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env; // the web tsconfig has no Node typings
    const was = env['TZ'];
    env['TZ'] = 'Pacific/Auckland'; // UTC+13 in October: 23:30Z on the 8th is already the 9th there
    try {
      await open('2026-10-08T23:30:00.000Z', '2026-11-13T12:00:00.000Z');
      const r = req();
      expect(r.request.params.get('since')).toBe('2026-10-09');
      expect(r.request.params.get('until')).toBe('2026-11-14');
      r.flush({ ok: true, change: change() });
    } finally { if (was === undefined) delete env['TZ']; else env['TZ'] = was; }
  });

  it('shouldAskWithoutSinceInTheHistoryMode', async () => {
    await open(null, '2026-11-13T10:00:00.000Z');
    const r = req();
    expect(r.request.params.has('since')).toBe(false);
    r.flush({ ok: true, change: { mode: 'current-only', since: null, until: '2026-11-13', elapsedDays: null, playedDaysInWindow: null, games: [] } });
  });

  it('shouldRenderOneRowPerGameWithItsPillAndTheHeading', async () => {
    await open('2026-10-08T12:00:00.000Z', '2026-11-13T12:00:00.000Z');
    req().flush({ ok: true, change: change() });
    await tick();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('#changesGamesHeading')!.textContent).toBe('Games · 8 oct → 13 nov (36 días)');
    expect(el.querySelector('#changesGamesSummary')!.textContent).toBe('1 cambió, 1 sin cambios');
    const rows = [...el.querySelectorAll('.cg-row')];
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain('Zip: de Estable a Bajando');
    expect(rows[0]!.querySelector('app-verdict')).not.toBeNull();
  });

  it('shouldShowNoDisponibleWhenTheRequestFails', async () => {
    await open('2026-10-08T12:00:00.000Z', '2026-11-13T12:00:00.000Z');
    req().flush({ ok: false }, { status: 500, statusText: 'x' });
    await tick();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No disponible');
  });
});
