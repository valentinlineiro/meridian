import { Component, computed, inject, input, signal } from '@angular/core';
import { Compare } from './compare';
import { Group, list, Mates, Openings as OpeningStats, pc0, Phases, safe, Tally, Threats } from '../chess.model';
import { MatchesService } from '../services/matches.service';

const OPENINGS_SHOWN = 8;
const PHASE_NAMES = { opening: 'Apertura', middlegame: 'Medio juego', endgame: 'Final' } as const;
const frac = (t: Tally) => `${t.neutralized} de ${t.faced} (${pc0((t.rate ?? 0) * 100)})`;

// What the owner did when the opponent had a mate in 1 on the board (computed offline by the scheduled analysis).
function threats(th: Threats | null | undefined) {
  if (!th || th.error || !th.totals) return null;
  const tt = th.totals, faced = tt.faced;
  const notes = ['Solo cuenta amenazas de mate en 1. Son tasas descriptivas de posiciones observadas, sin intervalo: las posiciones de una misma partida no son independientes.'];
  if (th.pending) notes.push(th.pending + ' partidas sin analizar');
  if (th.invalid) notes.push(th.invalid + ' no se pudieron reproducir');
  if (th.unknownVersion) notes.push(th.unknownVersion + ' con un formato que este panel no entiende');
  return {
    main: !th.analysed ? 'Todavía no hay partidas analizadas' : !faced ? 'Sin amenazas de mate en 1 en las partidas analizadas'
      : `Neutralizadas ${frac(tt)} · te mataron ${tt.missed} · el rival no las jugó ${tt.unpunished}`,
    phases: faced && th.byPhase ? (Object.keys(PHASE_NAMES) as (keyof typeof PHASE_NAMES)[]).map((k) => PHASE_NAMES[k] + ' ' + (th.byPhase![k].faced ? frac(th.byPhase![k]) : 'sin amenazas')).join(' · ') : '',
    trend: faced && th.recent?.faced ? `Últimas ${th.recent.games} partidas analizadas: ${frac(th.recent)}` + (th.rest?.games && th.rest.faced ? ` · el resto (${th.rest.games}): ${frac(th.rest)}` : '') : '',
    note: notes.join(' · '),
    missed: th.gamesWithMissed || 0,
  };
}

