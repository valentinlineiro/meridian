import { afterNextRender, Component, ElementRef, inject, Injector, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { SideNav } from './side-nav';
import { TabBar } from './tab-bar';
import { StatsService } from '../core/stats.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, SideNav, TabBar],
  template: `
    <a class="skip" href="#main" (click)="skip($event)">Saltar al contenido</a>
    <header><div class="h-left"><p class="brand"><a routerLink="/overview">Meridian</a></p>@if (stats.chessUpdated(); as m) {<small id="syncMeta">{{ m }}</small>}</div></header>
    <main class="shell" id="main" tabindex="-1" #main>
      <nav app-side-nav></nav>
      <div class="content"><router-outlet /></div>
    </main>
    <app-tab-bar />
  `,
})
export class Shell {
  // the chess freshness line belongs to the chess view only: it is empty everywhere else
  protected readonly stats = inject(StatsService);
  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');
  private readonly injector = inject(Injector);

  constructor() {
    let first = true;
    inject(Router).events.pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed()).subscribe(() => {
      if (first) { first = false; return; } // opening the app is not a navigation: focus stays where the browser put it
      if (document.activeElement?.closest('select, input, textarea')) return; // the user is driving a control (e.g. the course picker): do not take it away
      afterNextRender(() => this.focusPage(), { injector: this.injector });
    });
  }

  /** The heading of the page we arrived at (what a screen reader should announce), else the main area. */
  private focusPage(): void {
    const target = this.main().nativeElement.querySelector<HTMLElement>('h1') ?? this.main().nativeElement;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }

  /** A plain #main link would navigate against <base href>; focus the target instead. */
  protected skip(e: Event): void {
    e.preventDefault();
    this.main().nativeElement.focus();
  }
}
