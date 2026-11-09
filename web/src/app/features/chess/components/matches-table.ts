import { Component, computed, inject, input } from '@angular/core';
import { formatMatchDate } from '../../../core/format';
import { es, fmt, Openings } from '../chess.model';
import { FilterGroup, MatchesService, MatchRow } from '../services/matches.service';

const SEGMENTS: Record<string, string> = { noisy_neural: 'Noisy Neural', neural: 'Neural', blended: 'Blended', stockfish: 'Stockfish', pvp: 'PvP' };
const ENDS: Record<string, string> = { checkmate: 'Mate', disconnection: 'Desconexión', stalemate: 'Ahogado', repetition: 'Repetición', resignation: 'Rendición', insufficient_material: 'Material', timeout: 'Tiempo', fifty_moves: '50 jugadas' };
const PHASES: Record<string, string> = { opening: 'Aper.', middlegame: 'Medio', endgame: 'Final' };
const COLORS: Record<string, string> = { white: 'Blancas', black: 'Negras' };

// pillResult/pillType/pillEnd/pillSegment (src/dashboard.client.js:1306–1331)
function result(raw: string | null | undefined) {
  const r = (raw || '').toLowerCase();
  if (r.includes('win') || r === 'won') return { cls: 'pill pill-win', label: 'Victoria' };
  if (r.includes('los') || r.includes('defeat')) return { cls: 'pill pill-loss', label: 'Derrota' };
  if (r.includes('draw') || r.includes('tie')) return { cls: 'pill pill-draw', label: 'Tablas' };
  return { cls: 'pill', label: r || '—' };
}
function end(c: string | null | undefined, mate: string | null | undefined) {
  if (!c || c === 'unknown') return { label: '—', dim: true };
  if (c === 'checkmate' && mate) return { label: 'Mate · ' + String(mate).replace(/^Mate (del |con )?/, ''), dim: false };
  return { label: ENDS[c] || c, dim: false };
}
function rowView(m: MatchRow) {
  const t = String(m.opponent_type || '').toLowerCase();
  const seg = m.opponent_segment && m.opponent_segment !== 'unknown' ? SEGMENTS[m.opponent_segment] || m.opponent_segment : '';
  const at = m.played_at ? new Date(m.played_at * 1000) : m.first_seen_at ? new Date(m.first_seen_at) : null;
  return {
    id: m.ply_count != null && m.match_id ? m.match_id : null, // only a game with stored moves opens in the viewer
    date: formatMatchDate(m.played_at, m.first_seen_at),
    fullDate: at ? at.toLocaleString('es-ES') : null,
    opp: (m.opponent_name || '—') + (seg ? ' ' : ''), seg,
    type: t === 'bot' ? 'Bot' : t === 'pvp' ? 'PvP' : t || '—', pvp: t === 'pvp',
    opening: m.opening_family_label && m.opening_family !== 'unclassified' ? m.opening_family_label : '',
    phase: m.phase_key && m.phase_key !== 'unknown' ? PHASES[m.phase_key] || m.phase_key : '',
    elo: fmt(m.opponent_elo),
    color: COLORS[m.user_color ?? ''] || m.user_color || '—',
    res: result(m.result || m.outcome),
    end: end(m.end_condition, m.mate_type_label),
    reviewed: m.reviewed ? '✓' : '',
  };
}

const CHIPS: { group: FilterGroup; label: string; options: [string, string][] }[] = [
  { group: 'type', label: 'Rival', options: [['', 'Todos'], ['bot', 'Bots'], ['pvp', 'PvP']] },
  { group: 'result', label: 'Resultado', options: [['', 'Todos'], ['win', 'Victorias'], ['loss', 'Derrotas'], ['draw', 'Tablas']] },
  { group: 'color', label: 'Color', options: [['', 'Todos'], ['white', 'Blancas'], ['black', 'Negras']] },
];

