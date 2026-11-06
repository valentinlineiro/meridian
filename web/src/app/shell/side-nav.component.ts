import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { SyncService } from '../core/sync.service';

// Groups and items exactly as the legacy side nav (src/frontend.ts:15-35).
const GROUPS = [
  { label: 'Resumen', items: [{ path: 'overview', label: 'Hoy' }, { path: 'changes', label: 'Qué cambió' }, { path: 'trajectory', label: 'Trayectoria' }] },
  { label: 'Dominios', items: [{ path: 'chess', label: 'Ajedrez' }, { path: 'languages', label: 'Idiomas' }, { path: 'games', label: 'LinkedIn Games' }] },
];
const LABELS: Record<string, string> = {
  ...Object.fromEntries(GROUPS.flatMap((g) => g.items.map((i) => [i.path, i.label]))),
  profile: 'Ajedrez', // the player profile belongs to chess, as on the legacy page
  settings: 'Configuración',
};

// Attribute selector: the host is the <nav class="side"> itself, so the .shell grid and sticky rules apply as in legacy.
@Component({
  selector: 'nav[app-side-nav]',
  imports: [RouterLink, RouterLinkActive],
  host: { class: 'side', 'aria-label': 'Secciones' },
  template: `
    <button class="side-toggle" type="button" (click)="open.set(!open())" [attr.aria-expanded]="open()" aria-controls="sideMenu">
      <span>{{ current() }}</span><span aria-hidden="true">▾</span>
    </button>
    <div class="side-menu" id="sideMenu" [class.open]="open()">
      @for (group of groups; track group.label) {
        <div class="side-group">{{ group.label }}</div>
        @for (item of group.items; track item.path) {
          @let on = item.path === (section() === 'profile' ? 'chess' : section());
          <a class="side-item" [routerLink]="'/' + item.path" [class.active]="on" [attr.aria-current]="on ? 'page' : null">{{ item.label }}</a>
        }
      }
      <div class="side-group">Cuenta</div>
      <button id="syncBtn" class="btn btn-p side-sync" type="button" (click)="sync.start()" [disabled]="sync.busy()"
        aria-describedby="syncScopeHint" title="Sincroniza cuentas conectadas (Duolingo). LinkedIn Games es registro manual.">{{ sync.lastSyncLabel() }}</button>
      <div class="muted side-note" id="syncScopeHint" style="font-size:11px;margin-top:2px;line-height:1.3">Fuentes conectadas (Duolingo) · Games manual</div>
      <small class="muted side-note" aria-live="polite">{{ sync.note() }}</small>
      <a class="side-item" routerLink="/settings" routerLinkActive="active" ariaCurrentWhenActive="page">Configuración</a>
      <form method="post" action="/logout" style="margin:0"><button class="side-item" type="submit">Salir</button></form>
    </div>
  `,
})
export class SideNav {
  protected readonly sync = inject(SyncService);
  protected readonly groups = GROUPS;
  protected readonly open = signal(false);
  /** First path segment; /profile has no entry of its own: it marks Ajedrez, as on the legacy page. */
  protected readonly section = signal('');
  protected readonly current = computed(() => LABELS[this.section()] ?? 'Hoy');

  constructor() {
    const router = inject(Router);
    router.events.pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed()).subscribe(() => {
      this.open.set(false);
      this.section.set(router.url.split(/[/?#]/)[1] ?? '');
    });
  }
}
