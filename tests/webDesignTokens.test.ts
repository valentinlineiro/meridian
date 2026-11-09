import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const files = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|html|css)$/.test(n) && !n.endsWith('.spec.ts') ? [p] : [];
  });

describe('web design tokens', () => {
  it('shouldUseVarTokensWhenColouringAnythingOutsideRoot', () => {
    const offenders = files('web/src').flatMap((f) => {
      const text = readFileSync(f, 'utf8').replace(/:root\{[^}]*\}/, '');
      return [...text.matchAll(/(?<![\w&])#[0-9a-fA-F]{3,6}\b(?![0-9a-fA-F])/g)].map((m) => `${f}: ${m[0]}`);
    });
    expect(offenders).toEqual([]);
  });
});
