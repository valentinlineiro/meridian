import { Component, computed, DestroyRef, inject, linkedSignal, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, map, Observable, of, shareReplay, startWith, switchMap, tap } from 'rxjs';
import { ApiClient } from '../../core/api-client';
import { Course, es } from '../../core/courses';
import { fmtDelta, pc1 } from '../../core/format';
import { list, safe } from '../../core/guard';
import { Segmented } from '../../shared/segmented';
import { EvalFinding, Evaluation, EvaluationCards } from '../evaluations/evaluation-cards';

// Port of the Qué cambió tab (src/frontend.ts:472–477; src/dashboard.client.js fmtWhen, putChangesAnchor, loadChangesAnchor,
// fetchWhatChanged, markChangesAsSeen, setChangesInterval :2039–2165, renderEvaluations and renderWhatChanged :2291–2400).

/* eslint-disable @typescript-eslint/no-explicit-any -- the What Changed body is an open record from the API */
type Rec = Record<string, any>;
const DAY = 24 * 60 * 60 * 1000;
const ANCHOR_URL = '/api/me/changes-anchor';
const LEGACY_KEY = 'lastVisitedAt'; // the old manual button's value in this browser, migrated once to the server anchor
const ERR_HTTP = 'Error al cargar cambios (/api/what-changed).';
const ERR_NET = 'Error de conexión al cargar cambios.';
const INCOMPLETE = 'Respuesta incompleta al cargar cambios (/api/what-changed).';

const isObj = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** A count as legacy concatenated it; anything that is not a number is unavailable, never "NaN"/"null". */
const n = (v: unknown) => fin(v) ? String(v) : '—';
const signed = (v: unknown) => fin(v) ? (v > 0 ? '+' + v : String(v)) : '—';
export const fmtWhen = (iso: unknown) => { const t = new Date(iso as string); return isNaN(t.getTime()) ? String(iso) : t.toISOString().slice(0, 10) + ' ' + t.toISOString().slice(11, 16) + ' UTC'; };
const utc = (t: unknown) => String(t).slice(0, 16).replace('T', ' ') + ' UTC';

interface Anchor { anchor: string | null; readable: boolean }
type Put = { ok: true; seenThrough: string | null } | { ok: false; status: number };
/** 0 = since the last visit; 7 / 30 = a fixed window. A new object per click: choosing the same window again asks again. */
interface Choice { days: 0 | 7 | 30 }
interface Win { days: number; visit: boolean; since: string; until: string; anchor: string | null; readable: boolean; canMark: boolean }
type Body = { error: string } | { data: unknown; catalog: Course[] };
interface State { win: Win; body?: Body }

function windowFor(days: number, a: Anchor, now: number): Win {
  const visit = days === 0;
  const since = visit ? a.anchor || new Date(now - 7 * DAY).toISOString() : new Date(now - days * DAY).toISOString();
  let until = new Date(now).toISOString();
  if (new Date(since).getTime() >= new Date(until).getTime()) until = new Date(new Date(since).getTime() + 1000).toISOString();
  // "Marcar como visto" only when the window shown covers everything not yet seen: the visit window, or one that starts at or before the anchor.
  const canMark = visit || (a.anchor !== null && new Date(since).getTime() <= new Date(a.anchor).getTime());
  return { days, visit, since, until, anchor: a.anchor, readable: a.readable, canMark };
}

function headerView(w: Win) {
  const span = fmtWhen(w.since) + ' y ' + fmtWhen(w.until);
  const sub = w.visit
    ? (w.anchor ? 'Desde tu última visita (' + fmtWhen(w.anchor) + ') hasta ' + fmtWhen(w.until)
      : w.readable ? 'Sin visita registrada: mostrando los últimos 7 días (' + span + ')'
      : 'No se pudo leer tu última visita: mostrando los últimos 7 días (' + span + ')')
    : 'Mostrando cambios entre ' + span;
  return { sub, canMark: w.canMark, markNote: !w.canMark && !!w.anchor, is7d: !w.visit && w.days === 7, is30d: !w.visit && w.days === 30, visit: w.visit };
}

type Event = { title: string; category: string; claim: string; evidence: string } | { na: true; title: string };
const str = (v: unknown): string => { if (typeof v !== 'string') throw new Error('not text: ' + String(v)); return v; };

