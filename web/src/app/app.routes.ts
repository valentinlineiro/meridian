import { Routes } from '@angular/router';

// '**' also matches '', so every deep link under /next/ shows the placeholder for now.
export const routes: Routes = [
  { path: '**', loadComponent: () => import('./shell-placeholder.component').then((m) => m.ShellPlaceholder) },
];
