import { Component, input } from '@angular/core';

/** Port of legacy kpi(label, val, sub): the host is the `.kpi` grid item. */
@Component({
  selector: 'm-kpi',
  host: { class: 'kpi' },
  template: '<span class="kl">{{ label() }}</span><b>{{ value() }}</b><small>{{ sub() }}</small>',
})
export class Kpi {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly sub = input('');
}
