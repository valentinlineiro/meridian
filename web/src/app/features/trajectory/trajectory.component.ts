import { Component, computed, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { rxResource } from '@angular/core/rxjs-interop';
import { ApiClient } from '../../core/api-client';
import { list, safe } from '../../core/guard';
import { EvalFinding, Evaluation, EvaluationCards } from '../../shared/evaluation-cards.component';

// Port of the Trayectoria tab (src/frontend.ts:478–485, src/dashboard.client.js:1667–1688 and fetchTrajectory :2008–2048).

/* eslint-disable @typescript-eslint/no-explicit-any -- findings are open records from the API */
type Rec = Record<string, any>;
interface Copy extends EvalFinding { title: string }

const COURSE_LANG_NAMES: Record<string, string> = { AR: 'Árabe', CA: 'Catalán', CS: 'Checo', DE: 'Alemán', EL: 'Griego', EN: 'Inglés', ES: 'Español', FR: 'Francés', HI: 'Hindi', HU: 'Húngaro', ID: 'Indonesio', IT: 'Italiano', JA: 'Japonés', KO: 'Coreano', NL: 'Neerlandés', PL: 'Polaco', PT: 'Portugués', RO: 'Rumano', RU: 'Ruso', SV: 'Sueco', TR: 'Turco', UK: 'Ucraniano', VI: 'Vietnamita', ZH: 'Chino' };
const courseName = (id: unknown) => { const m = /^DUOLINGO_([A-Z]+)_[A-Z]+$/.exec(String(id || '')); return (m && COURSE_LANG_NAMES[m[1]]) || String(id); };
const num = (v: unknown): number => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('not a number: ' + String(v)); return v; };
/** Legacy pc (:161): a rate already in percent, rounded, «62 %»; an absent one is «—», never «0 %». */
const pc = (v: unknown) => v == null ? '—' : Math.round(num(v)) + ' %';
const TITLES: Record<string, string> = { CHESS_COLOR_ASYMMETRY_LONGITUDINAL: 'Asimetría por color', LANG_FOCUS_SHIFT_LONGITUDINAL: 'Desplazamiento de foco' };

export function trajectoryCopy(f: Rec): Copy | null {
  const m = f['metrics'];
  if (f['type'] === 'CHESS_COLOR_ASYMMETRY_LONGITUDINAL') {
    const w = m.dominantColor === 'white';
    return { title: TITLES[f['type']],
      claim: 'Tu rendimiento con ' + (w ? 'blancas' : 'negras') + ' ha sido consistentemente superior al de ' + (w ? 'negras' : 'blancas') + '.',
      evidence: num(f['sample'].gamesCount) + ' partidas · ' + pc(m.globalWhiteWinRate) + ' blancas · ' + pc(m.globalBlackWinRate) + ' negras · patrón consistente en ambas mitades' };
  }
  if (f['type'] === 'LANG_FOCUS_SHIFT_LONGITUDINAL') {
    return { title: TITLES[f['type']],
      claim: 'Tu foco principal de aprendizaje se ha desplazado de ' + courseName(m.previousCourseId) + ' a ' + courseName(m.newCourseId) + '.',
      evidence: pc(m.h1PreviousCourseShare) + ' de tu XP en la primera mitad (' + num(m.h1PreviousCourseXp) + ' XP) → ' + pc(m.h2NewCourseShare) + ' en la segunda (' + num(m.h2NewCourseXp) + ' XP)'
        + ' · XP neto observado entre capturas; no se ha verificado que la serie sea continua' };
  }
  return null;
}

const ERROR = 'Error al cargar tu trayectoria.';
const QUIET = 'No hay patrones longitudinales suficientemente estables registrados en tu historial.';
const isObj = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);
type Plain = Copy | { title: string; na: true };

