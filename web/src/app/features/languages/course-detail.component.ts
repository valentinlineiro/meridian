import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Course, flag, Section, xpText } from '../../core/courses';
import { list, safe } from '../../core/guard';
import { cefrLabel, Detail, looseFromTo, NA } from './languages.view';

// Port of showCourseDetail (src/dashboard.client.js:306–356) and the "Nivel 2" markup of src/frontend.ts:452–469.

function cefrRows(sections: Section[]) {
  const byLevel = new Map<string, { completed: number; total: number; count: number }>();
  for (const s of sections) {
    const lvl = s.cefrLevel || 'INTRO';
    const e = byLevel.get(lvl) ?? { completed: 0, total: 0, count: 0 };
    e.completed += s.completedUnits || 0; e.total += s.totalUnits || 0; e.count++;
    byLevel.set(lvl, e);
  }
  return [...byLevel].map(([lvl, e]) => ({ key: lvl, label: `Nivel ${lvl} (${e.count} sec)`, units: `${e.completed} / ${e.total} unidades`, width: e.total ? e.completed / e.total * 100 : 0 }));
}

function sectionRows(sections: Section[]) {
  return sections.map((s, i) => ({
    key: (s.sectionId ?? '') + i,
    title: `SECCIÓN ${s.sectionIndex}: ${cefrLabel(s)}`,
    units: `${s.completedUnits ?? 0} / ${s.totalUnits ?? 0} unidades`,
    width: s.totalUnits ? (s.completedUnits || 0) / s.totalUnits * 100 : 0,
    meta: `Section ID: ${s.sectionId} · Tipo: ${s.type || 'learning'} · ` + (s.lastSeenAt ? 'Última observación: ' + s.lastSeenAt.slice(0, 10) : ''),
  }));
}

@Component({
  selector: 'app-course-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div id="langDetailView">
      <div style="margin-bottom:12px">
        <button type="button" class="btn btn-g" id="btnBackToLanguages" (click)="back.emit()">← Volver a todos los cursos</button>
      </div>
      <div class="card" id="langCourseDetailCard" style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:gap:8px">
          <div>
            <h1 id="langDetailTitle" style="margin:0;font-size:22px">{{ head()?.title }}</h1>
            <div class="muted" id="langDetailSub" style="font-size:12px;margin-top:2px">{{ head()?.sub }}</div>
          </div>
          <span id="langDetailXpPill" class="pill" style="font-size:14px;font-weight:700">{{ head()?.xp }}</span>
        </div>
      </div>
      <div class="card" id="langCefrCard" style="margin-bottom:12px">
        <h2 style="margin:0 0 4px">Unidades curriculares por nivel CEFR</h2>
        <div class="muted" style="font-size:11px;margin-bottom:10px">Mide unidades del árbol clasificadas por la fuente bajo cada nivel; no constituye evaluación ni certificación de competencia lingüística.</div>
        <div id="langCefrBody">
          @let c = cefr();
          @if (typeof c === 'string') { <div class="muted">{{ c }}</div> }
          @else {
            @for (r of c; track r.key) {
              <div class="row" style="padding:6px 0"><div style="flex:1">
                <div style="display:flex;justify-content:space-between;align-items:baseline"><b>{{ r.label }}</b><span><b>{{ r.units }}</b></span></div>
                <div style="margin-top:4px"><div class="bar" style="height:8px"><i [style.width.%]="r.width" style="background:#58a6ff"></i></div></div>
              </div></div>
            } @empty { <div class="muted">Sin información de CEFR</div> }
          }
        </div>
      </div>
      <div class="card">
        <h2>Estructura curricular (secciones)</h2>
        <div id="langSectionsList">
          @let ss = sections();
          @if (typeof ss === 'string') { <div class="muted">{{ ss }}</div> }
          @else {
            @for (s of ss; track s.key) {
              <div class="row" style="padding:10px 0;border-bottom:1px solid #1e2e44"><div style="flex:1">
                <div style="display:flex;justify-content:space-between;align-items:baseline"><b>{{ s.title }}</b><span><b>{{ s.units }}</b></span></div>
                <div style="margin-top:6px"><div class="bar" style="height:8px"><i [style.width.%]="s.width" style="background:#2ea043"></i></div></div>
                <details style="margin-top:6px"><summary class="muted" style="cursor:pointer;font-size:11px">Detalle de sección</summary>
                  <div class="muted" style="font-size:12px;margin-top:4px">{{ s.meta }}</div>
                </details>
              </div></div>
            } @empty { <div class="muted">Sin secciones registradas</div> }
          }
        </div>
      </div>
    </div>
  `,
})
export class CourseDetailView {
  /** The selected course's detail (undefined while loading, null when the request failed). */
  readonly detail = input.required<Detail>();
  /** The catalogue entry: names the course while its detail loads or when it failed. */
  readonly course = input<Course | undefined>();
  readonly back = output<void>();

  protected readonly head = computed(() => {
    const c = this.detail()?.course ?? this.course();
    return c ? safe(() => ({
      title: (c.learningLanguage ? flag(c.learningLanguage) + ' ' : '') + (c.title || c.courseId),
      sub: looseFromTo(c) + ' · ID: ' + c.courseId,
      xp: xpText(c.xp) + ' XP',
    }), null) : null;
  });
  private readonly list = computed(() => { const d = this.detail(); return d === undefined ? '—' : d === null ? NA : list<Section>(d.sections ?? []) ?? NA; });
  protected readonly cefr = computed(() => { const l = this.list(); return typeof l === 'string' ? l : safe(() => cefrRows(l), NA); });
  protected readonly sections = computed(() => { const l = this.list(); return typeof l === 'string' ? l : safe(() => sectionRows(l), NA); });
}
