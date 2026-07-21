import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ModuleDefinition } from '@agentform/schema';
import { afterEach, describe, expect, it } from 'vitest';
import { listModules, publishModule, resolveModule } from './local-registry.js';
import { generateSigningKeyPair } from './signing.js';

function fixtureModule(overrides: Partial<ModuleDefinition['spec']> = {}): ModuleDefinition {
  return {
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgentformModule',
    metadata: { name: 'complaint-intake', version: '1.2.0' },
    spec: {
      inputs: { region: { type: 'string', default: 'us-east' } },
      models: { primary: { provider: 'openai', model: 'gpt-5' } },
      agents: {
        intake: {
          model: 'primary',
          role: 'assistant',
          instructions: { text: 'Serve ${input.region}.' },
        },
      },
      ...overrides,
    },
  };
}

let registryRoot: string | undefined;

afterEach(() => {
  if (registryRoot) {
    rmSync(registryRoot, { recursive: true, force: true });
    registryRoot = undefined;
  }
});

describe('publishModule / resolveModule', () => {
  it('round-trips a published module', () => {
    registryRoot = mkdtempSync(path.join(tmpdir(), 'agentform-registry-'));
    const source = 'registry.agentform.dev/government/complaint-intake';
    publishModule(registryRoot, source, fixtureModule());

    const resolved = resolveModule(registryRoot, source, '1.2.0');
    expect(resolved.definition.metadata.name).toBe('complaint-intake');
    expect(resolved.definition.spec.agents?.intake).toBeDefined();
    expect(resolved.signatureVerified).toBe(false);
  });

  it('throws for an unpublished version', () => {
    registryRoot = mkdtempSync(path.join(tmpdir(), 'agentform-registry-'));
    expect(() => resolveModule(registryRoot!, 'x/y', '9.9.9')).toThrow(/not published/);
  });

  it('detects a tampered module.yaml via content hash mismatch', () => {
    registryRoot = mkdtempSync(path.join(tmpdir(), 'agentform-registry-'));
    const source = 'x/y';
    publishModule(registryRoot, source, fixtureModule());
    writeFileSync(
      path.join(registryRoot, source, '1.2.0', 'module.yaml'),
      'apiVersion: agentform.dev/v1alpha1\nkind: AgentformModule\nmetadata:\n  name: tampered\n  version: 1.2.0\nspec: {}\n',
      'utf-8',
    );
    expect(() => resolveModule(registryRoot!, source, '1.2.0')).toThrow(/integrity check/);
  });

  it('supports a source containing slashes as nested directories', () => {
    registryRoot = mkdtempSync(path.join(tmpdir(), 'agentform-registry-'));
    const source = 'registry.agentform.dev/government/complaint-intake';
    publishModule(registryRoot, source, fixtureModule());
    const entries = listModules(registryRoot);
    expect(entries).toEqual([{ source, version: '1.2.0' }]);
  });

  it('rejects a source that attempts path traversal', () => {
    registryRoot = mkdtempSync(path.join(tmpdir(), 'agentform-registry-'));
    expect(() => publishModule(registryRoot!, '../../etc', fixtureModule())).toThrow();
  });

  describe('signing', () => {
    it('reports signatureVerified: true when the signature matches the trusted key', () => {
      registryRoot = mkdtempSync(path.join(tmpdir(), 'agentform-registry-'));
      const keys = generateSigningKeyPair();
      const source = 'x/y';
      publishModule(registryRoot, source, fixtureModule(), {
        privateKeyPem: keys.privateKeyPem,
        publicKeyPem: keys.publicKeyPem,
      });
      const resolved = resolveModule(registryRoot, source, '1.2.0', keys.publicKeyPem);
      expect(resolved.signatureVerified).toBe(true);
    });

    it('reports signatureVerified: false when trusted against the wrong key', () => {
      registryRoot = mkdtempSync(path.join(tmpdir(), 'agentform-registry-'));
      const keys = generateSigningKeyPair();
      const wrongKeys = generateSigningKeyPair();
      const source = 'x/y';
      publishModule(registryRoot, source, fixtureModule(), {
        privateKeyPem: keys.privateKeyPem,
        publicKeyPem: keys.publicKeyPem,
      });
      const resolved = resolveModule(registryRoot, source, '1.2.0', wrongKeys.publicKeyPem);
      expect(resolved.signatureVerified).toBe(false);
    });

    it('reports signatureVerified: false for an unsigned module regardless of a trusted key', () => {
      registryRoot = mkdtempSync(path.join(tmpdir(), 'agentform-registry-'));
      const keys = generateSigningKeyPair();
      const source = 'x/y';
      publishModule(registryRoot, source, fixtureModule());
      const resolved = resolveModule(registryRoot, source, '1.2.0', keys.publicKeyPem);
      expect(resolved.signatureVerified).toBe(false);
    });
  });
});

describe('listModules', () => {
  it('returns an empty list for a registry root that does not exist yet', () => {
    expect(listModules('/tmp/agentform-registry-does-not-exist-xyz')).toEqual([]);
  });

  it('lists every published source+version', () => {
    registryRoot = mkdtempSync(path.join(tmpdir(), 'agentform-registry-'));
    const v2 = fixtureModule();
    publishModule(registryRoot, 'a/b', fixtureModule());
    publishModule(registryRoot, 'a/b', {
      ...v2,
      metadata: { ...v2.metadata, version: '2.0.0' },
    });
    publishModule(registryRoot, 'c/d', fixtureModule());
    const entries = [...listModules(registryRoot)].sort((x, y) => x.source.localeCompare(y.source));
    expect(entries).toEqual([
      { source: 'a/b', version: '1.2.0' },
      { source: 'a/b', version: '2.0.0' },
      { source: 'c/d', version: '1.2.0' },
    ]);
  });
});
