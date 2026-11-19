import { Component, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, Observable, of } from 'rxjs';
import { ApiClient } from '../../core/api-client';
import { safe } from '../../core/guard';
import { GameReport } from './game-report';
import { GamesChart } from './games-chart';
import { GamesRegister } from '../../shared/games-register/games-register';
import { ErrorBlock } from '../../shared/error-block';
import { Help } from '../../shared/help';
import { ResultBars } from '../../shared/result-bars';
import { Section } from '../../shared/section';
import { Segmented } from '../../shared/segmented';
import { VerdictPill } from '../../shared/verdict';
import { Day, defaultTrajGame, GAME_NAMES, gameName, difficultyGrid, gamesHero, overview, summaryRows, localToday, lossRows, Range, RANGES, Summary, trajectory } from './games.model';

// Port of the LinkedIn Games tab (src/frontend.ts:489–520, src/dashboard.client.js:1787–1971).
const orNull = <T>(o: Observable<T>) => o.pipe(catchError(() => of(null)));
const NA = 'No disponible';
const HERO_IDLE = { since: '', meta: '—', days: '—' };

@Component({
  selector: 'app-games',
  imports: [ErrorBlock, GameReport, GamesChart, GamesRegister, Help, ResultBars, RouterLink, Section, Segmented, VerdictPill],
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
  /** What the last save did ("Guardado: Zip 0:48."), until the next one. */
  protected readonly saveNote = signal('');
  protected saved(note: string): void { this.saveNote.set(note); this.draftWaiting.set(false); this.data.reload(); }
  private draftChecked = false;
  protected readonly draftWaiting = signal(false);
  constructor() {
    // A sheet interrupted by a login redirect or a reload leaves a "Continuar" button, once today's record has been read; it never opens by itself.
    effect(() => {
      if (!this.loaded() || this.draftChecked || this.game()) return; // a game's report has no sheet: wait for the hub
      this.draftChecked = true;
      if (GamesRegister.hasDraft()) untracked(() => this.draftWaiting.set(true));
    });
  }
  protected readonly note = computed(() => {
    const r = this.loaded();
    return !r || this.summary() === null ? '' : r.d === null ? 'No se pudo cargar el día.' : '';
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
  /** Today's stored record for the register dialog (null when the day could not be read). */
  protected readonly dayGames = computed(() => this.recorded() ? this.loaded()!.d!.day!.games! : null);
  /** Today's six games and whether each is recorded; empty until the summary answered, as in legacy. */
  private readonly todayGames = computed(() => {
    if (!this.summary()) return [];
    const done = this.recorded() ?? new Set<string>();
    return Object.keys(GAME_NAMES).map((k) => ({ k, done: done.has(k) }));
  });
  /** One row per game: today's time, "Sin registrar", or "No se pudo leer" when the day could not be read (unknown is never said as unrecorded). */
  protected readonly today = computed(() => {
    if (!this.summary()) return [];
    const day = this.dayGames() as Record<string, { score?: string | null }> | null;
    return Object.keys(GAME_NAMES).map((k) => {
      const name = gameName(k), rec = day?.[k];
      const state = !day ? 'unknown' : rec ? 'done' : 'todo';
      const text = state === 'unknown' ? 'No se pudo leer' : rec ? rec.score || 'Solo media' : 'Registrar';
      return { k, name, state, text, aria: state === 'done' ? `${name}, registrado ${text}. Editar` : state === 'todo' ? `${name}, sin registrar. Registrar` : `${name}, no se pudo leer hoy. Abrir` };
    });
  });
  protected readonly noneDone = computed(() => this.todayGames().every((g) => !g.done));
  protected readonly allDone = computed(() => this.todayGames().length > 0 && this.todayGames().every((g) => g.done));
  /** "Hoy · 2 registrados" (never "N de 6" or a count of what is left: a log is not a to-do list); just "Hoy" while nothing is logged or the day could not be read: unknown is never said as zero. */
  protected readonly todayTitle = computed(() => {
    const games = this.todayGames(), done = this.recorded();
    if (!games.length) return '';
    if (!done) return 'Hoy';
    const left = games.filter((g) => !g.done).length;
    const n = games.length - left;
    return n === 0 ? 'Hoy' : left ? `Hoy · ${n} registrado${n === 1 ? '' : 's'}` : 'Hoy · todo registrado';
  });
  protected readonly loss = computed(() => { const s = this.summary(); return s ? safe(() => lossRows(s) ?? null, null) : undefined; });
  protected readonly diff = computed(() => { const s = this.summary(); return s ? safe(() => difficultyGrid(s) ?? null, null) : undefined; });
  /** Cards keep the register's order, so a game is always in the same place; the overview sentence still names the worst first. */
  protected readonly rows = computed(() => {
    const s = this.summary(), range = this.range(), order = Object.keys(GAME_NAMES);
    return s ? safe(() => summaryRows(s, range).sort((a, b) => order.indexOf(a.k) - order.indexOf(b.k)).map((r) => {
      const n = s.games[r.k]!.windows[range].eff.nEff, few = r.verdict.state === 'few-data';
      // too few games to judge: the number is how many have an average in the period, never a big percentage beside "Pocos datos"; the caption is short, the help says "frente a la media"
      return { ...r, big: few ? String(n) : r.big, cap: few ? (n === 1 ? 'partida' : 'partidas') : r.cap.replace(' que la media', '') };
    }), []) : [];
  });
  protected readonly overview = computed(() => safe(() => overview(this.rows()), null));
  /** undefined: nothing to draw (loading, failed, no games); null: the trajectory could not be read. */
  protected readonly traj = computed(() => {
    const s = this.summary(), range = this.range(), pick = this.trajPick();
    if (!s || !Object.keys(s.games).length) return undefined;
    const keys = Object.keys(s.games);
    const game = pick && keys.includes(pick) ? pick : safe(() => defaultTrajGame(s), keys[0]);
    return { game, options: keys.map((k) => ({ k, l: gameName(k) })), view: safe(() => trajectory(s, game, range), null) };
  });
}
