import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SideNav } from './side-nav.component';
import { StatsService } from '../core/stats.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, SideNav],
  template: `
    <header><div class="h-left"><h1>Meridian</h1>@if (stats.chessUpdated(); as m) {<small id="syncMeta">{{ m }}</small>}</div></header>
    <main class="shell">
      <nav app-side-nav></nav>
      <div class="content"><router-outlet /></div>
    </main>
  `,
})
export class Shell {
  // the chess freshness line belongs to the chess view only: it is empty everywhere else
  protected readonly stats = inject(StatsService);
}
