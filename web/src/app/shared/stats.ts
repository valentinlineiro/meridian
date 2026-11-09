import { Component, input } from '@angular/core';

export interface Stat { l: string; v: string; s?: string }

/** A label, its value and an optional note, for each fact of a card. */
@Component({
  selector: 'app-stats',
  template: `<dl class="stats">@for (m of items(); track m.l) {<div><dt>{{ m.l }}</dt><dd>{{ m.v }}</dd>@if (m.s) {<dd class="muted">{{ m.s }}</dd>}</div>}</dl>`,
})
export class Stats {
  readonly items = input.required<readonly Stat[]>();
}
