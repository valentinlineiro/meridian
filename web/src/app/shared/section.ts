import { Component, ElementRef, input, viewChild } from '@angular/core';

/** A collapsible block of a page: a title (and an optional note next to it) and its content. Open by default. */
@Component({
  selector: 'app-section',
  template: `<details #d class="cgroup" [attr.id]="sectionId()" [open]="open()"><summary>{{ title() }}@if (meta() || metaId()) { <span [attr.id]="metaId()" class="muted" style="font-size:var(--fs-sm);margin-left:8px;text-transform:none;letter-spacing:0;font-weight:400">{{ meta() }}</span> }</summary><ng-content /></details>`,
})
export class Section {
  readonly title = input.required<string>();
  readonly meta = input('');
  readonly metaId = input<string>();
  readonly sectionId = input<string>();
  readonly open = input(true);
  private readonly details = viewChild.required<ElementRef<HTMLDetailsElement>>('d');

  /** Page index: open the block if it is collapsed and bring it into view. */
  reveal(): void {
    const el = this.details().nativeElement;
    el.open = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
