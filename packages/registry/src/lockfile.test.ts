import { describe, expect, it } from 'vitest';
import { buildLockfile, parseLockfile, serializeLockfile } from './lockfile.js';
import type { ResolvedModuleSummary } from './resolve-project-modules.js';

const SAMPLE_MODULES: readonly ResolvedModuleSummary[] = [
  {
    id: 'complaintIntake',
    source: 'a/b',
    version: '1.2.0',
    contentHash: 'sha256:abc',
    signatureVerified: true,
  },
];

describe('buildLockfile', () => {
  it('sorts modules by id for a deterministic output', () => {
    const lockfile = buildLockfile([
      { id: 'b', source: 'x', version: '1.0.0', contentHash: 'h1', signatureVerified: false },
      { id: 'a', source: 'y', version: '1.0.0', contentHash: 'h2', signatureVerified: false },
    ]);
    expect(lockfile.modules.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('carries lockfileVersion and every resolved field', () => {
    const lockfile = buildLockfile(SAMPLE_MODULES);
    expect(lockfile.lockfileVersion).toBe(1);
    expect(lockfile.modules[0]).toEqual({
      id: 'complaintIntake',
      source: 'a/b',
      version: '1.2.0',
      contentHash: 'sha256:abc',
      signatureVerified: true,
    });
  });
});

describe('serializeLockfile / parseLockfile', () => {
  it('round-trips through serialize and parse', () => {
    const lockfile = buildLockfile(SAMPLE_MODULES);
    const parsed = parseLockfile(serializeLockfile(lockfile));
    expect(parsed).toEqual(lockfile);
  });

  it('parseLockfile returns undefined for malformed JSON', () => {
    expect(parseLockfile('not json{{')).toBeUndefined();
  });

  it('parseLockfile returns undefined for an unrecognized lockfileVersion', () => {
    expect(parseLockfile(JSON.stringify({ lockfileVersion: 999, modules: [] }))).toBeUndefined();
  });

  it('parseLockfile returns undefined when modules is not an array', () => {
    expect(parseLockfile(JSON.stringify({ lockfileVersion: 1, modules: 'nope' }))).toBeUndefined();
  });
});
