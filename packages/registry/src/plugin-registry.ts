import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { resolvePathWithinRoot } from '@agentform/core';
import { computeContentHash } from '@agentform/ir';
import type { AgentformPluginManifest } from '@agentform/plugin-sdk';
import { signContentHash, verifyContentHashSignature } from './signing.js';

/**
 * Plugin registry metadata (§Phase 12 "add plugin registry metadata") —
 * the same local-registry shape `local-registry.ts` uses for modules,
 * applied to `AgentformPluginManifest` (§11) instead. A plugin has no
 * separate "module.yaml" body the way a module does: the manifest
 * itself is the complete published artifact (a plugin's actual code is
 * an installed npm package, per §11 — this registry only ever indexes
 * and signs its declared metadata, never the code).
 */
export interface PluginRegistryEntry {
  readonly manifest: AgentformPluginManifest;
  readonly contentHash: string;
  readonly publishedAt: string;
  readonly signature?: string;
  readonly publicKeyPem?: string;
}

export interface PublishPluginOptions {
  readonly privateKeyPem?: string;
  readonly publicKeyPem?: string;
}

function pluginDir(registryRoot: string, name: string, version: string): string {
  return resolvePathWithinRoot(registryRoot, path.join('plugins', name, version));
}

export function publishPluginEntry(
  registryRoot: string,
  manifest: AgentformPluginManifest,
  options: PublishPluginOptions = {},
): PluginRegistryEntry {
  const dir = pluginDir(registryRoot, manifest.name, manifest.version);
  mkdirSync(dir, { recursive: true });

  const contentHash = computeContentHash(manifest);
  const entry: PluginRegistryEntry = {
    manifest,
    contentHash,
    publishedAt: new Date().toISOString(),
    ...(options.privateKeyPem
      ? {
          signature: signContentHash(contentHash, options.privateKeyPem),
          publicKeyPem: options.publicKeyPem,
        }
      : {}),
  };

  writeFileSync(path.join(dir, 'plugin.json'), `${JSON.stringify(entry, null, 2)}\n`, 'utf-8');
  return entry;
}

export interface ResolvedPluginEntry {
  readonly entry: PluginRegistryEntry;
  readonly signatureVerified: boolean;
}

export function resolvePluginEntry(
  registryRoot: string,
  name: string,
  version: string,
  trustedPublicKeyPem?: string,
): ResolvedPluginEntry {
  const entryPath = path.join(pluginDir(registryRoot, name, version), 'plugin.json');
  if (!existsSync(entryPath)) {
    throw new Error(`Plugin "${name}@${version}" is not published in registry "${registryRoot}"`);
  }
  const entry = JSON.parse(readFileSync(entryPath, 'utf-8')) as PluginRegistryEntry;

  const recomputed = computeContentHash(entry.manifest);
  if (recomputed !== entry.contentHash) {
    throw new Error(
      `Plugin "${name}@${version}" failed integrity check: recorded content hash does not match its manifest — it may have been tampered with`,
    );
  }

  const signatureVerified = Boolean(
    entry.signature &&
    trustedPublicKeyPem &&
    verifyContentHashSignature(entry.contentHash, entry.signature, trustedPublicKeyPem),
  );

  return { entry, signatureVerified };
}

export interface RegistryPluginSummary {
  readonly name: string;
  readonly version: string;
}

/**
 * Every plugin `name`+`version` published in `registryRoot` — `[]` if
 * nothing has been published there yet. Walks recursively rather than
 * assuming `name` is a single path segment: npm-scoped plugin names
 * (`@scope/package`, the realistic common case for a published adapter)
 * already contain a `/`, the same reason `local-registry.ts`'s
 * `listModules` walks recursively for `source` instead of assuming one
 * directory level.
 */
export function listPlugins(registryRoot: string): readonly RegistryPluginSummary[] {
  const pluginsRoot = path.join(registryRoot, 'plugins');
  if (!existsSync(pluginsRoot)) {
    return [];
  }
  const summaries: RegistryPluginSummary[] = [];

  function walk(dir: string, segments: readonly string[]): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const childPath = path.join(dir, entry.name);
      const childSegments = [...segments, entry.name];
      if (existsSync(path.join(childPath, 'plugin.json'))) {
        const version = childSegments.at(-1)!;
        const name = childSegments.slice(0, -1).join('/');
        summaries.push({ name, version });
        continue;
      }
      walk(childPath, childSegments);
    }
  }

  walk(pluginsRoot, []);
  return summaries;
}
