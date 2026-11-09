import { Component, input } from '@angular/core';

/** A collapsible block of a page: a title and its content. Open by default. */
@Component({
  selector: 'app-section',
  template: `<details class="cgroup" [attr.id]="sectionId()" [open]="open()"><summary>{{ title() }}</summary><ng-content /></details>`,
})
export class Section {
  readonly title = input.required<string>();
  readonly sectionId = input<string>();
  readonly open = input(true);
}