/** The "Partidas" card: chips, the expanded filters, the table and its pager. */
@Component({
  selector: 'app-matches-table',
  template: `
    @let f = m.filters();
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px"><h2>Partidas</h2><span class="muted" style="font-size:var(--fs-sm)" id="chessMatchesSubtitle">{{ subtitle() }}</span><a class="btn btn-g" style="font-size:var(--fs-xs);padding:3px 8px;margin-left:8px" href="/api/export/matches.csv" download>Exportar CSV</a></div>
    <div class="filters" id="matchChips">
      @for (c of chips; track c.group) {
        <div class="fgroup" role="group" [attr.aria-label]="c.label"><span class="flabel">{{ c.label }}</span>
          @for (o of c.options; track o[0]) {
            <button type="button" [attr.data-chip]="c.group + ':' + o[0]" class="btn btn-g" [attr.aria-pressed]="f[c.group] === o[0]" (click)="m.setFilter(c.group, o[0])">{{ o[1] }}</button>
          }
        </div>
      }
    </div>
    @if (!m.compact()) {
      <div class="filters" id="matchFilters" style="display:flex">
        <input id="q" placeholder="Buscar rival" [value]="f.q" (input)="m.onSearch(val($event))">
        <select id="fOpp" (change)="m.setFilter('opp', val($event))"><option value="" [selected]="f.opp === ''">Rival: Todos</option><option value="bot" [selected]="f.opp === 'bot'">Bots: Todos</option>
          @for (s of segments; track s[0]) { <option [value]="'seg:' + s[0]" [selected]="f.opp === 'seg:' + s[0]">{{ s[1] }}</option> }</select>
        <input id="fMin" placeholder="ELO mín" inputmode="numeric" size="6" [value]="f.min" (input)="m.setDraft('min', val($event))"><input id="fMax" placeholder="ELO máx" inputmode="numeric" size="6" [value]="f.max" (input)="m.setDraft('max', val($event))">
        <select id="fEnd" (change)="m.setFilter('end', val($event))"><option value="" [selected]="f.end === ''">Fin: Todos</option>
          @for (e of ends; track e[0]) { <option [value]="e[0]" [selected]="f.end === e[0]">{{ e[1] }}</option> }</select>
        <select id="fPhase" (change)="m.setFilter('phase', val($event))"><option value="" [selected]="f.phase === ''">Fase: Todas</option>
          @for (p of phases; track p[0]) { <option [value]="p[0]" [selected]="f.phase === p[0]">{{ p[1] }}</option> }</select>
        <select id="fOpening" (change)="m.setFilter('opening', val($event))"><option value="" [selected]="f.opening === ''">Apertura: Todas</option>
          @for (g of openingGroups(); track g.label) {
            <optgroup [label]="g.label">@for (o of g.items; track o.key) { <option [value]="o.key" [selected]="f.opening === o.key">{{ o.label }}</option> }</optgroup>
          }</select>
        <button class="btn btn-p" type="button" (click)="m.apply()">Filtrar</button>
        <button class="btn btn-g" type="button" (click)="m.clear()">Limpiar</button>
      </div>
    }
    <table class="tbl"><thead><tr><th>Fecha</th><th>Rival</th><th>Tipo</th><th>ELO</th><th>Color</th><th>Resultado</th><th>Fin</th><th>Rev.</th></tr></thead>
      <tbody id="mb">
        @for (r of rows(); track (r.id ?? r.date + r.opp)) {
          <tr [class.gamerow]="!!r.id" [attr.title]="r.id ? 'Ver partida' : null" (click)="r.id && m.open(r.id)">
            <td data-l="Fecha" [attr.title]="r.fullDate">{{ r.date }}</td>
            <td data-l="Rival">@if (r.id) {<button type="button" class="rowbtn" [attr.aria-label]="'Ver partida vs ' + r.opp + ', ' + r.date" (click)="$event.stopPropagation(); m.open(r.id)">{{ r.opp }}</button>} @else {{{ r.opp }}}@if (r.seg) {<span class="pill" style="font-size:var(--fs-xs);margin-left:4px;opacity:.85">{{ r.seg }}</span>}</td>
            <td data-l="Tipo"><span class="pill" [style.border-color]="r.pvp ? 'var(--info)' : null" [style.color]="r.pvp ? 'var(--link)' : null">{{ r.type }}</span>@if (r.opening) {<span class="pill" style="font-size:var(--fs-xs);margin-left:4px;opacity:.75">{{ r.opening }}</span>}@if (r.phase) {<span class="pill" style="font-size:var(--fs-xs);margin-left:4px;opacity:.8">{{ r.phase }}</span>}</td>
            <td data-l="ELO">{{ r.elo }}</td>
            <td data-l="Color">{{ r.color }}</td>
            <td data-l="Resultado"><span [class]="r.res.cls">{{ r.res.label }}</span></td>
            <td data-l="Fin"><span class="pill" [style.opacity]="r.end.dim ? .4 : null">{{ r.end.label }}</span></td>
            <td data-l="Rev.">{{ r.reviewed }}</td>
          </tr>
        }
      </tbody></table>
    @if (empty(); as e) { <div id="empty" class="empty" style="display:block">{{ e }}</div> }
    @if (!m.compact()) {
      <div class="pager" id="matchPager" style="display:flex"><button class="btn btn-g" type="button" id="prev" [disabled]="m.failed() || m.offset() === 0" (click)="m.page(-1)">‹ Anterior</button><span class="muted" id="mc">{{ counter() }}</span><button class="btn btn-g" type="button" id="next" [disabled]="m.failed() || m.offset() + m.pageSize() >= m.total()" (click)="m.page(1)">Siguiente ›</button></div>
    } @else {
      <button class="btn btn-g" type="button" id="btnAllMatches" (click)="m.showAll()" style="margin-top:10px">Ver todas las partidas</button>
    }
  `,
})
export class MatchesTable {
  protected readonly m = inject(MatchesService);
  readonly openings = input<Openings | null>(null);

