import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { SyncService } from '../core/sync.service';
import { currentSection } from './section';

// The sidebar of the desktop layout; phones use the tab bar (tab-bar.ts). Groups and items as the legacy side nav (src/frontend.ts:15-35).
const GROUPS = [
  { label: 'Resumen', items: [{ path: 'overview', label: 'Hoy' }, { path: 'changes', label: 'Qué cambió' }, { path: 'trajectory', label: 'Trayectoria' }] },
  { label: 'Dominios', items: [{ path: 'chess', label: 'Ajedrez' }, { path: 'languages', label: 'Idiomas' }, { path: 'games', label: 'LinkedIn Games' }] },
];
// Attribute selector: the host is the <nav class="side"> itself, so the .shell grid and sticky rules apply as in legacy.
@Component({
  selector: 'nav[app-side-nav]',
  imports: [RouterLink, RouterLinkActive],
  host: { class: 'side', 'aria-label': 'Secciones' },
  template: `
    <div class="side-menu" id="sideMenu">
      @for (group of groups; track group.label) {
        <div class="side-group" [id]="'sideGroup' + $index">{{ group.label }}</div>
        <ul [attr.aria-labelledby]="'sideGroup' + $index">
          @for (item of group.items; track item.path) {
            @let on = item.path === (section() === 'profile' ? 'chess' : section());
            <li><a class="side-item" [routerLink]="'/' + item.path" [class.active]="on" [attr.aria-current]="on ? 'page' : null">{{ item.label }}</a></li>
          }
        </ul>
      }
      <div class="side-group">Cuenta</div>
      <button id="syncBtn" class="btn btn-p side-sync" type="button" (click)="sync.start()" [disabled]="sync.busy()"
        aria-describedby="syncScopeHint" title="Sincroniza cuentas conectadas (Duolingo). LinkedIn Games es registro manual.">{{ sync.lastSyncLabel() }}</button>
      <div class="muted side-note" id="syncScopeHint" style="font-size:var(--fs-xs);margin-top:2px;line-height:1.3">Fuentes conectadas (Duolingo) · Games manual</div>
      <small class="muted side-note" aria-live="polite">{{ sync.note() }}</small>
      <a class="side-item" routerLink="/settings" routerLinkActive="active" ariaCurrentWhenActive="page">Configuración</a>
      <form class="u-m-0" method="post" action="/logout"><button class="side-item" type="submit">Salir</button></form>
    </div>
  `,
})
export class SideNav {
  protected readonly sync = inject(SyncService);
  protected readonly groups = GROUPS;
  /** First path segment; /profile has no entry of its own: it marks Ajedrez, as on the legacy page. */
  protected readonly section = currentSection();
}
