import { Component, input, output } from '@angular/core';

export interface Choice { k: string; l: string }

/** One group of mutually exclusive buttons (period, filter, tab). The chosen one is `aria-pressed`: the single way a selection is shown. */
@Component({
  selector: 'app-segmented',
  template: `
    <div class="cindex" style="flex-wrap:wrap;overflow:visible" role="group" [attr.id]="groupId()" [attr.aria-label]="label()">
      @if (caption()) { <span class="muted" style="align-self:center">{{ caption() }}</span> }
      @for (o of options(); track o.k) {
        <button type="button" class="btn btn-g" [attr.id]="idPrefix() ? idPrefix() + o.k : null" [attr.aria-pressed]="value() === o.k" [attr.data-chip]="chipGroup() ? chipGroup() + ':' + o.k : null" (click)="picked.emit(o.k)">{{ o.l }}</button>
      }
    </div>
  `,
})
export class Segmented {
  readonly options = input.required<readonly Choice[]>();
  readonly value = input.required<string>();
  readonly label = input.required<string>();
  readonly caption = input('');
  readonly groupId = input<string>();
  readonly idPrefix = input('');
  /** Adds data-chip="group:key" to each button (the hook the matches filters are driven by). */
  readonly chipGroup = input('');
  readonly picked = output<string>();
}