  protected readonly chips = CHIPS;
  protected readonly segments = Object.entries(SEGMENTS);
  protected readonly ends = ['checkmate', 'disconnection', 'stalemate', 'repetition', 'resignation'].map((k) => [k, ENDS[k]]);
  protected readonly phases = [['opening', 'Apertura'], ['middlegame', 'Medio juego'], ['endgame', 'Final']];

  protected readonly rows = computed(() => this.m.rows().map(rowView));
  protected readonly openingGroups = computed(() => {
    const op = this.openings();
    return ([['Blancas', op?.white], ['Negras', op?.black]] as const)
      .map(([label, items]) => ({ label, items: (Array.isArray(items) ? items : []).map((i) => ({ key: i.key, label: i.label || i.name || i.key })) }))
      .filter((g) => g.items.length);
  });
  protected readonly subtitle = computed(() => !this.m.compact() ? 'Todas las partidas (50 por página)'
    : this.m.rows().length ? `Partidas recientes (${Math.min(10, this.m.rows().length)} mostradas)` : 'Partidas recientes');
  // A failed request is said as such, never as an empty list.
  protected readonly empty = computed(() => this.m.failed() ? 'No se pudieron cargar las partidas.'
    : this.m.loaded() && !this.m.rows().length ? (this.m.compact() ? 'Sin partidas todavía' : 'Sin partidas con esos filtros') : '');
  protected readonly counter = computed(() => {
    if (this.m.failed()) return '—';
    if (!this.m.loaded()) return '';
    const off = this.m.offset();
    return this.m.total() ? `${off + 1}–${off + this.m.rows().length} de ${es(this.m.total())}` : '0 partidas';
  });

  protected val(e: Event): string { return (e.target as HTMLInputElement | HTMLSelectElement).value; }
}
