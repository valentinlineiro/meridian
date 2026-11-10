import { inject, signal, Signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

/** First path segment of the current URL ('' before the first navigation). `onChange` runs after each navigation. Call it in an injection context. */
export function currentSection(onChange?: () => void): Signal<string> {
  const router = inject(Router);
  const section = signal('');
  router.events.pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed()).subscribe(() => {
    section.set(router.url.split(/[/?#]/)[1] ?? '');
    onChange?.();
  });
  return section;
}
