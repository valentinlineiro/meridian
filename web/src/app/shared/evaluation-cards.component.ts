import { Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { colorConclusion, ColorConclusion } from '../core/format';
import { list, safe } from '../core/guard';

// Port of evaluationCards and its helpers (src/dashboard.client.js:2167–2290): the epistemic-status cards shared by
// Trayectoria and Qué cambió. Each caller says which claim backs an emitted evaluation (findingFor) and the window to name.

/* eslint-disable @typescript-eslint/no-explicit-any -- metrics and criteria are open records from the API */
type Rec = Record<string, any>;
/** One evaluation as the API sends it (src/domain/whatChanged.ts Evaluation). */
export interface Evaluation { id: string; kind?: string; status?: string; reasons?: string[]; metrics?: Rec; criteria?: Rec }
/** The claim and evidence of the finding an emitted evaluation stands for. */
export interface EvalFinding { claim: string; evidence: string }
export type EvalStateName = 'AFIRMADO' | 'INDICIO' | 'INSUFICIENTE' | 'SIN INDICIO';

const reasonsOf = (e: Evaluation): string[] => {
  if (e.reasons == null) return [];
  const rs = list<string>(e.reasons);
  if (!rs) throw new Error('evaluation reasons are not a list');
  return rs;
};

// AFIRMADO and INDICIO follow salience() in src/domain/whatChanged.ts; unlike it, any limit on the evidence (sample, span,
// missing data) makes the evaluation INSUFICIENTE: "SIN INDICIO" must never read as "checked, nothing changed".
export function evalState(e: Evaluation): EvalStateName {
  if (e.status === 'emitted') return 'AFIRMADO';
  const rs = reasonsOf(e);
  if (rs.length && rs.every((r) => r === 'insufficient_sample' || r === 'interval_includes_zero')) return 'INDICIO';
  // A7: not knowing the usual variation is INSUFICIENTE if an effect was observed (the card states it), SIN INDICIO if there is none
  if (rs.length === 1 && rs[0] === 'calibration_unavailable') {
    const m = e.metrics || {};
    const eff = m['ratingDelta'] != null ? m['ratingDelta'] : m['ratio'] != null ? m['ratio'] - 1 : 0;
    return eff !== 0 ? 'INSUFICIENTE' : 'SIN INDICIO';
  }
  return rs.some((r) => r === 'data_unavailable' || r === 'span_too_short' || r === 'insufficient_sample') ? 'INSUFICIENTE' : 'SIN INDICIO';
}
const ORDER: EvalStateName[] = ['AFIRMADO', 'INDICIO', 'INSUFICIENTE', 'SIN INDICIO'];
const PILL: Record<EvalStateName, string> = { 'AFIRMADO': 'pill pill-win', 'INDICIO': 'pill pill-warn', 'INSUFICIENTE': 'pill pill-draw', 'SIN INDICIO': 'pill' };
const MSG: Record<string, string> = {
  'INDICIO': 'Vemos una señal, pero con la evidencia actual no podemos afirmarla.',
  'INSUFICIENTE': 'No hay evidencia suficiente para responder en esta ventana.',
  'SIN INDICIO': 'No se observa evidencia suficiente de un cambio bajo este criterio; no equivale a demostrar que no hubo cambio.',
};
const META: Record<string, { title: string; scope: string }> = {
  CHESS_COLOR_ASYMMETRY: { title: 'Asimetría por color', scope: 'Ajedrez · partidas decididas' },
  CHESS_RATING_JUMP: { title: 'Salto de ELO', scope: 'Ajedrez · ELO observado' },
  LANG_XP_ACCELERATION: { title: 'Mayor XP diario', scope: 'Cuenta · XP' },
  CHESS_COLOR_ASYMMETRY_LONGITUDINAL: { title: 'Asimetría por color · todo el historial', scope: 'Ajedrez · historial' },
};

/** Legacy f(): fixed decimals, comma, "−". A value that is not a number makes the card unavailable instead of printing NaN. */
const fx = (v: unknown, d = 1): string => {
  const n = Number(v);
  if (typeof v === 'boolean' || v === '' || !Number.isFinite(n)) throw new Error('not a number: ' + String(v));
  return n.toFixed(d).replace('.', ',').replace('-', '−');
};
const f = (v: unknown, d = 1) => v == null ? '—' : fx(v, d);

// The criteria come from the evaluation itself (e.criteria): the rule's own thresholds, never copied here.
function reasonText(e: Evaluation, r: string): string {
  const id = e.id, m = e.metrics || {}, k = e.criteria || {};
  const need = (v: unknown, unit: string) => v == null ? 'no se alcanza el criterio' : 'el criterio exige al menos ' + String(v).replace('.', ',') + unit;
  if (id === 'CHESS_COLOR_ASYMMETRY') {
    if (r === 'insufficient_sample') return f(m['decidedCount'], 0) + ' partidas decididas observadas; ' + need(k['minDecided'], '') + '.';
    if (r === 'effect_below_threshold') return 'Diferencia observada entre colores: ' + f(m['diffPp']) + ' pp; ' + need(k['minDiffPp'], ' pp') + '.';
    if (r === 'interval_includes_zero') return 'El intervalo de confianza del 95 % de la diferencia [' + f(m['diffCiLower'], 0) + ', ' + f(m['diffCiUpper'], 0) + '] pp incluye 0.';
    if (r === 'data_unavailable') return 'Falta al menos un color con partidas decididas en la ventana.';
  }
  if (id === 'CHESS_COLOR_ASYMMETRY_LONGITUDINAL') {
    const sg = (v: unknown) => v == null ? '—' : ((v as number) > 0 ? '+' : '') + f(v, 0);
    if (r === 'insufficient_sample') return 'Decididas: blancas ' + f(m['whiteDecided'], 0) + ', negras ' + f(m['blackDecided'], 0) + '; días con actividad: ' + f(m['activeDays'], 0) + '. ' + (k['minDecidedPerColor'] != null && k['minActiveDays'] != null ? 'El criterio exige al menos ' + k['minDecidedPerColor'] + ' decididas por color y ' + k['minActiveDays'] + ' días con actividad.' : 'No se alcanza el criterio.');
    if (r === 'span_too_short') return 'El historial de ajedrez cubre ' + f(m['totalDays'], 0) + ' días; ' + need(k['minSpanDays'], '') + '.';
    if (r === 'effect_below_threshold') return 'Diferencia observada entre colores: ' + f(m['diffPp']) + ' pp; ' + need(k['minDiffPp'], ' pp') + '.';
    if (r === 'interval_includes_zero') return 'El intervalo de confianza del 95 % de la diferencia global [' + f(m['diffCiLower'], 0) + ', ' + f(m['diffCiUpper'], 0) + '] pp incluye 0.';
    if (r === 'persistence_not_met') return 'La diferencia no se mantiene con el mismo signo en las dos mitades del historial: ' + sg(m['h1DiffSigned']) + ' pp en la primera y ' + sg(m['h2DiffSigned']) + ' pp en la segunda (blancas − negras); ' + need(k['minEraDiffPp'], ' pp') + ' en ambas.';
    if (r === 'data_unavailable') return 'Falta información en el historial: fechas, o algún color sin partidas decididas en alguna de las dos mitades.';
  }
  if (id === 'CHESS_RATING_JUMP') {
    if (r === 'effect_below_threshold') return 'Cambio de ELO observado: ' + f(m['ratingDelta'], 0) + ' puntos en ' + f(m['games'], 0) + ' partidas entre las dos lecturas, dentro de lo habitual' + (m['bandLower'] != null ? ' (límite ' + f(m['bandLower'], 0) + ' puntos)' : m['bandUpper'] != null ? ' (límite +' + f(m['bandUpper'], 0) + ' puntos)' : '') + '.';
    if (r === 'calibration_unavailable') return 'Cambio de ELO observado: ' + f(m['ratingDelta'], 0) + ' puntos' + (m['games'] != null ? ' en ' + f(m['games'], 0) + ' partidas entre las dos lecturas' : '') + '. Sin referencia de variación habitual todavía.';
    if (r === 'data_unavailable') return 'No hay dos observaciones de ELO en snapshots distintos alrededor de la ventana.';
  }
  if (id === 'LANG_XP_ACCELERATION') {
    if (r === 'span_too_short') return 'La ventana contiene ' + f(m['intervalDays'], 0) + ' días completos (UTC)' + (m['partialDaysExcluded'] ? '; ' + m['partialDaysExcluded'] + ' parcial(es) excluido(s)' : '') + '; ' + need(k['minDays'], '') + '.';
    if (r === 'effect_below_threshold') return 'XP diario observado: ' + f(m['ratio']) + '× la media histórica, dentro de lo habitual' + (m['bandUpper'] != null ? ' (límite ' + f(m['bandUpper']) + '×)' : '') + '.';
    if (r === 'calibration_unavailable') return 'XP diario observado: ' + f(m['ratio']) + '× la media histórica (' + f(m['xpGained'], 0) + ' XP en ' + f(m['intervalDays'], 0) + ' días). Sin referencia de variación habitual todavía.';
    if (r === 'data_unavailable') return (m['observedDays'] === 0 ? 'Ningún día de la ventana tiene registro de XP. ' : '') + (m['historicalRate'] > 0 ? '' : 'No hay media histórica de referencia.');
  }
  return ({ insufficient_sample: 'Muestra insuficiente.', effect_below_threshold: 'El efecto observado no alcanza el criterio.', interval_includes_zero: 'El intervalo de confianza incluye 0.', persistence_not_met: 'El efecto no se mantiene en ambas mitades del historial.', span_too_short: 'La ventana es demasiado corta.', data_unavailable: 'Faltan datos necesarios.' } as Record<string, string>)[r] || r;
}

function observed(id: string, m: Rec): string {
  if (id === 'CHESS_COLOR_ASYMMETRY' && m['whiteWinRate'] != null && m['blackWinRate'] != null) return 'Blancas ' + fx(m['whiteWinRate']) + ' % · Negras ' + fx(m['blackWinRate']) + ' % (' + m['decidedCount'] + ' partidas decididas)';
  if (id === 'CHESS_COLOR_ASYMMETRY_LONGITUDINAL' && m['whiteWinRate'] != null && m['blackWinRate'] != null) return 'Blancas ' + fx(m['whiteWinRate']) + ' % · Negras ' + fx(m['blackWinRate']) + ' % (' + m['whiteDecided'] + ' y ' + m['blackDecided'] + ' decididas' + (m['totalDays'] != null ? ', ' + m['totalDays'] + ' días' : '') + ')';
  if (id === 'CHESS_RATING_JUMP' && m['baselineRating'] != null && m['currentRating'] != null) return 'ELO leído en snapshots: ' + m['baselineRating'] + ' → ' + m['currentRating'] + ' (' + m['gamesCount'] + ' partidas en la ventana)';
  if (id === 'LANG_XP_ACCELERATION' && m['dailyRate'] != null) {
    // a historical rate of 0 means "no reference" (data_unavailable), not an observed 0 XP/day
    const ref = m['historicalRate'] > 0 ? ' vs ' + fx(m['historicalRate'], 0) + ' XP por día con registro histórico' : '; no hay referencia histórica disponible';
    return fx(m['dailyRate'], 0) + ' XP por día con registro en la ventana' + ref + ' (+' + m['xpGained'] + ' XP)';
  }
  return '';
}

// Colour evaluations carry the interval of the difference: when it already excludes 0 the verdict is not "no evidence"; it is "detectable, but not the stricter pattern".
function colorView(e: Evaluation, state: EvalStateName, rs: string[]): { cc: ColorConclusion; summary: string | null } | null {
  if (!(e.id === 'CHESS_COLOR_ASYMMETRY' || e.id === 'CHESS_COLOR_ASYMMETRY_LONGITUDINAL') || state === 'AFIRMADO') return null;
  const m = e.metrics || {}, k = e.criteria || {};
  if (rs.some((r) => r === 'insufficient_sample' || r === 'data_unavailable')) return null; // without a sample there is no interval worth reading
  const longi = e.id === 'CHESS_COLOR_ASYMMETRY_LONGITUDINAL';
  const signed = m['whiteWinRate'] != null && m['blackWinRate'] != null ? m['whiteWinRate'] - m['blackWinRate'] : null; // white − black, signed like the interval
  for (const v of [signed, m['diffCiLower'], m['diffCiUpper']]) if (v != null) fx(v);
  const cc = colorConclusion(signed, m['diffCiLower'], m['diffCiUpper'], { met: false, label: longi ? 'Patrón persistente (≥ ' + (k['minDiffPp'] != null ? k['minDiffPp'] : 15) + ' pp y en ambas mitades)' : 'Efecto mínimo del criterio (≥ ' + (k['minDiffPp'] != null ? k['minDiffPp'] : '—') + ' pp)' });
  if (!cc) return null;
  return { cc, summary: cc.detectable ? 'Hay una diferencia detectable entre colores, pero no se demuestra ' + (longi ? 'un patrón persistente' : 'un efecto de la magnitud que exige el criterio') + '.' : null };
}

export interface EvalCard {
  na: false; title: string; state: EvalStateName; pill: string; scope: string;
  /** INSUFICIENTE and SIN INDICIO: nothing to claim, the verdict shows and the criteria stay one tap away. */
  collapsed: boolean; summary: string;
  finding: EvalFinding | null; observed: string; color: ColorConclusion | null; indicio: string; reasons: string[]; foot: string;
}
export type EvalCardView = EvalCard | { na: true; title: string };

export function evaluationCard(e: Evaluation, state: EvalStateName, finding: EvalFinding | null | undefined, win: string): EvalCard {
  const meta = META[e.id] || { title: String(e.id ?? 'Evaluación'), scope: '' };
  const m = e.metrics || {}, k = e.criteria || {}, rs = reasonsOf(e);
  const cv = colorView(e, state, rs);
  if (m['startedAt'] && m['endedAt']) win = String(m['startedAt']).slice(0, 10) + ' → ' + String(m['endedAt']).slice(0, 10); // the evaluation's own window wins
  const claim = state === 'AFIRMADO' && finding ? { claim: String(finding.claim), evidence: String(finding.evidence) } : null;
  // A7: "calibrated" only if the edge that decides this evaluation is admitted (ELO: the one of the direction of the change; XP: upper95).
  const edgeAdmitted = e.id === 'CHESS_RATING_JUMP' ? k[(m['ratingDelta'] != null && m['ratingDelta'] < 0 ? 'lower95' : 'upper95') + 'Admitted'] === 1 : k['upper95Admitted'] === 1;
  const basis = e.kind === 'statistical' ? 'con intervalo de confianza del 95 %'
    : k['calibratedThrough'] ? (edgeAdmitted ? 'límites de lo habitual calibrados con tu historial (hasta ' + k['calibratedThrough'] + ')' : 'sin banda calibrada todavía; datos evaluados hasta ' + k['calibratedThrough'])
    : 'umbral fijo, sin intervalo de confianza';
  const collapsed = state === 'INSUFICIENTE' || state === 'SIN INDICIO';
  return {
    na: false, title: meta.title, state, pill: PILL[state], scope: meta.scope,
    collapsed, summary: collapsed ? (cv?.summary || MSG[state]) : '',
    finding: claim,
    observed: claim ? '' : observed(e.id, m),
    color: claim ? null : cv?.cc ?? null,
    indicio: !claim && state === 'INDICIO' ? MSG[state] : '',
    reasons: claim ? [] : rs.map((r) => reasonText(e, r)),
    foot: 'Ventana: ' + win + ' · ' + basis,
  };
}

/** AFIRMADO first, then INDICIO, INSUFICIENTE, SIN INDICIO. An entry that is not an object is skipped; one that cannot be read shows "No disponible" alone. */
export function evaluationCards(evals: readonly unknown[], findingFor: (e: Evaluation) => EvalFinding | null | undefined, win: string): EvalCardView[] {
  return evals.filter((e): e is Evaluation => !!e && typeof e === 'object')
    .map((e) => safe(() => { const state = evalState(e); return { o: ORDER.indexOf(state), c: evaluationCard(e, state, findingFor(e), win) as EvalCardView }; },
      { o: ORDER.length, c: { na: true as const, title: META[e.id]?.title ?? String(e.id ?? 'Evaluación') } }))
    .sort((a, b) => a.o - b.o).map((x) => x.c);
}

/**
 * <m-evaluation-cards [evaluations] [findingFor] [win]>: one card per evaluation, laid out as siblings of the caller's own cards.
 * Trayectoria: findingFor = the trajectoryCopy of the finding whose type is e.id; win = the response's temporalSpan.
 * Qué cambió: findingFor = the finding whose id is e.id; win = the response's interval.
 */
@Component({
  selector: 'm-evaluation-cards',
  imports: [NgTemplateOutlet],
  host: { style: 'display:contents' },
  template: `
    <ng-template #body let-c>
      @if (c.finding) {
        <div style="font-size:13px;font-weight:600;color:#c8d7ea;margin-bottom:6px">{{ c.finding.claim }}</div>
        <div class="muted" style="font-size:12px"><strong>Evidencia:</strong> {{ c.finding.evidence }}</div>
      } @else {
        @if (c.observed) {<div style="font-size:13px;color:#c8d7ea;margin-bottom:4px"><strong>Observado:</strong> {{ c.observed }}</div>}
        @if (c.color; as cc) {<div class="evcolor" style="font-size:12px;color:#c8d7ea;margin-bottom:4px">{{ cc.line1 }}<br>{{ cc.line2 }}</div>}
        @if (c.indicio) {<div style="font-size:13px;font-weight:600;color:#c8d7ea;margin-bottom:4px">{{ c.indicio }}</div>}
        <ul class="muted" style="font-size:12px;margin:0;padding-left:18px">@for (r of c.reasons; track $index) {<li>{{ r }}</li>}</ul>
      }
    </ng-template>
    @for (c of cards(); track $index) {
      @if (c.na) {
        <div class="card" style="margin-bottom:10px"><h3 style="margin:0">{{ c.title }}</h3><div class="muted" style="font-size:12px;margin-top:6px">No disponible</div></div>
      } @else if (c.collapsed) {
        <details class="card evcard" style="margin-bottom:10px"><summary><span class="evhead"><h3 style="margin:0">{{ c.title }}</h3><span [class]="c.pill">{{ c.state }}</span></span><span class="muted evmsg">{{ c.summary }}</span></summary><div style="margin-top:8px"><span class="pill pill-scope">{{ c.scope }}</span></div><div style="margin-top:8px"><ng-container *ngTemplateOutlet="body; context: { $implicit: c }" /></div><div class="muted" style="font-size:11px;margin-top:6px">{{ c.foot }}</div></details>
      } @else {
        <div class="card" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px"><h3 style="margin:0">{{ c.title }}</h3><span><span [class]="c.pill">{{ c.state }}</span>&ngsp;<span class="pill pill-scope">{{ c.scope }}</span></span></div><ng-container *ngTemplateOutlet="body; context: { $implicit: c }" /><div class="muted" style="font-size:11px;margin-top:6px">{{ c.foot }}</div></div>
      }
    }
  `,
})
export class EvaluationCards {
  readonly evaluations = input.required<readonly unknown[]>();
  readonly findingFor = input.required<(e: Evaluation) => EvalFinding | null | undefined>();
  readonly win = input.required<string>();
  protected readonly cards = computed(() => evaluationCards(this.evaluations(), this.findingFor(), this.win()));
}
