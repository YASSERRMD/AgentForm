import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AgentformPluginManifest } from '@agentform/plugin-sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { listPlugins, publishPluginEntry, resolvePluginEntry } from './plugin-registry.js';
import { generateSigningKeyPair } from './signing.js';

function fixtureManifest(
  overrides: Partial<AgentformPluginManifest> = {},
): AgentformPluginManifest {
  return {
    name: '@example/agentform-adapter-custom',
    version: '1.0.0',
    apiVersion: 'agentform.dev/v1alpha1',
    type: 'FrameworkAdapter',
    capabilities: ['agent', 'tool'],
    supportedSpecVersions: ['v1alpha1'],
    ...overrides,
  };
}

let registryRoot: string | undefined;

afterEach(() => {
  if (registryRoot) {
    rmSync(registryRoot, { recursive: true, force: true });
    registryRoot = undefined;
  }
});

describe('publishPluginEntry / resolvePluginEntry', () => {
  it('round-trips a published plugin manifest', () => {
    registryRoot = mkdtempSync(path.join(tmpdir(), 'agentform-plugin-registry-'));
    publishPluginEntry(registryRoot, fixtureManifest());
    const resolved = resolvePluginEntry(registryRoot, '@example/agentform-adapter-custom', '1.0.0');
    expect(resolved.entry.manifest.type).toBe('FrameworkAdapter');
    expect(resolved.signatureVerified).toBe(false);
  });

  it('throws for an unpublished plugin version', () => {
    registryRoot = mkdtempSync(path.join(tmpdir(), 'agentform-plugin-registry-'));
    expect(() => resolvePluginEntry(registryRoot!, 'nope', '1.0.0')).toThrow(/not published/);
  });

  it('verifies a signed plugin manifest against the matching key', () => {
    registryRoot = mkdtempSync(path.join(tmpdir(), 'agentform-plugin-registry-'));
    const keys = generateSigningKeyPair();
    publishPluginEntry(registryRoot, fixtureManifest(), {
      privateKeyPem: keys.privateKeyPem,
      publicKeyPem: keys.publicKeyPem,
    });
    const resolved = resolvePluginEntry(
      registryRoot,
      '@example/agentform-adapter-custom',
      '1.0.0',
      keys.publicKeyPem,
    );
    expect(resolved.signatureVerified).toBe(true);
  });
});

describe('listPlugins', () => {
  it('returns an empty list before anything is published', () => {
    registryRoot = mkdtempSync(path.join(tmpdir(), 'agentform-plugin-registry-'));
    expect(listPlugins(registryRoot)).toEqual([]);
  });

  it('lists every published plugin name+version', () => {
    registryRoot = mkdtempSync(path.join(tmpdir(), 'agentform-plugin-registry-'));
    publishPluginEntry(registryRoot, fixtureManifest());
    publishPluginEntry(registryRoot, fixtureManifest({ version: '2.0.0' }));
    const entries = [...listPlugins(registryRoot)].sort((a, b) =>
      a.version.localeCompare(b.version),
    );
    expect(entries).toEqual([
      { name: '@example/agentform-adapter-custom', version: '1.0.0' },
      { name: '@example/agentform-adapter-custom', version: '2.0.0' },
    ]);
  });
});