/** renderEvaluations: the evaluations (epistemic status) and, after them, the findings no evaluation covers (events). Null = nothing to show. */
function evaluationsView(d: Rec) {
  // an absent list is an empty one (legacy `|| []`); one that is there but is not a list cannot be read
  const evals = d['evaluations'] == null ? [] : list<unknown>(d['evaluations']);
  const fs = d['findings'] == null ? [] : list<unknown>(d['findings']);
  const found = (fs ?? []).filter(isObj);
  const iv = d['interval'];
  const win = isObj(iv) ? String(iv['since']).slice(0, 10) + ' → ' + String(iv['until']).slice(0, 10) : '';
  const findingFor = (e: Evaluation) => found.find((f) => f['id'] === e.id) as EvalFinding | undefined;
  const evalIds = new Set((evals ?? []).filter(isObj).map((e) => e['id']));
  // events (course switch, streak) are facts, not evaluations: they keep the finding card
  const events = found.filter((f) => !evalIds.has(f['id'])).map((f): Event =>
    safe(() => ({ title: str(f['title']), category: str(f['category']).toUpperCase(), claim: str(f['claim']), evidence: str(f['evidence']) }),
      { na: true as const, title: typeof f['title'] === 'string' ? f['title'] : 'Hallazgo' }));
  const nEvals = (evals ?? []).filter(isObj).length;
  if (!nEvals && !events.length && evals !== null && fs !== null) return null;
  const head = evals === null || evals.length ? 'Evaluaciones' : '🔎 Descubrimientos';
  return { head, legend: head === 'Evaluaciones', evals: evals ?? [], evalsNa: evals === null, findingsNa: fs === null, findingFor, win, events };
}

type Row = { label: string; value: string; pill?: string };
/** The activity card: context for the evaluations above, not more insights (what an evaluation states is not repeated). */
function activityView(d: Rec, catalog: Course[]) {
  const c: Rec = isObj(d['chess']) ? d['chess'] : {}, l: Rec = isObj(d['languages']) ? d['languages'] : {}, s: Rec = isObj(d['streak']) ? d['streak'] : {};
  const xp = l['xpGained'];
  // a course outside the catalogue (Duolingo's own chess course, CHESS_CH) says nothing here: show names, never raw ids
  const courseName = (id: unknown) => { const x = catalog.find((k) => k.courseId === id); return x ? String(x.title || id) : null; };
  const cur = courseName(l['currentCourseId']), base = courseName(l['baselineCourseId']);
  const courseText = l['courseChanged'] && cur && base ? base + ' → ' + cur : cur;
  const hd = c['historicalDelta'];
  const blocks: { title: string; rows: Row[] }[] = [
    { title: 'Ajedrez', rows: [
      { label: 'Partidas jugadas', value: n(c['gamesCount']) },
      { label: '% de victorias en este periodo', value: fin(c['intervalWinRate']) ? pc1(c['intervalWinRate']) : '—' },
      { label: 'Cambio en tu % de victorias', value: isObj(hd) && fin(hd['diff']) && fin(hd['lower']) && fin(hd['upper']) ? fmtDelta(hd as { diff: number; lower: number; upper: number }) : '—' }] },
    { title: 'Idiomas', rows: [
      { label: 'XP ganado', value: fin(xp) ? (xp > 0 ? '+' + es(xp) : String(xp)) : '—' },
      { label: 'Sesiones completadas', value: n(l['sessionsCount']) },
      { label: 'Tiempo invertido', value: fin(l['totalSessionMinutes']) ? l['totalSessionMinutes'] + ' min' : '—' },
      ...(courseText ? [{ label: 'Curso activo', value: courseText }] : [])] },
    { title: 'Racha', rows: [
      { label: 'Racha actual', value: '🔥 ' + n(s['currentStreak']) },
      { label: 'Racha anterior', value: n(s['baselineStreak']) },
      { label: 'Cambio en la racha', value: signed(s['streakDelta']) },
      { label: 'Estado', value: typeof s['status'] === 'string' ? s['status'] : '—', pill: s['status'] === 'active' ? 'pill pill-win' : 'pill pill-loss' }] },
  ];
  return blocks;
}

/** renderWhatChanged: what the body area says for one answer. */
function bodyView(b: Body, w: Win) {
  if ('error' in b) return { empty: b.error, findings: null, activity: null };
  const d = b.data;
  if (!isObj(d) || !d['chess'] || !d['languages'] || !d['streak']) return { empty: INCOMPLETE, findings: null, activity: null };
  const fs = d['findings'];
  const isEmpty = (fs == null || (Array.isArray(fs) && fs.length === 0)) && d['chess'].gamesCount === 0 && d['languages'].xpGained === 0 && d['languages'].sessionsCount === 0;
  const findings = safe(() => evaluationsView(d), 'na' as const);
  if (isEmpty) {
    const iv: Rec = isObj(d['interval']) ? d['interval'] : {};
    // the evaluations are the answer to "could this window be judged?": a quiet window keeps them (INSUFICIENTE, SIN INDICIO)
    return { empty: 'No hay actividad registrada entre ' + utc(iv['since'] ?? w.since) + ' y ' + utc(iv['until'] ?? w.until) + '.', findings, activity: null };
  }
  return { empty: '', findings, activity: safe(() => activityView(d, b.catalog), 'na' as const) };
}

