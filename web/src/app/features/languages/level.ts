import { Section } from '../../core/courses';
import { fmtDate, pc1 } from '../../core/format';
import type { CurDelta } from './languages.view';

const units = (n: number) => `${n} ${n === 1 ? 'unidad' : 'unidades'}`;

/**
 * The level a course has reached, from its sections (each carries the CEFR level the SOURCE gives it: a classification of the course tree,
 * not an assessment of the learner). Sections of one level add up; the current level is the first one not completed. Null unless EVERY
 * section has a level, so the levels always tile the whole course.
 */
export function levelView(detail: { sections?: Section[] } | null | undefined, delta: CurDelta | undefined) {
  const secs = detail?.sections;
  if (!secs?.length || secs.some((s) => !s.cefrLevel)) return null;
  const by = new Map<string, { completed: number; units: number }>();
  for (const s of secs) {
    const e = by.get(s.cefrLevel!) ?? { completed: 0, units: 0 };
    e.completed += s.completedUnits || 0; e.units += s.totalUnits || 0;
    by.set(s.cefrLevel!, e);
  }
  const all = [...by].map(([name, e]) => ({ name, ...e }));
  const total = all.reduce((a, l) => a + l.units, 0);
  if (!total) return null;
  const done = all.every((l) => l.completed >= l.units);
  const cur = done ? all.length - 1 : all.findIndex((l) => l.completed < l.units && l.units > 0);
  const c = all[cur]!, left = c.units - c.completed, next = all[cur + 1];
  let cum = 0;
  const comparable = delta?.status === 'comparable' && delta.deltaTotalUnits === 0 && delta.deltaCompletedUnits != null && delta.deltaCompletedUnits >= 0;
  const since = delta?.previousObservedAt ? ' desde el ' + fmtDate(delta.previousObservedAt.slice(0, 10)) : ' desde la observación anterior';
  return {
    level: c.name,
    levels: all.map((l, i) => ({ name: l.name, units: l.units, current: i === cur })),
    dividers: all.slice(0, -1).map((l) => (cum += l.units) / total * 100),
    levelText: `${c.completed} de ${c.units} unidades · ${pc1(c.completed / c.units * 100)}`,
    levelPct: c.completed / c.units * 100,
    sentence: done ? 'Has completado todos los niveles del curso.' : next ? `Te faltan ${units(left)} para empezar ${next.name}.` : `Te faltan ${units(left)} para terminar el curso.`,
    change: !comparable ? '' : delta!.deltaCompletedUnits! > 0 ? `+${units(delta!.deltaCompletedUnits!)}${since}` : 'Sin avance' + since,
  };
}