/** The «Repertorio de aperturas & fases» block (src/frontend.ts:181–186; src/dashboard.client.js:1532–1585). */
@Component({
  selector: 'app-openings',
  imports: [Compare],
  template: `
    @if (mates(); as m) {
      <div class="card" id="matesCard" style="display:block"><h2>Cómo terminan tus mates</h2>
        <div class="grid2"><div><div class="muted">Dados</div><div id="matesGiven">@for (x of m.given; track $index) {<div class="row"><b>{{ x.label }}</b><span class="muted">{{ x.games }}</span></div>} @empty {<div class="muted">Ninguno</div>}</div></div>
          <div><div class="muted">Recibidos</div><div id="matesReceived">@for (x of m.received; track $index) {<div class="row"><b>{{ x.label }}</b><span class="muted">{{ x.games }}</span></div>} @empty {<div class="muted">Ninguno</div>}</div></div></div>
        <div class="muted" id="matesNote" style="margin-top:8px">{{ m.note }}</div></div>
    }
    @if (threats(); as t) {
      <div class="card" id="threatsCard" style="display:block"><h2>Amenazas de mate</h2><div id="threatsMain">{{ t.main }}</div><div class="muted" id="threatsPhases" style="margin-top:8px">{{ t.phases }}</div><div class="muted" id="threatsTrend" style="margin-top:4px">{{ t.trend }}</div><div class="muted" id="threatsNote" style="margin-top:8px">{{ t.note }}</div>
        @if (t.missed > 0) {<button class="btn btn-g" id="threatsMissedBtn" type="button" (click)="matches.toggleMissed()" style="margin-top:8px;display:inline-block">{{ matches.missedOnly() ? 'Quitar el filtro de mates no vistos' : 'Ver partidas donde no viste el mate (' + t.missed + ')' }}</button>}
      </div>
    }
    <div class="grid2">
      <div class="card" id="openingsCard"><h2>Repertorio de aperturas</h2>
        <div id="openingsTabs" style="display:flex;gap:6px;margin-bottom:12px"><button type="button" class="btn btn-g" [attr.aria-pressed]="tab() === 'white'" id="tabBtnBlancas" (click)="tab.set('white')">Blancas</button><button type="button" class="btn btn-g" [attr.aria-pressed]="tab() === 'black'" id="tabBtnNegras" (click)="tab.set('black')">Negras</button></div>
        @let op = openingsView();
        <div id="openingsWhite" [hidden]="tab() !== 'white'">@if (op) {<m-compare [groups]="op.white" [total]="total()" [cap]="shown" noun="aperturas" />} @else if (op === null) {<div class="muted">No disponible</div>}</div>
        <div id="openingsBlack" [hidden]="tab() !== 'black'">@if (op) {<m-compare [groups]="op.black" [total]="total()" [cap]="shown" noun="aperturas" />} @else if (op === null) {<div class="muted">No disponible</div>}</div>
        <div class="muted" id="openingsPop" style="margin-top:8px">{{ op?.pop }}</div></div>
      <div class="card" id="phasesCard"><h2>Fases de partida</h2><div class="muted" style="margin-bottom:8px">La fase es aquella en la que terminó la partida, no cómo juegas esa fase. Una desconexión corta la partida donde estuviera: por eso se muestran aparte.</div>
        @let ph = phasesView();
        <div id="phasesBody">@if (ph) {<m-compare [groups]="ph.groups" [total]="total()" />} @else if (ph === null) {<div class="muted">No disponible</div>}</div>
        <div class="muted" id="phasesMeta" style="margin-top:8px">{{ ph?.meta }}</div></div>
    </div>
  `,
})
export class Openings {
  protected readonly matches = inject(MatchesService);
  /** undefined = not loaded yet; null = that request failed. */
  readonly openings = input<OpeningStats | null | undefined>(undefined);
  readonly phases = input<Phases | null | undefined>(undefined);
  readonly matesStats = input<Mates | null | undefined>(undefined);
  readonly threatStats = input<Threats | null | undefined>(undefined);
  readonly total = input(1);

  protected readonly shown = OPENINGS_SHOWN;
  protected readonly tab = signal<'white' | 'black'>('white');

  protected readonly openingsView = computed(() => {
    const op = this.openings();
    if (op === undefined) return undefined;
    if (!op || op.error) return null;
    const white = list<Group>(op.white ?? []), black = list<Group>(op.black ?? []);
    if (!white || !black) return null;
    return {
      white, black,
      pop: op.population ? `Hidratadas: ${op.population.hydrated} / ${op.population.totalMatches} partidas` + ((op.unclassified ?? 0) > 0 ? ` · ${op.unclassified} sin clasificar` : '') : '',
    };
  });
  protected readonly phasesView = computed(() => {
    const ph = this.phases();
    if (ph === undefined) return undefined;
    if (!ph || ph.error) return null;
    const h = ph.population?.hydrated;
    return { groups: ph.phases ?? [], meta: `Mediana: ${ph.medianPlies ?? '—'} plies · Hidratadas: ${h ?? '—'} partidas` };
  });
  // Shown only when there is something to show: how the games won or lost by checkmate ended.
  protected readonly mates = computed(() => {
    const mt = this.matesStats();
    const given = list<{ label: string; games: number }>(mt?.given ?? []), received = list<{ label: string; games: number }>(mt?.received ?? []);
    if (!mt || mt.error || !given || !received || !(given.length || received.length || (mt.unclassified ?? 0) > 0)) return null;
    return { given, received, note: (mt.unclassified ?? 0) > 0 ? `${mt.unclassified} mates sin clasificar` : '' };
  });
  // a threats body it cannot read hides the card, as an absent one does
  protected readonly threats = computed(() => safe(() => threats(this.threatStats()), null));
}