@Component({
  selector: 'app-changes',
  imports: [EvaluationCards, NgTemplateOutlet, Segmented],
  template: `
    @let v = view();
    <section id="changesTab">
      <div id="changesHeader" style="margin-bottom:16px">@if (v) {
        <div class="hero-card" style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
            <div>
              <h1>¿Qué ha cambiado?</h1>
              <div class="muted" style="font-size:var(--fs-sm);margin-top:2px">{{ v.header.sub }}</div>
            </div>
            @if (v.header.canMark) {<button type="button" class="btn btn-p" id="btnMarkSeen" [disabled]="saving()" (click)="markSeen()">{{ markFailed() ? 'No se pudo guardar; reintenta' : 'Marcar como visto' }}</button>}
          </div>
          @if (v.header.markNote) {<div class="muted" style="font-size:var(--fs-xs);margin-top:6px">Para marcar como visto, elige «Desde última visita»: esta ventana no cubre todo lo que no has visto.</div>}
          <app-segmented style="display:block;margin-top:12px" label="Periodo" [options]="windows" [value]="v.header.visit ? '0' : v.header.is7d ? '7' : v.header.is30d ? '30' : ''" (picked)="choose($event === '7' ? 7 : $event === '30' ? 30 : 0)" />
        </div>
      }</div>
      @let b = v?.body;
      @if (b?.empty) {<div id="changesEmpty" class="empty">{{ b!.empty }}</div>}
      <div id="changesFindings" style="margin-bottom:16px">@if (b?.findings; as f) {
        @if (f === 'na') {<ng-container *ngTemplateOutlet="na; context: { $implicit: 'Evaluaciones' }" />} @else {
          <h2 style="margin:18px 0 10px">{{ f.head }}</h2>
          @if (f.legend) {<div class="muted" style="font-size:var(--fs-sm);margin-bottom:10px">Qué se observó, con qué criterio y qué no se puede afirmar todavía.</div>}
          @if (f.evalsNa) {<ng-container *ngTemplateOutlet="na; context: { $implicit: 'Evaluaciones' }" />}
          @if (f.evals.length) {<m-evaluation-cards [evaluations]="f.evals" [findingFor]="f.findingFor" [win]="f.win" />}
          @for (e of f.events; track $index) {
            @if ('na' in e) {<ng-container *ngTemplateOutlet="na; context: { $implicit: e.title }" />} @else {
              <div class="card" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><h3 style="margin:0">{{ e.title }}</h3><span><span class="pill pill-win">EVENTO</span>&ngsp;<span class="pill pill-scope">{{ e.category }}</span></span></div><div style="font-size:var(--fs-md);font-weight:600;color:var(--text-2);margin-bottom:6px">{{ e.claim }}</div><div class="muted" style="font-size:var(--fs-sm)"><strong>Evidencia:</strong> {{ e.evidence }}</div></div>
            }
          }
          @if (f.findingsNa) {<ng-container *ngTemplateOutlet="na; context: { $implicit: 'Hallazgos' }" />}
        }
      }</div>
      <div id="changesActivity">@if (b?.activity; as a) {
        <div class="card">
          <h2>Actividad en la ventana</h2>
          @if (a === 'na') {<div class="muted" style="font-size:var(--fs-sm)">No disponible</div>} @else {
            <div class="muted" style="font-size:var(--fs-sm);margin-bottom:10px">Datos que contextualizan las evaluaciones.</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px">
              @for (k of a; track k.title) {
                <div><div class="muted" style="font-size:var(--fs-xs);letter-spacing:.05em;text-transform:uppercase;margin-bottom:4px">{{ k.title }}</div>
                  @for (r of k.rows; track r.label) {
                    <div class="row"><span class="muted">{{ r.label }}</span>@if (r.pill) {<span [class]="r.pill">{{ r.value }}</span>} @else {<b>{{ r.value }}</b>}</div>
                  }
                </div>
              }
            </div>
          }
        </div>
      }</div>
    </section>
    <ng-template #na let-title><div class="card" style="margin-bottom:10px"><h3 style="margin:0">{{ title }}</h3><div class="muted" style="font-size:var(--fs-sm);margin-top:6px">No disponible</div></div></ng-template>
  `,
})
export class Changes {
  private readonly api = inject(ApiClient);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly choice = signal<Choice>({ days: 0 });
  protected readonly saving = signal(false);
  /** The save failed: the button says so until another window is shown. */
  protected readonly markFailed = linkedSignal({ source: this.choice, computation: () => false });

