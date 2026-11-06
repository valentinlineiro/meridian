import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SideNav } from './side-nav.component';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, SideNav],
  template: `
    <header><div class="h-left"><h1>Meridian</h1></div></header>
    <main class="shell">
      <nav app-side-nav></nav>
      <div class="content"><router-outlet /></div>
    </main>
  `,
})
export class Shell {}
