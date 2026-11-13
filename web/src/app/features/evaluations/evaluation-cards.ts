import { Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { colorConclusion, ColorConclusion } from '../../core/format';
import { list, safe } from '../../core/guard';
import { EVAL_VERDICTS, Verdict } from '../../core/words';
import { VerdictPill } from '../../shared/verdict';

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
// Wording: plain Spanish, a real number on every reason (what there is, what is needed), "no se ve" and never "no hay".
const sgn = (v: unknown, d = 0) => v == null ? '—' : ((v as number) > 0 ? '+' : '') + f(v, d);
function reasonText(e: Evaluation, r: string): string {
  const id = e.id, m = e.metrics || {}, k = e.criteria || {};
  const enough = (v: unknown) => v == null ? 'todavía no se llega al mínimo' : 'hacen falta ' + String(v).replace('.', ',');
  const belowColor = () => 'Entre blancas y negras hay ' + f(m['diffPp']) + ' puntos de % de diferencia. ' + (k['minDiffPp'] == null ? 'Aún no llega al mínimo para darla por real.' : 'Para darla por real pedimos ' + String(k['minDiffPp']).replace('.', ',') + '.');
  const intervalColor = () => 'Con estas partidas, la diferencia real podría estar entre ' + sgn(m['diffCiLower']) + ' y ' + sgn(m['diffCiUpper']) + ' puntos de %, es decir, también podría no existir.';
  if (id === 'CHESS_COLOR_ASYMMETRY') {
    if (r === 'insufficient_sample') return 'Tienes ' + f(m['decidedCount'], 0) + ' partidas con ganador; ' + enough(k['minDecided']) + ' para fiarse.';
    if (r === 'effect_below_threshold') return belowColor();
    if (r === 'interval_includes_zero') return intervalColor();
    if (r === 'data_unavailable') return 'Con alguno de los dos colores no hay partidas con ganador en este periodo.';
  }
  if (id === 'CHESS_COLOR_ASYMMETRY_LONGITUDINAL') {
    if (r === 'insufficient_sample') return 'Tienes ' + f(m['whiteDecided'], 0) + ' partidas con ganador con blancas y ' + f(m['blackDecided'], 0) + ' con negras, repartidas en ' + f(m['activeDays'], 0) + ' días. ' + (k['minDecidedPerColor'] != null && k['minActiveDays'] != null ? 'Hacen falta ' + k['minDecidedPerColor'] + ' por color y ' + k['minActiveDays'] + ' días jugados.' : 'Todavía no se llega al mínimo.');
    if (r === 'span_too_short') return 'Solo hay ' + f(m['totalDays'], 0) + ' días de historial' + (k['minSpanDays'] == null ? '; todavía es pronto.' : '; con menos de ' + k['minSpanDays'] + ' sería adivinar.');
    if (r === 'effect_below_threshold') return belowColor();
    if (r === 'interval_includes_zero') return intervalColor();
    if (r === 'persistence_not_met') return 'No es constante: en la primera mitad de tu historial la diferencia era de ' + sgn(m['h1DiffSigned']) + ' puntos de % y en la segunda de ' + sgn(m['h2DiffSigned']) + ' (blancas − negras)' + (k['minEraDiffPp'] == null ? '.' : '; se pide al menos ' + String(k['minEraDiffPp']).replace('.', ',') + ' en las dos.');
    if (r === 'data_unavailable') return 'Faltan datos en tu historial: fechas, o partidas con ganador con algún color en alguna de las dos mitades.';
  }
  if (id === 'CHESS_RATING_JUMP') {
    const d = m['ratingDelta'] as number | null, move = d == null ? 'ha cambiado' : d === 0 ? 'no ha cambiado' : d < 0 ? 'ha bajado ' + f(Math.abs(d), 0) + ' puntos' : 'ha subido ' + f(d, 0) + ' puntos';
    const games = m['games'] != null ? ' en ' + f(m['games'], 0) + ' partidas' : '';
    if (r === 'effect_below_threshold') { const band = m['bandLower'] ?? m['bandUpper']; return 'Tu ELO ' + move + games + '.' + (band != null ? ' Con tu historial, hasta ' + f(Math.abs(band), 0) + ' puntos entra en lo normal.' : ''); }
    if (r === 'calibration_unavailable') return 'Tu ELO ' + move + games + '. Todavía no sabemos cuánto varía normalmente, así que no podemos decir si es un cambio grande.';
    if (r === 'data_unavailable') return 'Falta una lectura de tu ELO antes o después de este periodo para poder comparar.';
  }
  if (id === 'LANG_XP_ACCELERATION') {
    if (r === 'span_too_short') return 'El periodo tiene ' + f(m['intervalDays'], 0) + ' días completos' + (m['partialDaysExcluded'] ? ' (el día en curso no cuenta)' : '') + '; ' + enough(k['minDays']) + '.';
    if (r === 'effect_below_threshold') return 'Estos días ganas ' + f(m['ratio']) + ' veces tu XP normal.' + (m['bandUpper'] != null ? ' Hasta ' + f(m['bandUpper']) + ' veces es lo habitual en ti.' : '');
    if (r === 'calibration_unavailable') return 'Estos días ganas ' + f(m['ratio']) + ' veces tu XP normal (' + f(m['xpGained'], 0) + ' XP en ' + f(m['intervalDays'], 0) + ' días). Todavía no sabemos cuánto varía normalmente, así que no podemos decir si es mucho.';
    if (r === 'data_unavailable') return (m['observedDays'] === 0 ? 'Ningún día del periodo tiene XP registrado. ' : '') + (m['historicalRate'] > 0 ? '' : 'Aún no tenemos suficientes días anteriores para saber cuál es tu XP normal.');
  }
  return ({ insufficient_sample: 'Todavía hay pocos datos.', effect_below_threshold: 'El cambio que se ve no llega al mínimo exigido.', interval_includes_zero: 'Con estos datos, la diferencia real podría ser nula.', persistence_not_met: 'No se mantiene igual en las dos mitades de tu historial.', span_too_short: 'El periodo es demasiado corto.', data_unavailable: 'Faltan datos necesarios.' } as Record<string, string>)[r] || r;
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const day = (iso: string): { d: number; m: number } | null => { const x = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return x ? { d: +x[3], m: +x[2] - 1 } : null; };
/** "2026-11-02" → "2 de noviembre"; anything that is not a date is returned as it came. */
const longDay = (iso: string): string => { const x = day(iso); return x ? x.d + ' de ' + MONTHS[x.m] : iso; };
/** "2026-11-02 → 2026-11-09" → "del 2 al 9 de noviembre". */
export function humanWindow(win: string): string {
  const [a, b] = win.split(' → ').map(day);
  const [ia, ib] = win.split(' → ');
  if (!a || !b) return win;
  return a.m === b.m ? 'del ' + a.d + ' al ' + b.d + ' de ' + MONTHS[a.m] : 'del ' + longDay(ia) + ' al ' + longDay(ib);
}

function observed(id: string, m: Rec): string {
  if (id === 'CHESS_COLOR_ASYMMETRY' && m['whiteWinRate'] != null && m['blackWinRate'] != null) return 'Blancas ' + fx(m['whiteWinRate']) + ' % · Negras ' + fx(m['blackWinRate']) + ' % (' + m['decidedCount'] + ' partidas con ganador)';
  if (id === 'CHESS_COLOR_ASYMMETRY_LONGITUDINAL' && m['whiteWinRate'] != null && m['blackWinRate'] != null) return 'Blancas ' + fx(m['whiteWinRate']) + ' % · Negras ' + fx(m['blackWinRate']) + ' % (' + m['whiteDecided'] + ' y ' + m['blackDecided'] + ' partidas con ganador' + (m['totalDays'] != null ? ', ' + m['totalDays'] + ' días' : '') + ')';
  if (id === 'CHESS_RATING_JUMP' && m['baselineRating'] != null && m['currentRating'] != null) return 'Tu ELO: ' + m['baselineRating'] + ' → ' + m['currentRating'] + ' (' + m['gamesCount'] + ' partidas en el periodo)';
  if (id === 'LANG_XP_ACCELERATION' && m['dailyRate'] != null) {
    // a historical rate of 0 means "no reference" (data_unavailable), not an observed 0 XP/day
    const ref = m['historicalRate'] > 0 ? ' vs ' + fx(m['historicalRate'], 0) + ' XP por día en tu historial' : '; aún no hay historial con el que comparar';
    return fx(m['dailyRate'], 0) + ' XP por día en este periodo' + ref + ' (+' + m['xpGained'] + ' XP)';
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
  const cc = colorConclusion(signed, m['diffCiLower'], m['diffCiUpper'], { met: false, label: longi ? 'Patrón persistente (al menos ' + (k['minDiffPp'] != null ? k['minDiffPp'] : 15) + ' puntos de % y en las dos mitades)' : 'Diferencia mínima exigida (' + (k['minDiffPp'] != null ? k['minDiffPp'] : '—') + ' puntos de %)' });
  if (!cc) return null;
  return { cc, summary: cc.detectable ? 'Hay una diferencia detectable entre colores, pero no se demuestra ' + (longi ? 'un patrón persistente' : 'un efecto de la magnitud que exige el criterio') + '.' : null };
}

export interface EvalCard {
  na: false; title: string; state: EvalStateName; verdict: Verdict; scope: string;
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
  const basis = e.kind === 'statistical' ? 'este método incluye el valor real en unas 95 de cada 100 repeticiones'
    : k['calibratedThrough'] ? (edgeAdmitted ? 'lo habitual en ti, calculado hasta el ' + longDay(String(k['calibratedThrough'])) : 'aún no sabemos qué es habitual en ti; datos hasta el ' + longDay(String(k['calibratedThrough'])))
    : 'regla fija, sin margen de error calculado';
  const collapsed = state === 'INSUFICIENTE' || state === 'SIN INDICIO';
  return {
    na: false, title: meta.title, state, verdict: EVAL_VERDICTS[state], scope: meta.scope,
    collapsed, summary: collapsed ? (cv?.summary || (state === 'INSUFICIENTE' && rs.length ? reasonText(e, rs[0]!) : '') || EVAL_VERDICTS[state].sentence) : '',
    finding: claim,
    observed: claim ? '' : observed(e.id, m),
    color: claim ? null : cv?.cc ?? null,
    indicio: !claim && state === 'INDICIO' ? EVAL_VERDICTS[state].sentence : '',
    reasons: claim ? [] : rs.map((r) => reasonText(e, r)),
    foot: humanWindow(win).replace(/^./, (c) => c.toUpperCase()) + ' · ' + basis,
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
  imports: [NgTemplateOutlet, VerdictPill],
  host: { style: 'display:contents' },
  template: `
    <ng-template #body let-c>
      @if (c.finding) {
        <div class="u-fs-md u-fwt-600 u-c-text-2 u-mb-6">{{ c.finding.claim }}</div>
        <div class="muted u-fs-sm"><strong>Evidencia:</strong> {{ c.finding.evidence }}</div>
      } @else {
        @if (c.observed) {<div class="u-fs-md u-c-text-2 u-mb-4"><strong>Observado:</strong> {{ c.observed }}</div>}
        @if (c.color; as cc) {<div class="evcolor u-fs-sm u-c-text-2 u-mb-4">{{ cc.line1 }}<br>{{ cc.line2 }}</div>}
        @if (c.indicio) {<div class="u-fs-md u-fwt-600 u-c-text-2 u-mb-4">{{ c.indicio }}</div>}
        <ul class="muted" style="font-size:var(--fs-sm);margin:0;padding-left:18px">@for (r of c.reasons; track $index) {<li>{{ r }}</li>}</ul>
      }
    </ng-template>
    @for (c of cards(); track $index) {
      @if (c.na) {
        <div class="card u-mb-10"><h3 class="u-m-0">{{ c.title }}</h3><div class="muted u-fs-sm u-mt-6">No disponible</div></div>
      } @else if (c.collapsed) {
        <details class="card evcard u-mb-10"><summary><span class="evhead"><h3 class="u-m-0">{{ c.title }}</h3><app-verdict [verdict]="c.verdict" /></span><span class="muted evmsg">{{ c.summary }}</span></summary><div class="u-mt-8"><span class="pill pill-scope">{{ c.scope }}</span></div><div class="u-mt-8"><ng-container *ngTemplateOutlet="body; context: { $implicit: c }" /></div><div class="muted u-fs-xs u-mt-6">{{ c.foot }}</div></details>
      } @else {
        <div class="card u-mb-10"><div class="u-d-flex u-jc-space-between u-ai-center u-gap-8 u-mb-6"><h3 class="u-m-0">{{ c.title }}</h3><span><app-verdict [verdict]="c.verdict" />&ngsp;<span class="pill pill-scope">{{ c.scope }}</span></span></div><ng-container *ngTemplateOutlet="body; context: { $implicit: c }" /><div class="muted u-fs-xs u-mt-6">{{ c.foot }}</div></div>
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
