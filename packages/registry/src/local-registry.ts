import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { resolvePathWithinRoot } from '@agentform/core';
import { computeContentHash } from '@agentform/ir';
import { moduleDefinitionSchema, type ModuleDefinition } from '@agentform/schema';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { signContentHash, verifyContentHashSignature } from './signing.js';

export interface ModuleManifest {
  readonly source: string;
  readonly version: string;
  readonly contentHash: string;
  readonly publishedAt: string;
  readonly signature?: string;
  readonly publicKeyPem?: string;
}

export interface PublishModuleOptions {
  /** PEM-encoded Ed25519 private key — when given, the published manifest carries a real signature over the module's content hash; when omitted, the module is published unsigned (verification is then simply skipped on resolve, the same "no key configured, nothing to check" honesty `readBackupSnapshot`-style code elsewhere in this codebase already uses for optional integrity checks). */
  readonly privateKeyPem?: string;
  readonly publicKeyPem?: string;
}

export interface ResolvedModule {
  readonly manifest: ModuleManifest;
  readonly definition: ModuleDefinition;
  /** `true` only when the manifest carried a signature *and* it verified against `publicKeyPem` — `false` for both "unsigned" and "signature present but invalid", which a caller must tell apart by also checking `manifest.signature`. */
  readonly signatureVerified: boolean;
}

/** `source` can contain `/` (e.g. `registry.agentform.dev/government/complaint-intake`) — used directly as nested directories, sandboxed by `resolvePathWithinRoot` the same way every other file reference in this codebase is (never trusts `source`/`version` enough to let them escape `registryRoot`). */
function moduleDir(registryRoot: string, source: string, version: string): string {
  return resolvePathWithinRoot(registryRoot, path.join(source, version));
}

/**
 * Publishes `definition` into the local registry at `registryRoot`,
 * writing `module.yaml` (the definition itself) and `manifest.json`
 * (content hash, timestamp, and — if a private key is given — a
 * signature over that hash). Overwrites an existing version's files if
 * called again for the same source+version — the local registry is a
 * cache/workspace a publisher controls directly, not an append-only
 * store; re-publishing the same version is a publisher decision, not
 * something this function needs to police.
 */
export function publishModule(
  registryRoot: string,
  source: string,
  definition: ModuleDefinition,
  options: PublishModuleOptions = {},
): ModuleManifest {
  const dir = moduleDir(registryRoot, source, definition.metadata.version);
  mkdirSync(dir, { recursive: true });

  const contentHash = computeContentHash(definition);
  const manifest: ModuleManifest = {
    source,
    version: definition.metadata.version,
    contentHash,
    publishedAt: new Date().toISOString(),
    ...(options.privateKeyPem
      ? {
          signature: signContentHash(contentHash, options.privateKeyPem),
          publicKeyPem: options.publicKeyPem,
        }
      : {}),
  };

  writeFileSync(path.join(dir, 'module.yaml'), stringifyYaml(definition, { indent: 2 }), 'utf-8');
  writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
  return manifest;
}

/**
 * Resolves `source`+`version` from the local registry, validating the
 * module definition against `moduleDefinitionSchema` and verifying its
 * signature when both the manifest and a `trustedPublicKeyPem` are
 * present. Throws (never returns a partial/invalid result) if the
 * version isn't published, the manifest's recorded `contentHash` no
 * longer matches the definition on disk (tamper detection — the same
 * "recompute and compare" pattern `.afplan`/test-results files use), or
 * the definition fails schema validation.
 */
export function resolveModule(
  registryRoot: string,
  source: string,
  version: string,
  trustedPublicKeyPem?: string,
): ResolvedModule {
  const dir = moduleDir(registryRoot, source, version);
  const manifestPath = path.join(dir, 'manifest.json');
  const modulePath = path.join(dir, 'module.yaml');

  if (!existsSync(manifestPath) || !existsSync(modulePath)) {
    throw new Error(`Module "${source}@${version}" is not published in registry "${registryRoot}"`);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as ModuleManifest;
  const rawDefinition = parseYaml(readFileSync(modulePath, 'utf-8')) as unknown;

  const contentHash = computeContentHash(rawDefinition);
  if (contentHash !== manifest.contentHash) {
    throw new Error(
      `Module "${source}@${version}" failed integrity check: recorded content hash does not match its module.yaml — it may have been tampered with`,
    );
  }

  const parsed = moduleDefinitionSchema.safeParse(rawDefinition);
  if (!parsed.success) {
    throw new Error(
      `Module "${source}@${version}" failed schema validation: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`,
    );
  }

  const signatureVerified = Boolean(
    manifest.signature &&
    trustedPublicKeyPem &&
    verifyContentHashSignature(manifest.contentHash, manifest.signature, trustedPublicKeyPem),
  );

  return { manifest, definition: parsed.data, signatureVerified };
}

export interface RegistryModuleEntry {
  readonly source: string;
  readonly version: string;
}

/** Every `source`+`version` published in `registryRoot`, discovered by walking the directory tree for `manifest.json` files — `[]` if the registry root doesn't exist yet (nothing has ever been published there). */
export function listModules(registryRoot: string): readonly RegistryModuleEntry[] {
  if (!existsSync(registryRoot)) {
    return [];
  }
  const entries: RegistryModuleEntry[] = [];

  function walk(dir: string, segments: readonly string[]): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const childPath = path.join(dir, entry.name);
      const childSegments = [...segments, entry.name];
      if (existsSync(path.join(childPath, 'manifest.json'))) {
        const version = childSegments.at(-1)!;
        const source = childSegments.slice(0, -1).join('/');
        entries.push({ source, version });
        continue;
      }
      walk(childPath, childSegments);
    }
  }

  walk(registryRoot, []);
  return entries;
}
