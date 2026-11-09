import { afterNextRender, afterRenderEffect, Component, computed, effect, ElementRef, inject, Injector, linkedSignal, untracked, viewChild } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';
import { ApiClient } from '../../../core/api-client';
import { ChessBoard } from './chess-board';
import { MatchesService } from '../services/matches.service';

interface Ply { san: string; fen: string }
interface Game {
  ok: boolean; userColor?: string; opponent?: string | null; startFen: string; plies: Ply[]; missedPlies?: number[];
  engineWorst?: { ply: number; loss: number; best: string; bestSan?: string | null }[]; engineSummary?: { moves: number; serious: number; acpl?: number | null } | null;
}
const ILLEGAL = 'Las jugadas guardadas no son una partida válida.';
const MISSING = 'No hay partida completa guardada para esta partida.';

/**
 * Port of the game viewer (src/dashboard.client.js:1396–1446, #gameModal): the server validates the moves and returns
 * SAN + FEN per ply, so this only paints boards. Focus is trapped while open and goes back where it was on close.
 */
@Component({
  selector: 'app-match-detail-modal',
  imports: [ChessBoard],
  host: { '(document:keydown)': 'onKey($event)' },
  template: `
    @if (m.openId(); as id) {
      <div id="gameModal" class="modal" style="display:flex" role="dialog" aria-modal="true" aria-labelledby="gTitle" (click)="$event.target === $event.currentTarget && close()">
        <div class="card gamecard">
          <div class="gamehead"><b id="gTitle">{{ title() }}</b><button class="btn btn-g" id="gClose" type="button" (click)="close()" aria-label="Cerrar" #closeBtn>✕</button></div>
          <div id="gErr" class="muted">{{ error() }}</div>
          @if (game(); as g) {
            @let n = ply();
            <div id="gBody" style="display:block">
              <div class="gamegrid"><m-chess-board id="gBoard" [fen]="n ? g.plies[n - 1].fen : g.startFen" [flip]="g.userColor === 'black'" />
                <div id="gMoves" class="moves">@for (p of g.plies; track $index; let i = $index) {@if (i % 2 === 0) {<span class="muted">{{ i / 2 + 1 }}.</span>{{ ' ' }}}<a href="#" class="gm" [class.on]="i + 1 === n" (click)="go($event, i + 1)" (keydown.space)="go($event, i + 1)">{{ p.san }}</a>{{ ' ' }}}</div></div>
              <div id="gMissed" class="muted" style="margin-top:8px">@for (k of g.missedPlies ?? []; track k) {<div><a href="#" (click)="go($event, k - 1)" (keydown.space)="go($event, k - 1)">Jugada {{ k }} ({{ g.plies[k - 1]?.san ?? '' }}): el rival tenía mate en 1 y lo jugó</a></div>}</div>
              <div id="gErrors" class="muted" style="margin-top:8px">
                @if (g.engineSummary; as sm) {<div>Según el motor: {{ sm.serious }} errores graves en {{ sm.moves }} jugadas tuyas{{ sm.acpl === null || sm.acpl === undefined ? '' : ' · pérdida media ' + round(sm.acpl) + ' cp' }}</div>}
                @for (x of g.engineWorst ?? []; track x.ply) {<div><a href="#" (click)="go($event, x.ply - 1)" (keydown.space)="go($event, x.ply - 1)">Jugada {{ x.ply }} ({{ g.plies[x.ply - 1]?.san ?? '' }}): pierdes {{ x.loss }} cp; el motor prefería {{ x.bestSan || x.best }}</a></div>}
              </div>
              <div class="gamectl"><button class="btn btn-g" id="gPrev" type="button" [disabled]="n === 0" (click)="step(-1)" aria-label="Jugada anterior">‹</button><span class="muted" id="gPos">{{ n }} / {{ g.plies.length }}</span><button class="btn btn-g" id="gNext" type="button" [disabled]="n === g.plies.length" (click)="step(1)" aria-label="Jugada siguiente">›</button><a class="btn btn-g" id="gPgn" download style="text-decoration:none;margin-left:auto" [href]="'/api/me/matches/' + enc(id) + '/game.pgn'">Descargar PGN</a></div>
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class MatchDetailModal {
  protected readonly m = inject(MatchesService);
  private readonly api = inject(ApiClient);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly closeBtn = viewChild<ElementRef<HTMLButtonElement>>('closeBtn');
  private opener: HTMLElement | null = null;

  // A new id cancels the request for the one before: a late game never lands under another title.
  private readonly res = rxResource<Game | { error: string }, string | undefined>({
    params: () => this.m.openId() ?? undefined,
    stream: ({ params: id }) => this.api.get<Game>(`/api/me/matches/${encodeURIComponent(id)}/game`).pipe(
      map((b): Game | { error: string } => { if (!b?.ok) throw { error: b }; // every ply must carry its position: a game the viewer cannot paint is reported, not half-drawn
        return Array.isArray(b.plies) && typeof b.startFen === 'string' && b.plies.every((p) => typeof p?.fen === 'string' && typeof p.san === 'string') ? b : { error: MISSING }; }),
      catchError((e) => of({ error: e?.error?.code === 'ILLEGAL_GAME' ? ILLEGAL : MISSING })),
    ),
  });
  private readonly body = computed(() => this.res.hasValue() && !this.res.isLoading() ? this.res.value() : null);
  protected readonly game = computed(() => { const b = this.body(); return b && 'plies' in b ? b : null; });
  protected readonly error = computed(() => { const b = this.body(); return b && 'error' in b ? b.error : ''; });
  protected readonly title = computed(() => {
    const g = this.game();
    return g ? `vs ${g.opponent || 'bot'} · ${g.userColor === 'black' ? 'negras' : 'blancas'}` : this.error() ? 'Partida' : 'Cargando partida…';
  });
  protected readonly ply = linkedSignal(() => { this.game(); return 0; });

  constructor() {
    const injector = inject(Injector);
    effect(() => {
      if (!this.m.openId()) return;
      untracked(() => {
        this.opener ??= document.activeElement as HTMLElement | null;
        afterNextRender(() => this.closeBtn()?.nativeElement.focus(), { injector });
      });
    });
    afterRenderEffect(() => { this.ply(); this.host.querySelector<HTMLElement>('#gMoves .on')?.scrollIntoView?.({ block: 'nearest' }); });
  }

  close(): void {
    this.m.openId.set(null);
    this.opener?.focus();
    this.opener = null;
  }

  protected step(d: number): void {
    const g = this.game();
    if (g) this.ply.set(Math.max(0, Math.min(g.plies.length, this.ply() + d)));
  }

  /** A move, a missed threat or an engine error: show that position (for the last two, the one before the move). */
  protected go(e: Event, n: number): void {
    e.preventDefault();
    const g = this.game();
    if (g) this.ply.set(Math.max(0, Math.min(g.plies.length, n)));
  }

  protected onKey(e: KeyboardEvent): void {
    if (!this.m.openId()) return;
    if (e.key === 'Escape') this.close();
    else if (e.key === 'ArrowLeft') { e.preventDefault(); this.step(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); this.step(1); }
    else if (e.key === 'Tab') {
      const f = [...this.host.querySelectorAll<HTMLElement>('#gameModal button:not([disabled]), #gameModal a[href]')];
      if (!f.length) return;
      const i = f.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      f[e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i === f.length - 1 ? 0 : i + 1)].focus();
    }
  }

  protected round(n: number): number { return Math.round(n); }
  protected enc(id: string): string { return encodeURIComponent(id); }
}
