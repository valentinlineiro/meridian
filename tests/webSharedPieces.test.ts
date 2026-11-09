import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const files = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|html)$/.test(n) && !n.endsWith('.spec.ts') && !p.includes('/shared/') ? [p] : [];
  });

// A selection and a collapsible block each have one piece (app-segmented, app-section): a screen does not draw its own.
describe('web shared pieces', () => {
  const offenders = (re: RegExp) => files('web/src/app').flatMap((f) => [...readFileSync(f, 'utf8').matchAll(re)].map((m) => `${f}: ${m[0]}`));

  it('shouldUseSegmentedWhenAGroupOfButtonsShowsASelection', () => {
    expect(offenders(/aria-pressed/g)).toEqual([]);
  });

  it('shouldUseSectionWhenABlockOfThePageCollapses', () => {
    expect(offenders(/<details[^>]*class="cgroup"|<details class="cgroup"/g)).toEqual([]);
  });
});
