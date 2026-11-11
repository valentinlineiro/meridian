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
  host: { '(document:keydown.escape)': 'close()', '(window:popstate)': 'onPop()' },
  template: `
    <nav class="tabbar" aria-label="Secciones">
      <a class="tab" routerLink="/overview" [replaceUrl]="open()" [class.active]="!open() && current() === 'overview'" [attr.aria-current]="current() === 'overview' ? 'page' : null">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>Hoy</a>
      <a class="tab" routerLink="/chess" [replaceUrl]="open()" [class.active]="!open() && current() === 'chess'" [attr.aria-current]="current() === 'chess' ? 'page' : null">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></svg>Ajedrez</a>
      <a class="tab" routerLink="/languages" [replaceUrl]="open()" [class.active]="!open() && current() === 'languages'" [attr.aria-current]="current() === 'languages' ? 'page' : null">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 3v18M3 12h18" /></svg>Idiomas</a>
      <a class="tab" routerLink="/games" [replaceUrl]="open()" [class.active]="!open() && current() === 'games'" [attr.aria-current]="current() === 'games' ? 'page' : null">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /><rect x="13" y="13" width="8" height="8" rx="1.5" /></svg>Games</a>
      <button #moreBtn class="tab" type="button" [class.active]="open() || secondary()" [attr.aria-expanded]="open()" aria-controls="moreSheet" (click)="toggle()">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="19" cy="12" r="1.2" /></svg>Más</button>
    </nav>
    @if (open()) {
      <button class="scrim" type="button" aria-label="Cerrar" tabindex="-1" (click)="close()"></button>
      <div #sheet class="sheet" id="moreSheet" role="dialog" aria-modal="true" aria-label="Más secciones" (keydown)="trap($event)">
        <div class="sheet-group" id="sheetGroupResumen">Resumen</div>
        <ul aria-labelledby="sheetGroupResumen">
          <li><a routerLink="/changes" replaceUrl [attr.aria-current]="current() === 'changes' ? 'page' : null">Qué cambió</a></li>
          <li><a routerLink="/trajectory" replaceUrl [attr.aria-current]="current() === 'trajectory' ? 'page' : null">Trayectoria</a></li>
        </ul>
        <div class="sheet-group" id="sheetGroupCuenta">Cuenta</div>
        <div role="group" aria-labelledby="sheetGroupCuenta">
          <button id="tabSyncBtn" class="btn btn-p sync" type="button" (click)="sync.start()" [disabled]="sync.busy()" aria-describedby="tabSyncHint"
            title="Sincroniza cuentas conectadas (Duolingo). LinkedIn Games es registro manual.">{{ sync.lastSyncLabel() }}</button>
          <p class="muted hint" id="tabSyncHint">Fuentes conectadas (Duolingo) · Games manual</p>
          <small class="muted hint" aria-live="polite">{{ sync.note() }}</small>
          <a routerLink="/settings" replaceUrl [attr.aria-current]="current() === 'settings' ? 'page' : null">Configuración</a>
          <form method="post" action="/logout"><button class="row" type="submit">Salir</button></form>
        </div>
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
  private readonly section = currentSection(() => this.leave()); // arriving somewhere closes the sheet; focus belongs to the new page
  /** /profile has no entry of its own: it is the chess view. */
  protected readonly current = computed(() => (this.section() === 'profile' ? 'chess' : this.section()));
  protected readonly secondary = computed(() => SECONDARY.includes(this.current()));

  protected toggle(): void {
    if (this.open()) return this.close();
    this.open.set(true);
    history.pushState({ moreSheet: true }, ''); // the system "back" closes the sheet instead of leaving the page
    afterNextRender(() => this.sheet()?.nativeElement.querySelector<HTMLElement>('a, button')?.focus(), { injector: this.injector });
  }

  protected close(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.moreBtn().nativeElement.focus();
    if (history.state?.moreSheet) history.back(); // drop the entry the sheet added
  }

  /** Modal: Tab and Shift+Tab wrap inside the sheet instead of reaching the page behind the scrim. */
  protected trap(e: KeyboardEvent): void {
    if (e.key !== 'Tab') return;
    const f = [...this.sheet()!.nativeElement.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
    e.preventDefault();
    if (!f.length) return;
    const i = f.indexOf(document.activeElement as HTMLElement);
    f[e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i === f.length - 1 ? 0 : i + 1)]!.focus();
  }

  /** "Back" with the sheet open: it was the sheet's own entry that went away, so only the sheet closes. */
  protected onPop(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.moreBtn().nativeElement.focus();
  }

  /** Arriving on a page closes the sheet; the link that brought us here replaced the sheet's entry (replaceUrl), nothing to drop. */
  private leave(): void { this.open.set(false); }
}
