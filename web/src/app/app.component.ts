import { Component } from '@angular/core';
import { Shell } from './shell/shell.component';

@Component({
  selector: 'app-root',
  imports: [Shell],
  template: '<app-shell />',
})
export class App {}
