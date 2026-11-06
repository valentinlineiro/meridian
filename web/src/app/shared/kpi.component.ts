import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Port of legacy kpi(label, val, sub): the host is the `.kpi` grid item. */
@Component({
  selector: 'm-kpi',
  host: { class: 'kpi' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<label>{{ label() }}</label><b>{{ value() }}</b><small>{{ sub() }}</small>',
})
export class Kpi {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly sub = input('');
}
