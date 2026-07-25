import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('index.ts (the main barrel) module graph', () => {
  it('never imports spec-document.js or @agentform/ir directly — both pull in node:crypto', () => {
    // Regression guard for a real bug found in Phase 15: apps/studio-web
    // imports this barrel for browser-safe values (findUngatedDestructiveToolNodes,
    // generateWorkflowNodeFormSchema, ...). The moment this barrel re-exported
    // buildSpecDocument (spec-document.ts -> @agentform/ir's full barrel ->
    // node:crypto), the browser crashed evaluating it in dev mode. buildSpecDocument
    // now lives only in server.ts; this barrel must never re-import it.
    const selfPath = fileURLToPath(import.meta.url).replace(/\.test\.ts$/, '.ts');
    const source = readFileSync(path.resolve(selfPath), 'utf-8');
    expect(source).not.toMatch(/from ['"]\.\/spec-document\.js['"]/);
    expect(source).not.toMatch(/from ['"]@agentform\/ir['"]/);
  });
});
