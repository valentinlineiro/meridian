import { inject, Injectable } from '@angular/core';
import { CanMatchFn, Router, UrlSegment } from '@angular/router';
import { BROWSER_LOCATION } from './api-client';

const TABS = ['overview', 'games', 'chess', 'changes', 'profile', 'trajectory', 'settings'];

/**
 * Canonical app path for a legacy URL (`#/x`, `#x`, `?course=`, bare `DUOLINGO_*` segment), or null when it is already
 * canonical. Paths carry no base href. Port of parseCanonicalRoute in src/dashboard.client.js.
 */
export function legacyRedirect(pathname: string, hash: string, search: string): string | null {
  const course = new URLSearchParams(search).get('course');
  let target = '';
  if (hash && hash !== '#' && hash !== '#/' && hash !== '#overview') target = hash;
  else if (pathname && pathname !== '/' && pathname !== '/index.html') target = pathname;
  else if (hash) target = hash;

  const [seg = '', ...rest] = target.trim().replace(/^\//, '').replace(/^#/, '').replace(/^\//, '').split('/');
  const sub = rest.join('/').trim() || null;
  const courseId = seg === 'languages' ? sub || course : seg.startsWith('DUOLINGO_') ? seg : null;
  const canonical = TABS.includes(seg) ? '/' + seg
    : courseId ? '/languages/' + encodeURIComponent(courseId)
    : seg === 'languages' ? '/languages'
    : '/overview';

  const isRoot = pathname === '' || pathname === '/';
  return course || hash || (!isRoot && pathname !== canonical) ? canonical : null;
}

/** Only the first navigation can carry a legacy URL (the Router never sees `location.hash`): it is read once. */
@Injectable({ providedIn: 'root' })
class FirstNavigation {
  private pending = true;
  consume(): boolean {
    const was = this.pending;
    this.pending = false;
    return was;
  }
}

/** False or a UrlTree, never true, so the routes after it still match. */
export const legacyUrlGuard: CanMatchFn = (_route, segments: UrlSegment[]) => {
  const first = inject(FirstNavigation);
  if (!first.consume()) return false;
  const loc = inject(BROWSER_LOCATION);
  const target = legacyRedirect('/' + segments.map((s) => s.path).join('/'), loc.hash ?? '', loc.search);
  return target ? inject(Router).parseUrl(target) : false;
};
