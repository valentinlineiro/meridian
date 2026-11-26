import { Component, ElementRef, input, viewChild } from '@angular/core';
import { scrollBehavior } from '../core/motion';

/** A collapsible block of a page: a title (and an optional note next to it) and its content. Open by default. */
@Component({
  selector: 'app-section',
  template: `<details #d class="cgroup" [attr.id]="sectionId()" [open]="open()"><summary [attr.data-umami-event]="event() || null"><h2>{{ title() }}</h2>@if (meta() || metaId()) { <span [attr.id]="metaId()" class="muted cg-meta">{{ meta() }}</span> }</summary><ng-content /></details>`,
})
export class Section {
  readonly title = input.required<string>();
  readonly meta = input('');
  readonly metaId = input<string>();
  readonly sectionId = input<string>();
  readonly open = input(true);
  /** Usage-count event of the summary (data-umami-event): it fires on a tap that opens or closes the block. */
  readonly event = input('');
  private readonly details = viewChild.required<ElementRef<HTMLDetailsElement>>('d');

  /** Open the block without moving the page (a block inside it is about to be revealed). */
  expand(): void { this.details().nativeElement.open = true; }

  /** Page index: open the block if it is collapsed and bring it into view. */
  reveal(): void {
    this.expand();
    const el = this.details().nativeElement;
    el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    el.querySelector('summary')?.focus({ preventScroll: true }); // what opened is where a keyboard or screen reader user lands
  }
}
