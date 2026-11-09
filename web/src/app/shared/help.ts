import { Component, input } from '@angular/core';

/** The formulas and the fine print, folded away: what a view shows is plain words, this is where they are backed up. */
@Component({
  selector: 'app-help',
  template: `<details class="help" [attr.id]="helpId()"><summary>{{ label() }}</summary><div class="help-body"><ng-content /></div></details>`,
})
export class Help {
  readonly label = input('Cómo se calcula');
  readonly helpId = input<string>();
}
