import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { pc1, pctCi } from '../../core/format';
import { dec1, Group, list, NA, pc0, safe } from './chess.model';

const SEG_LABELS: Record<string, string> = { noisy_neural: 'Noisy Neural', neural: 'Neural', blended: 'Blended', stockfish: 'Stockfish', pvp: 'PvP', bot: 'Bots', white: 'Blancas', black: 'Negras' };

// Bars are shares of decided games; unknowns are reported apart.
function row(g: Group, total: number) {
  const dec = g.decided || 0, w = dec ? Math.round(g.wins / dec * 100) : 0, l = dec ? Math.round(g.losses / dec * 100) : 0;
  const c = g.competitive;
  return {
    label: g.label || g.name || SEG_LABELS[g.key] || g.key,
    games: `${g.games} · ${total ? dec1(g.games / total * 100) : '0'} %`,
    w, l, d: dec ? 100 - w - l : 0,
    win: 'Win ' + pctCi(g.winRate, g.winRateCi),
    score: 'Score ' + (g.scoreRate != null ? pc1(g.scoreRate * 100) : '—'),
    basis: `· barra sobre ${dec} decididas` + (g.unknown ? ` · ${g.unknown} sin resultado` : ''),
    // P3: only rows that carry the figures (phases) say where the owner's disconnections ended the game
    disc: g.disconnections == null || !c ? null : !g.disconnections ? { none: true, a: '', b: '' } : {
      none: false,
      a: `Sin desconexiones: Win ${pctCi(c.winRate, c.winRateCi)} en ${c.decided} decididas`,
      b: `· ${g.disconnections} derrota${g.disconnections === 1 ? '' : 's'} por desconexión` + (g.losses ? ` (${pc0(g.disconnections / g.losses * 100)} de las derrotas)` : ''),
    },
  };
}

/** Port of renderCompare (src/dashboard.client.js:1361): one row per group; a long list folds after `cap` rows (P4). */
@Component({
  selector: 'm-compare',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let rs = rows();
    @if (rs === null) {
      <div class="muted">{{ na }}</div>
    } @else if (!rs.length) {
      <div class="muted">Sin datos</div>
    } @else {
      @for (r of rs.slice(0, shown()); track $index) { <ng-container *ngTemplateOutlet="rowTpl; context: { $implicit: r }" /> }
      @if (rs.length > shown()) {
        <details class="more-rows" style="margin-top:6px"><summary style="cursor:pointer;color:#8ea0b8;font-size:13px;padding:6px 0">Ver {{ rs.length - shown() }} {{ noun() }} más</summary>
          @for (r of rs.slice(shown()); track $index) { <ng-container *ngTemplateOutlet="rowTpl; context: { $implicit: r }" /> }
        </details>
      }
    }
    <ng-template #rowTpl let-r>
      <div class="row"><div style="flex:1">
        <div style="display:flex;justify-content:space-between;align-items:baseline"><b>{{ r.label }}</b><span class="muted">{{ r.games }}</span></div>
        <div class="bar" style="margin-top:6px;display:flex"><i class="bar-win" [style.width.%]="r.w"></i><i class="bar-loss" [style.width.%]="r.l"></i><i class="bar-draw" [style.width.%]="r.d"></i></div>
        <div class="muted" style="margin-top:4px;display:flex;gap:10px;flex-wrap:wrap"><span>{{ r.win }}</span><span>{{ r.score }}</span><span>{{ r.basis }}</span></div>
        @if (r.disc; as x) {
          @if (x.none) { <div class="muted" style="margin-top:4px">Sin desconexiones en esta fase</div> }
          @else { <div class="muted" style="margin-top:4px;display:flex;gap:10px;flex-wrap:wrap"><span>{{ x.a }}</span><span>{{ x.b }}</span></div> }
        }
      </div></div>
    </ng-template>
  `,
})
export class Compare {
  readonly groups = input.required<readonly Group[]>();
  readonly total = input.required<number>();
  readonly cap = input<number | null>(null);
  readonly noun = input('filas');
  protected readonly na = NA;
  // not a list, or rows it cannot read: "No disponible", never a thrown template
  protected readonly rows = computed(() => safe(() => list<Group>(this.groups())?.map((g) => row(g, this.total())) ?? null, null));
  protected readonly shown = computed(() => this.cap() ?? Infinity);
}