function trajectoryView(d: Rec) {
  // an absent list is an empty one (legacy `|| []`); one that is there but is not a list cannot be read
  const evals = d['evaluations'] == null ? [] : list<unknown>(d['evaluations']);
  const fs = d['findings'] == null ? [] : list<unknown>(d['findings']);
  const copies = (fs ?? []).filter(isObj)
    .map((f) => ({ type: f['type'], c: safe<Plain | null, Plain>(() => trajectoryCopy(f), { title: TITLES[f['type']], na: true }) }))
    .filter((x): x is { type: unknown; c: Plain } => !!x.c);
  const evalIds = new Set((evals ?? []).filter(isObj).map((e) => e['id']));
  const span = d['temporalSpan'];
  const win = isObj(span) && span['startedAt'] && span['endedAt'] ? String(span['startedAt']).slice(0, 10) + ' → ' + String(span['endedAt']).slice(0, 10) : 'sin fechas';
  // an evaluated pattern shows its epistemic status; one without an evaluation (language focus shift has no contract yet) keeps its plain card, labelled SIN EVALUAR
  const findingFor = (e: Evaluation): EvalFinding | undefined => { const c = copies.find((x) => x.type === e.id)?.c; return c && !('na' in c) ? c : undefined; };
  const plain = copies.filter((x) => !evalIds.has(x.type)).map((x) => x.c);
  const shown = (evals ?? []).filter(isObj).length + plain.length;
  return {
    evals: evals ?? [], evalsNa: evals === null, findingsNa: fs === null, findingFor, win, plain,
    empty: shown || evals === null || fs === null ? '' : QUIET,
  };
}

@Component({
  selector: 'app-trajectory',
  imports: [EvaluationCards, NgTemplateOutlet],
  template: `
    <section id="trajectoryTab">
      <div id="trajectoryHeader" style="margin-bottom:16px">
        <h1>Tu trayectoria</h1>
        <p class="muted" style="margin:0" id="trajectorySubtitle">Síntesis de patrones estables a lo largo de tu historial completo</p>
      </div>
      @let v = view();
      @if (v === 'error') {<div id="trajectoryEmpty" class="empty">{{ error }}</div>} @else if (v?.empty) {<div id="trajectoryEmpty" class="empty">{{ v!.empty }}</div>}
      <div id="trajectoryFindings">@if (v && v !== 'error') {
        @if (v.evalsNa) {<ng-container *ngTemplateOutlet="na; context: { $implicit: 'Evaluaciones' }" />}
        @if (v.evals.length) {<m-evaluation-cards [evaluations]="v.evals" [findingFor]="v.findingFor" [win]="v.win" />}
        @for (c of v.plain; track $index) {
          @if ('na' in c) {<ng-container *ngTemplateOutlet="na; context: { $implicit: c.title }" />} @else {
            <div class="card" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><h3 style="margin:0">{{ c.title }}</h3><span class="pill pill-scope">SIN EVALUAR</span></div><div style="font-size:13px;font-weight:600;color:#c8d7ea;margin-bottom:6px">{{ c.claim }}</div><div class="muted" style="font-size:12px"><strong>Evidencia:</strong> {{ c.evidence }}</div></div>
          }
        }
        @if (v.findingsNa) {<ng-container *ngTemplateOutlet="na; context: { $implicit: 'Patrones' }" />}
      }</div>
    </section>
    <ng-template #na let-title><div class="card" style="margin-bottom:10px"><h3 style="margin:0">{{ title }}</h3><div class="muted" style="font-size:12px;margin-top:6px">No disponible</div></div></ng-template>
  `,
})
export class Trajectory {
  private readonly api = inject(ApiClient);
  protected readonly error = ERROR;

  // One request per visit; leaving the view cancels it, so a late answer never paints.
  private readonly data = rxResource({ stream: () => this.api.get<unknown>('/api/trajectory') });
  /** undefined while loading; 'error' when the request failed or the body is not an object (never the quiet empty copy). */
  protected readonly view = computed(() => {
    if (this.data.status() === 'error') return 'error' as const;
    if (!this.data.hasValue()) return undefined;
    const d = this.data.value();
    return isObj(d) ? safe(() => trajectoryView(d), 'error' as const) : 'error' as const;
  });
}
