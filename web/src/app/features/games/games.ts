import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, Observable, of } from 'rxjs';
import { ApiClient } from '../../core/api-client';
import { safe } from '../../core/guard';
import { GamesChart } from './games-chart';
import { GamesQuickEntry } from './games-quick-entry';
import { GamesTable } from './games-table';
import { Help } from '../../shared/help';
import { Section } from '../../shared/section';
import { Segmented } from '../../shared/segmented';
import { Stats } from '../../shared/stats';
import { VerdictPill } from '../../shared/verdict';
import { cardOrder, Day, defaultTrajGame, GAME_NAMES, gameCard, gameName, gamesHero, localToday, Range, RANGES, Summary, trajectory, weekdayRows } from './games.model';

// Port of the LinkedIn Games tab (src/frontend.ts:489–520, src/dashboard.client.js:1787–1971).
const orNull = <T>(o: Observable<T>) => o.pipe(catchError(() => of(null)));
const NA = 'No disponible';
const HERO_IDLE = { label: 'LinkedIn Games · racha actual', streak: '—', meta: '—', days: '—' };

@Component({
  selector: 'app-games',
  imports: [GamesChart, GamesQuickEntry, GamesTable, Help, Section, Segmented, Stats, VerdictPill],
  templateUrl: './games.html',
})
export class Games {
  private readonly api = inject(ApiClient);

  protected readonly ranges = RANGES;
  protected readonly range = signal<Range>('28');
  /** The game the user picked for the chart; one that is not in the summary falls back to the most observed. */
  protected readonly trajPick = signal<string | null>(null);

  // Summary and today's record, each failing on its own; reload() (after a save) cancels a request still in flight.
  protected readonly data = rxResource({
    stream: () => {
      const t = localToday();
      return forkJoin({
        s: orNull(this.api.get<{ summary?: Summary }>('/api/me/linkedin-games/summary', { today: t })),
        d: orNull(this.api.get<{ day?: Day }>('/api/me/linkedin-games', { date: t })),
      });
    },
  });
  private readonly loaded = computed(() => this.data.hasValue() ? this.data.value() : undefined);
  /** undefined while loading, null when the summary failed or has no games object. */
  protected readonly summary = computed((): Summary | null | undefined => {
    const r = this.loaded();
    if (!r) return undefined;
    const s = r.s?.summary;
    return s && typeof s.games === 'object' && s.games !== null ? s : null;
  });
  protected readonly note = computed(() => {
    const r = this.loaded();
    return !r ? '' : this.summary() === null ? 'No se pudo cargar el resumen.' : r.d === null ? 'No se pudo cargar el día.' : '';
  });
  protected readonly hero = computed(() => {
    const s = this.summary();
    return s ? safe(() => gamesHero(s), { ...HERO_IDLE, meta: NA }) : HERO_IDLE;
  });
  /** Today's six games; a recorded one is ticked. Shown once the summary answered, as in legacy. */
  protected readonly chips = computed(() => {
    if (!this.summary()) return [];
    const g = this.loaded()?.d?.day?.games;
    const done = new Set(g && typeof g === 'object' ? Object.keys(g) : []);
    return Object.keys(GAME_NAMES).map((k) => ({ k, name: GAME_NAMES[k], done: done.has(k), text: (done.has(k) ? '✓ ' : '') + GAME_NAMES[k] }));
  });
  protected readonly week = computed(() => { const s = this.summary(); return s ? safe(() => weekdayRows(s), null) : undefined; });
  protected readonly cards = computed(() => {
    const s = this.summary(), range = this.range();
    if (!s) return [];
    return safe(() => cardOrder(s), [] as string[]).map((k) => safe(() => gameCard(k, s.games[k], s, range), { k, name: gameName(k), na: true as const }));
  });
  /** undefined: nothing to draw (loading, failed, no games); null: the trajectory could not be read. */
  protected readonly traj = computed(() => {
    const s = this.summary(), range = this.range(), pick = this.trajPick();
    if (!s || !Object.keys(s.games).length) return undefined;
    const keys = Object.keys(s.games);
    const game = pick && keys.includes(pick) ? pick : safe(() => defaultTrajGame(s), keys[0]);
    return { game, options: keys.map((k) => ({ k, l: gameName(k) })), view: safe(() => trajectory(s, game, range), null) };
  });
}
