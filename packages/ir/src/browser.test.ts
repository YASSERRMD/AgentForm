import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateSemantics } from './browser.js';
import { withApplication } from './test-fixtures.js';

describe('browser.ts module graph', () => {
  it('never imports hash.ts or build.ts, directly or via a barrel — both pull in node:crypto', () => {
    const selfPath = fileURLToPath(import.meta.url).replace(/\.test\.ts$/, '.ts');
    const source = readFileSync(path.resolve(selfPath), 'utf-8');
    expect(source).not.toMatch(/from ['"]\.\/hash\.js['"]/);
    expect(source).not.toMatch(/from ['"]\.\/build\.js['"]/);
    expect(source).not.toMatch(/from ['"]\.\/index\.js['"]/);
  });
});

describe('validateSemantics via the browser entry point', () => {
  it('is the real validator: a valid application produces no diagnostics', () => {
    const app = withApplication(() => {});
    expect(validateSemantics(app)).toEqual([]);
  });

  it('is the real validator: an unreachable workflow node is still caught (AGF3005)', () => {
    const app = withApplication((a) => {
      a.spec.workflows.main!.nodes.orphan = { type: 'agent', agent: 'assistant' };
    });
    const diagnostics = validateSemantics(app);
    expect(diagnostics.some((d) => d.code === 'AGF3005')).toBe(true);
  });
});
