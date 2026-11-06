import { Routes } from '@angular/router';

// Route params must not contain dots: the Worker's SPA fallback treats a dot in the last segment as a file.
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'overview' },
  { path: 'overview', title: 'Hoy · Meridian', loadComponent: () => import('./features/overview/overview.component').then((m) => m.Overview) },
  { path: 'changes', title: 'Qué cambió · Meridian', loadComponent: () => import('./features/changes/changes.component').then((m) => m.Changes) },
  { path: 'trajectory', title: 'Trayectoria · Meridian', loadComponent: () => import('./features/trajectory/trajectory.component').then((m) => m.Trajectory) },
  { path: 'chess', title: 'Ajedrez · Meridian', loadComponent: () => import('./features/chess/chess.component').then((m) => m.Chess) },
  { path: 'languages', title: 'Idiomas · Meridian', loadComponent: () => import('./features/languages/languages.component').then((m) => m.Languages) },
  { path: 'languages/:courseId', title: 'Idiomas · Meridian', loadComponent: () => import('./features/languages/languages.component').then((m) => m.Languages) },
  { path: 'games', title: 'LinkedIn Games · Meridian', loadComponent: () => import('./features/games/games.component').then((m) => m.Games) },
  { path: 'profile', title: 'Perfil · Meridian', loadComponent: () => import('./features/profile/profile.component').then((m) => m.Profile) },
  { path: 'settings', title: 'Configuración · Meridian', loadComponent: () => import('./features/settings/settings.component').then((m) => m.Settings) },
  { path: '**', redirectTo: 'overview' },
];
