import { Component, input } from '@angular/core';
import { Verdict } from '../core/words';

/** The label of a verdict as a pill; the colour comes from the verdict, never from the caller. */
@Component({
  selector: 'app-verdict',
  template: `<span [class]="verdict().pill">{{ verdict().label }}</span>`,
})
export class VerdictPill {
  readonly verdict = input.required<Verdict>();
}
