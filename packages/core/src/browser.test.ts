import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findCycle, flattenMaps, parseDurationMs, slugifyIdentifier } from './browser.js';

describe('browser.ts module graph', () => {
  it('never imports safe-path.ts, walk-source-files.ts, or the full barrel — all pull in node:fs/node:path', () => {
    const selfPath = fileURLToPath(import.meta.url).replace(/\.test\.ts$/, '.ts');
    const source = readFileSync(path.resolve(selfPath), 'utf-8');
    expect(source).not.toMatch(/from ['"]\.\/safe-path\.js['"]/);
    expect(source).not.toMatch(/from ['"]\.\/walk-source-files\.js['"]/);
    expect(source).not.toMatch(/from ['"]\.\/index\.js['"]/);
  });
});

describe('exports via the browser entry point', () => {
  it('are the real, unforked implementations', () => {
    expect(parseDurationMs('5s')).toBe(5000);
    expect(flattenMaps(new Map([['a', 1]]))).toEqual({ a: 1 });
    expect(slugifyIdentifier('Hello World', 'fallback')).toBe('Hello_World');
    expect(findCycle({ nodes: new Set(['a']), edges: [{ from: 'a', to: 'a' }] }, 'a')).toEqual([
      'a',
      'a',
    ]);
  });
});
