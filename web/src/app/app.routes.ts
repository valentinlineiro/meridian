import { Routes, UrlMatcher, UrlSegment } from '@angular/router';
import { legacyUrlGuard } from './core/legacy-url';

// Route params must not contain dots: the Worker's SPA fallback treats a dot in the last segment as a file.

/** /languages and /languages/:courseId are ONE route, so choosing a course reuses the view (no reload of the catalogue). */
const languages: UrlMatcher = (segs) =>
  segs[0]?.path === 'languages' && segs.length <= 2 ? { consumed: segs, posParams: (segs[1] ? { courseId: segs[1] } : {}) as Record<string, UrlSegment> } : null;

export const routes: Routes = [
  { path: '**', canMatch: [legacyUrlGuard], children: [] }, // legacy #/x and ?course= URLs, first navigation only
  { path: '', pathMatch: 'full', redirectTo: 'overview' },
  { path: 'overview', title: 'Hoy · Meridian', loadComponent: () => import('./features/overview/overview.component').then((m) => m.Overview) },
  { path: 'changes', title: 'Qué cambió · Meridian', loadComponent: () => import('./features/changes/changes.component').then((m) => m.Changes) },
  { path: 'trajectory', title: 'Trayectoria · Meridian', loadComponent: () => import('./features/trajectory/trajectory.component').then((m) => m.Trajectory) },
  { path: 'chess', title: 'Ajedrez · Meridian', loadComponent: () => import('./features/chess/chess.component').then((m) => m.Chess) },
  { matcher: languages, title: 'Idiomas · Meridian', loadComponent: () => import('./features/languages/languages.component').then((m) => m.Languages) },
  { path: 'games', title: 'LinkedIn Games · Meridian', loadComponent: () => import('./features/games/games.component').then((m) => m.Games) },
  // Legacy /profile opens the chess view with its engine section open and scrolled to (it has no view of its own).
  { path: 'profile', title: 'Perfil · Meridian', data: { engineSection: true }, loadComponent: () => import('./features/chess/chess.component').then((m) => m.Chess) },
  { path: 'settings', title: 'Configuración · Meridian', loadComponent: () => import('./features/settings/settings.component').then((m) => m.Settings) },
  { path: '**', redirectTo: 'overview' },
];
