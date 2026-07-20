import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { nodeFileSystem } from './filesystem.js';
import { loadProject } from './project.js';

const securityFixturesRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../specifications/v1alpha1/security',
);

/**
 * Loads real, on-disk multi-file fixture projects through the real
 * `nodeFileSystem` (unlike the rest of this package's tests, which use
 * `createInMemoryFileSystem` for speed and isolation) — proving §19's
 * protections hold for the actual filesystem/path-resolution machinery an
 * end user hits, not just the in-memory test harness. Phase 6's minimum
 * test list names these two scenarios explicitly: "Malicious path
 * fixture" and "Recursive reference exhaustion protection".
 */
describe('security fixtures (real filesystem)', () => {
  it('malicious-path: rejects a file reference that escapes the project root', () => {
    const rootDir = path.join(securityFixturesRoot, 'malicious-path');

    const result = loadProject({ rootDir, fs: nodeFileSystem });

    expect(result.value).toBeUndefined();
    expect(result.diagnostics.some((d) => d.code === 'AGF1002')).toBe(true);
  });

  it('recursive-reference-exhaustion: detects the $ref cycle instead of recursing until it exhausts memory or the call stack', () => {
    const rootDir = path.join(securityFixturesRoot, 'recursive-reference-exhaustion');

    const result = loadProject({ rootDir, fs: nodeFileSystem });

    expect(result.value).toBeUndefined();
    expect(result.diagnostics.some((d) => d.code === 'AGF1003')).toBe(true);
  });
});
