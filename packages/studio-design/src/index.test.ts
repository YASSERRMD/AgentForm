import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SELF_DIR = path.dirname(fileURLToPath(import.meta.url));

function readSource(relativePath: string): string {
  return readFileSync(path.resolve(SELF_DIR, relativePath), 'utf-8');
}

// Regression guard for the exact bug class ADR-0018 found three times in
// Phase 15: checking only index.ts's own imports isn't enough, since a
// forbidden import can hide two or three files deep. Every file actually
// reachable from index.ts is checked individually.
describe('index.ts module graph', () => {
  it.each([
    'index.ts',
    'types.ts',
    'codes.ts',
    'validate.ts',
    'render-html.ts',
    'http-contracts.ts',
  ])('%s never imports ./server.js, @agentform/ir, or node:crypto', (file) => {
    const source = readSource(file);
    expect(source).not.toMatch(/from ['"]\.\/server\.js['"]/);
    expect(source).not.toMatch(/from ['"]@agentform\/ir['"]/);
    expect(source).not.toMatch(/from ['"]node:crypto['"]/);
  });
});
