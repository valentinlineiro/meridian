import { ResolveFn, Routes, UrlMatcher, UrlSegment } from '@angular/router';
import { legacyUrlGuard } from './core/legacy-url';
import { GAME_NAMES, gameName } from './core/words';

// Route params must not contain dots: the Worker's SPA fallback treats a dot in the last segment as a file.

/** /languages and /languages/:courseId are ONE route, so choosing a course reuses the view (no reload of the catalogue). */
const languages: UrlMatcher = (segs) =>
  segs[0]?.path === 'languages' && segs.length <= 2 ? { consumed: segs, posParams: (segs[1] ? { courseId: segs[1] } : {}) as Record<string, UrlSegment> } : null;

/** /games and /games/:game are ONE route (the report is a mode of Games, as a course is of Idiomas); an unknown key falls to the redirect below. */
const games: UrlMatcher = (segs) =>
  segs[0]?.path === 'games' && (segs.length === 1 || (segs.length === 2 && segs[1]!.path in GAME_NAMES))
    ? { consumed: segs, posParams: (segs[1] ? { game: segs[1] } : {}) as Record<string, UrlSegment> } : null;
const gamesTitle: ResolveFn<string> = (route) => {
  const g = route.params['game'];
  return g ? `${gameName(g)} · LinkedIn Games · Meridian` : 'LinkedIn Games · Meridian';
};

export const routes: Routes = [
  { path: '**', canMatch: [legacyUrlGuard], children: [] }, // legacy #/x and ?course= URLs, first navigation only
  { path: '', pathMatch: 'full', redirectTo: 'overview' },
  { path: 'overview', title: 'Hoy · Meridian', loadComponent: () => import('./features/overview/overview').then((m) => m.Overview) },
  { path: 'changes', title: 'Qué cambió · Meridian', loadComponent: () => import('./features/changes/changes').then((m) => m.Changes) },
  { path: 'trajectory', title: 'Trayectoria · Meridian', loadComponent: () => import('./features/trajectory/trajectory').then((m) => m.Trajectory) },
  { path: 'chess', title: 'Ajedrez · Meridian', loadComponent: () => import('./features/chess/chess').then((m) => m.Chess) },
  { matcher: languages, title: 'Idiomas · Meridian', loadComponent: () => import('./features/languages/languages').then((m) => m.Languages) },
  { matcher: games, title: gamesTitle, loadComponent: () => import('./features/games/games').then((m) => m.Games) },
  { path: 'games/:other', redirectTo: 'games' },
  // Legacy /profile opens the chess view with its engine section open and scrolled to (it has no view of its own).
  { path: 'profile', title: 'Perfil · Meridian', data: { engineSection: true }, loadComponent: () => import('./features/chess/chess').then((m) => m.Chess) },
  { path: 'settings', title: 'Configuración · Meridian', loadComponent: () => import('./features/settings/settings').then((m) => m.Settings) },
  { path: '**', title: 'No encontrada · Meridian', loadComponent: () => import('./shell/not-found').then((m) => m.NotFound) },
];
