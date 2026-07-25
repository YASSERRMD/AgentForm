import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateSemantics } from './browser.js';
import { withApplication } from './test-fixtures.js';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));

function readSource(relativePath: string): string {
  return readFileSync(path.resolve(SELF_DIR, relativePath), 'utf-8');
}

describe('browser.ts module graph', () => {
  it('never imports hash.ts or build.ts, directly or via a barrel — both pull in node:crypto', () => {
    const source = readSource('browser.ts');
    expect(source).not.toMatch(/from ['"]\.\/hash\.js['"]/);
    expect(source).not.toMatch(/from ['"]\.\/build\.js['"]/);
    expect(source).not.toMatch(/from ['"]\.\/index\.js['"]/);
  });

  // Regression guard for a real bug found in Phase 15: browser.ts's own
  // imports were clean, but semantic/subworkflow.ts (one of its
  // dependencies) imported `findCycle` from '@agentform/core' — the full
  // barrel, which pulls in node:fs/node:path via walk-source-files.ts.
  // Checking only browser.ts's own import list, as the test above does,
  // missed this entirely; every file browser.ts transitively depends on
  // has to be checked too.
  it.each([
    'semantic/index.ts',
    'semantic/references.ts',
    'semantic/graph.ts',
    'semantic/subworkflow.ts',
    'semantic/permissions.ts',
    'semantic/outputs.ts',
    'semantic/limits.ts',
    'codes.ts',
  ])(
    '%s never imports the full @agentform/core barrel (only @agentform/core/browser is safe)',
    (file) => {
      const source = readSource(file);
      expect(source).not.toMatch(/from ['"]@agentform\/core['"]/);
    },
  );
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