  // One anchor read per visit, shared by every window choice (and cancelled with the view); a successful mark replaces it with the PUT's answer.
  private anchor$: Observable<Anchor> = this.loadAnchor().pipe(takeUntilDestroyed(), shareReplay(1));
  // The Idiomas catalogue, for course names: read after the first successful answer; a failed read is retried by the next window (legacy lastLangsData).
  private catalog: Course[] | null = null;

  // A new choice cancels the previous one's requests (switchMap): an older window never paints over a later one.
  private readonly state = rxResource<State, Choice>({
    params: () => this.choice(),
    stream: ({ params }) => {
      const now = Date.now();
      return this.anchor$.pipe(switchMap((a) => {
        const win = windowFor(params.days, a, now);
        return this.api.get<unknown>('/api/what-changed', { since: win.since, until: win.until }).pipe(
          switchMap((data) => this.loadCatalog().pipe(map((catalog): Body => ({ data, catalog })))),
          catchError((e: unknown) => of<Body>({ error: e instanceof HttpErrorResponse && e.status !== 0 && (e.status < 200 || e.status > 299) ? ERR_HTTP : ERR_NET })),
          map((body): State => ({ win, body })),
          startWith<State>({ win }), // the header names the window while its answer is on the way
        );
      }));
    },
  });

  protected readonly view = computed(() => {
    if (!this.state.hasValue()) return null;
    const s = this.state.value();
    return { header: headerView(s.win), body: s.body ? bodyView(s.body, s.win) : null };
  });

  /** What is marked is what was shown: the until of the answer on screen, not the time of the click. Null while there is none. */
  private readonly shownUntil = computed(() => {
    const s = this.state.hasValue() ? this.state.value() : null;
    if (!s?.body || 'error' in s.body) return null;
    const iv = isObj(s.body.data) ? s.body.data['interval'] : null;
    return (isObj(iv) && typeof iv['until'] === 'string' && iv['until']) || s.win.until;
  });

  protected readonly windows = [{ k: '7', l: 'Últimos 7 días' }, { k: '30', l: 'Últimos 30 días' }, { k: '0', l: 'Desde última visita' }];
  protected choose(days: Choice['days']): void { this.choice.set({ days }); }

  protected markSeen(): void {
    const until = this.shownUntil();
    if (!until || this.saving()) return;
    this.saving.set(true);
    this.put(until).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((r) => {
      this.saving.set(false);
      if (!r.ok) { this.markFailed.set(true); return; }
      this.anchor$ = of({ anchor: r.seenThrough, readable: true });
      this.choice.set({ days: 0 });
    });
  }

  private put(iso: string): Observable<Put> {
    return this.api.put<unknown>(ANCHOR_URL, { seenThrough: iso }).pipe(
      map((b): Put => { if (!isObj(b)) throw new Error('unreadable'); return { ok: true, seenThrough: typeof b['seenThrough'] === 'string' && b['seenThrough'] ? b['seenThrough'] : null }; }),
      catchError((e: unknown) => of<Put>({ ok: false, status: e instanceof HttpErrorResponse ? e.status : 0 })));
  }

  /** The anchor lives on the server ("changes up to this instant have been seen"); reading never moves it. Unreadable = never written over. */
  private loadAnchor(): Observable<Anchor> {
    return this.api.get<unknown>(ANCHOR_URL).pipe(
      map((b): Anchor => {
        const s = isObj(b) ? b['seenThrough'] : undefined;
        if (!isObj(b) || (s != null && typeof s !== 'string')) throw new Error('unreadable anchor');
        return { anchor: s || null, readable: true };
      }),
      catchError(() => of<Anchor>({ anchor: null, readable: false })),
      switchMap((a) => {
        let legacy: string | null = null;
        try { legacy = localStorage.getItem(LEGACY_KEY); } catch { /* storage blocked */ }
        if (!legacy || !a.readable) return of(a);
        const drop = () => { try { localStorage.removeItem(LEGACY_KEY); } catch { /* storage blocked */ } };
        if (a.anchor !== null) { drop(); return of(a); }
        // a value the server rejects (400) is garbage and goes; any other failure keeps it for the next visit
        return this.put(legacy).pipe(map((r): Anchor => { if (r.ok || r.status === 400) drop(); return r.ok ? { anchor: r.seenThrough, readable: true } : a; }));
      }));
  }

  private loadCatalog(): Observable<Course[]> {
    if (this.catalog) return of(this.catalog);
    return this.api.get<unknown>('/api/languages').pipe(
      map((l) => isObj(l) && Array.isArray(l['courses']) ? (l['courses'] as unknown[]).filter(isObj) as unknown as Course[] : []),
      tap((c) => { this.catalog = c; }),
      catchError(() => of<Course[]>([])));
  }
}
