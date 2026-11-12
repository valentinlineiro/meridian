import { Component, computed, input } from '@angular/core';
import { Verdict } from '../core/words';

/** The label of a verdict as a pill; the colour comes from the verdict, never from the caller. */
@Component({
  selector: 'app-verdict',
  template: `<span [class]="verdict().pill"><span aria-hidden="true">{{ icon() }} </span>{{ verdict().label }}</span>`,
})
export class VerdictPill {
  readonly verdict = input.required<Verdict>();
  /** Never colour alone: every state has a glyph. */
  protected readonly icon = computed(() => { const v = this.verdict(); return v.dir === 'up' ? '▲' : v.dir === 'down' ? '▼' : { confirmed: '✓', possible: '◐', 'no-signal': '▬', 'few-data': '○' }[v.state]; });
}
