import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, Observable, of } from 'rxjs';
import { ApiClient } from '../../core/api-client';
import { safe } from '../../core/guard';
import { GameReport } from './game-report';
import { GamesChart } from './games-chart';
import { GamesQuickEntry } from './games-quick-entry';
import { Help } from '../../shared/help';
import { Section } from '../../shared/section';
import { Segmented } from '../../shared/segmented';
import { VerdictPill } from '../../shared/verdict';
import { Day, defaultTrajGame, GAME_NAMES, gameName, difficultyGrid, gamesHero, summaryRows, localToday, lossRows, Range, RANGES, Summary, trajectory } from './games.model';

// Port of the LinkedIn Games tab (src/frontend.ts:489–520, src/dashboard.client.js:1787–1971).
const orNull = <T>(o: Observable<T>) => o.pipe(catchError(() => of(null)));
const NA = 'No disponible';
const HERO_IDLE = { label: 'LinkedIn Games · racha actual', streak: '—', meta: '—', days: '—' };

@Component({
  selector: 'app-games',
  imports: [GameReport, GamesChart, GamesQuickEntry, Help, RouterLink, Section, Segmented, VerdictPill],
  templateUrl: './games.html',
})
export class Games {
  /** The `:game` route param (absent on /games): with it the view is the report of that game. */
  readonly game = input<string>();

  private readonly api = inject(ApiClient);

  protected readonly ranges = RANGES;
  /** The `?r=` query param (bound by the router): the period lives in the URL so Back and shared links keep it. */
  readonly r = input<string>();
  private readonly router = inject(Router);
  protected readonly range = linkedSignal<Range>(() => RANGES.find((x) => x.k === this.r())?.k ?? '28');
  protected pickRange(k: string): void {
    this.range.set(k as Range);
    void this.router.navigate([], { queryParams: { r: k === '28' ? null : k }, queryParamsHandling: 'merge' });
  }
  protected readonly gameName = gameName;
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
  /** The games recorded today; null when the day could not be read (a failed request, or a body that is not a plain object). */
  private readonly recorded = computed((): Set<string> | null => {
    const g: unknown = this.loaded()?.d?.day?.games;
    return g && typeof g === 'object' && !Array.isArray(g) ? new Set(Object.keys(g)) : null;
  });
  /** Today's six games; a recorded one is ticked. Shown once the summary answered, as in legacy. */
  protected readonly chips = computed(() => {
    if (!this.summary()) return [];
    const done = this.recorded() ?? new Set<string>();
    return Object.keys(GAME_NAMES).map((k) => ({ k, name: GAME_NAMES[k], done: done.has(k), text: (done.has(k) ? '✓ ' : '') + GAME_NAMES[k] }));
  });
  /** "Hoy · 2 de 6 registrados"; just "Hoy" while the day could not be read: unknown is never said as zero. */
  protected readonly todayTitle = computed(() => {
    const chips = this.chips(), done = this.recorded();
    if (!chips.length) return '';
    return done ? `Hoy · ${chips.filter((c) => c.done).length} de ${chips.length} registrados` : 'Hoy';
  });
  protected readonly loss = computed(() => { const s = this.summary(); return s ? safe(() => lossRows(s) ?? null, null) : undefined; });
  protected readonly diff = computed(() => { const s = this.summary(); return s ? safe(() => difficultyGrid(s) ?? null, null) : undefined; });
  protected readonly rows = computed(() => { const s = this.summary(), range = this.range(); return s ? safe(() => summaryRows(s, range), []) : []; });
  /** undefined: nothing to draw (loading, failed, no games); null: the trajectory could not be read. */
  protected readonly traj = computed(() => {
    const s = this.summary(), range = this.range(), pick = this.trajPick();
    if (!s || !Object.keys(s.games).length) return undefined;
    const keys = Object.keys(s.games);
    const game = pick && keys.includes(pick) ? pick : safe(() => defaultTrajGame(s), keys[0]);
    return { game, options: keys.map((k) => ({ k, l: gameName(k) })), view: safe(() => trajectory(s, game, range), null) };
  });
}
