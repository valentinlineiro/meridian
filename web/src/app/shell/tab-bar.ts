import { Component, computed, ElementRef, inject, Injector, signal, viewChild, afterNextRender } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SyncService } from '../core/sync.service';
import { currentSection } from './section';

const SECONDARY = ['changes', 'trajectory', 'settings']; // live under "Más"

/**
 * The navigation of the installed app on phones: four sections and "Más", always in reach of the thumb (the pages are long, the old
 * dropdown sat at the top of each). CSS shows it only up to 760px; from there the sidebar is the navigation.
 */
@Component({
  selector: 'app-tab-bar',
  imports: [RouterLink],
  host: { '(document:keydown.escape)': 'close()' },
  template: `
    <nav class="tabbar" aria-label="Secciones">
      <a class="tab" routerLink="/overview" [class.active]="!open() && current() === 'overview'" [attr.aria-current]="current() === 'overview' ? 'page' : null">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>Hoy</a>
      <a class="tab" routerLink="/chess" [class.active]="!open() && current() === 'chess'" [attr.aria-current]="current() === 'chess' ? 'page' : null">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></svg>Ajedrez</a>
      <a class="tab" routerLink="/languages" [class.active]="!open() && current() === 'languages'" [attr.aria-current]="current() === 'languages' ? 'page' : null">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 3v18M3 12h18" /></svg>Idiomas</a>
      <a class="tab" routerLink="/games" [class.active]="!open() && current() === 'games'" [attr.aria-current]="current() === 'games' ? 'page' : null">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></svg>Games</a>
      <button #moreBtn class="tab" type="button" [class.active]="open() || secondary()" [attr.aria-expanded]="open()" aria-controls="moreSheet" (click)="toggle()">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></svg>Más</button>
    </nav>
    @if (open()) {
      <button class="scrim" type="button" aria-label="Cerrar" tabindex="-1" (click)="close()"></button>
      <div #sheet class="sheet" id="moreSheet" role="dialog" aria-label="Más secciones">
        <a routerLink="/changes">Qué cambió</a>
        <a routerLink="/trajectory">Trayectoria</a>
        <hr />
        <button id="tabSyncBtn" class="btn btn-p sync" type="button" (click)="sync.start()" [disabled]="sync.busy()" aria-describedby="tabSyncHint"
          title="Sincroniza cuentas conectadas (Duolingo). LinkedIn Games es registro manual.">{{ sync.lastSyncLabel() }}</button>
        <p class="muted hint" id="tabSyncHint">Fuentes conectadas (Duolingo) · Games manual</p>
        <small class="muted hint" aria-live="polite">{{ sync.note() }}</small>
        <hr />
        <a routerLink="/settings">Configuración</a>
        <form method="post" action="/logout"><button class="row" type="submit">Salir</button></form>
      </div>
    }
  `,
})
export class TabBar {
  protected readonly sync = inject(SyncService);
  private readonly injector = inject(Injector);
  private readonly moreBtn = viewChild.required<ElementRef<HTMLButtonElement>>('moreBtn');
  private readonly sheet = viewChild<ElementRef<HTMLElement>>('sheet');

  protected readonly open = signal(false);
  private readonly section = currentSection(() => this.open.set(false)); // arriving somewhere closes the sheet; focus belongs to the new page
  /** /profile has no entry of its own: it is the chess view. */
  protected readonly current = computed(() => (this.section() === 'profile' ? 'chess' : this.section()));
  protected readonly secondary = computed(() => SECONDARY.includes(this.current()));

  protected toggle(): void {
    if (this.open()) return this.close();
    this.open.set(true);
    afterNextRender(() => this.sheet()?.nativeElement.querySelector<HTMLElement>('a, button')?.focus(), { injector: this.injector });
  }

  protected close(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.moreBtn().nativeElement.focus();
  }
}
