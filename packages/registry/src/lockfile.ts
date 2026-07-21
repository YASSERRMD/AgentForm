import type { ResolvedModuleSummary } from './resolve-project-modules.js';

export const LOCKFILE_FORMAT_VERSION = 1;

export interface LockedModule {
  readonly id: string;
  readonly source: string;
  readonly version: string;
  readonly contentHash: string;
  readonly signatureVerified: boolean;
}

export interface Lockfile {
  readonly lockfileVersion: typeof LOCKFILE_FORMAT_VERSION;
  readonly generatedAt: string;
  readonly modules: readonly LockedModule[];
}

/** Builds an `agentform.lock` document from a resolved project's modules (`resolveProjectModules`'s own `resolvedModules`) — `agentform lockfile` pins exactly which source+version+contentHash each declared module resolved to, so a later `agentform validate`/`apply` can detect drift between what's locked and what the registry now serves (a locked module resolving to a different content hash than recorded is exactly the same class of tamper/drift signal a `.afplan`'s content hash already catches for plans). */
export function buildLockfile(resolvedModules: readonly ResolvedModuleSummary[]): Lockfile {
  return {
    lockfileVersion: LOCKFILE_FORMAT_VERSION,
    generatedAt: new Date().toISOString(),
    modules: [...resolvedModules]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((module) => ({
        id: module.id,
        source: module.source,
        version: module.version,
        contentHash: module.contentHash,
        signatureVerified: module.signatureVerified,
      })),
  };
}

export function serializeLockfile(lockfile: Lockfile): string {
  return `${JSON.stringify(lockfile, null, 2)}\n`;
}

/** Parses a previously-written lockfile, returning `undefined` (never throwing) for malformed JSON or an unrecognized `lockfileVersion` — the same "invalid input is absence, not a crash" discipline every other Agentform parse function follows. */
export function parseLockfile(text: string): Lockfile | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (
    typeof raw !== 'object' ||
    raw === null ||
    (raw as { lockfileVersion?: unknown }).lockfileVersion !== LOCKFILE_FORMAT_VERSION ||
    !Array.isArray((raw as { modules?: unknown }).modules)
  ) {
    return undefined;
  }
  return raw as Lockfile;
}
