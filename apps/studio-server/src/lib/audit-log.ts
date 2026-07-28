import { resolvePathWithinRoot } from '@agentform/core';
import { computeContentHash } from '@agentform/ir';
import type { FileSystem } from '@agentform/parser';
import type {
  AuditChainVerification,
  AuditEntry,
  AuditTarget,
  ChangeSource,
} from '@agentform/studio-core';
import type { FileWriter } from './file-writer.js';

const AUDIT_LOG_RELATIVE_PATH = '.agentform/studio-audit.jsonl';

/** Never `sha256:`-prefixed, so it can never be confused with a real hash. */
const AUDIT_CHAIN_GENESIS = 'genesis';

/**
 * Stamped onto a pre-hardening entry's `previousEntryHash`/`entryHash`
 * when reading it back — never `sha256:`-prefixed, so (like `'genesis'`)
 * it can't be confused with a real hash. Entries written before this
 * hardening pass have neither field on disk at all; the response schema
 * requires both on every entry, so a legacy line has to be normalized to
 * something before it can be serialized back to a client.
 */
const LEGACY_HASH_PLACEHOLDER = 'legacy';

interface UnhashedEntryFields {
  readonly timestamp: string;
  readonly source: ChangeSource;
  readonly summary: string;
  readonly target: AuditTarget;
  readonly previousEntryHash: string;
}

function computeEntryHash(fields: UnhashedEntryFields): string {
  return computeContentHash(fields);
}

function lastEntryHash(serialized: string): string {
  const lines = serialized.split('\n').filter((line) => line.trim().length > 0);
  const lastLine = lines[lines.length - 1];
  if (lastLine === undefined) {
    return AUDIT_CHAIN_GENESIS;
  }
  const parsed = JSON.parse(lastLine) as Partial<AuditEntry>;
  // A pre-hardening legacy line has no entryHash at all — treat it the
  // same as an empty log rather than chaining from something that was
  // never actually hashed.
  return typeof parsed.entryHash === 'string' ? parsed.entryHash : AUDIT_CHAIN_GENESIS;
}

/**
 * Local, append-only, hash-chained provenance for every write Studio
 * makes (Phase 18, hardened in ADR-0022) — each entry's `entryHash`
 * covers every other field, including the previous entry's own hash, so
 * altering, deleting, or reordering any historical entry breaks every
 * hash from that point forward when re-verified (`verifyAuditLog`).
 * This detects tampering after the fact; it does not *prevent* someone
 * with direct file access from editing the file and regenerating a
 * fresh, internally-consistent chain from scratch — the same honest
 * limitation `@agentform/planner`'s `.afplan` tamper-evidence has always
 * had. Lives under `.agentform/`, the same local/uncommitted-by-
 * convention directory the CLI's own state (`state.db`,
 * `test-results.json`) already uses; never checked into git, never a
 * shared team artifact. See ADR-0021, ADR-0022.
 */
export function appendAuditEntry(
  rootDir: string,
  fs: FileSystem,
  fileWriter: FileWriter,
  entry: { readonly source: ChangeSource; readonly summary: string; readonly target: AuditTarget },
): AuditEntry {
  const absolutePath = resolvePathWithinRoot(rootDir, AUDIT_LOG_RELATIVE_PATH);
  const existing = fs.exists(absolutePath) ? fs.readFile(absolutePath) : '';
  const unhashed: UnhashedEntryFields = {
    ...entry,
    timestamp: new Date().toISOString(),
    previousEntryHash: lastEntryHash(existing),
  };
  const stamped: AuditEntry = { ...unhashed, entryHash: computeEntryHash(unhashed) };
  fileWriter.writeFile(absolutePath, `${existing}${JSON.stringify(stamped)}\n`);
  return stamped;
}

export interface ReadAuditLogResult {
  readonly entries: readonly AuditEntry[];
  readonly verification: AuditChainVerification;
}

/**
 * Newest first — matches every other history listing in this codebase
 * (apply history, backups). `verification` always covers every entry
 * ever written, independent of `limit`: truncating what's *displayed*
 * must never truncate what's *verified*, or a tampered entry outside the
 * displayed window could go unreported.
 */
export function readAuditLog(rootDir: string, fs: FileSystem, limit?: number): ReadAuditLogResult {
  const absolutePath = resolvePathWithinRoot(rootDir, AUDIT_LOG_RELATIVE_PATH);
  if (!fs.exists(absolutePath)) {
    return {
      entries: [],
      verification: { valid: true, verifiedEntryCount: 0, totalEntryCount: 0 },
    };
  }
  const serialized = fs.readFile(absolutePath);
  const verification = verifyAuditLog(serialized);
  const entries = serialized
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => normalizeEntry(JSON.parse(line) as Partial<AuditEntry>))
    .reverse();
  return { entries: limit === undefined ? entries : entries.slice(0, limit), verification };
}

/**
 * A pre-hardening entry on disk has neither hash field at all — the
 * response schema requires both on every entry, so a legacy line is
 * stamped with `LEGACY_HASH_PLACEHOLDER` rather than serialized as-is
 * (which would 500 the whole endpoint the moment one old entry is read
 * back). This only affects what's returned to a client; `verifyAuditLog`
 * reads the raw file directly and already treats a missing hash as an
 * unverifiable legacy line rather than tampering.
 */
function normalizeEntry(parsed: Partial<AuditEntry>): AuditEntry {
  return {
    ...parsed,
    previousEntryHash: parsed.previousEntryHash ?? LEGACY_HASH_PLACEHOLDER,
    entryHash: parsed.entryHash ?? LEGACY_HASH_PLACEHOLDER,
  } as AuditEntry;
}

/**
 * Walks the raw log oldest-to-newest, recomputing each entry's hash and
 * comparing it to what's stored. Never gates anything — this is
 * downstream observability about writes that already succeeded, not a
 * precondition for a future write; nothing about a broken chain should
 * refuse the next edit. A pre-hardening legacy line (no hash fields at
 * all) is reported as unverifiable rather than tampered, and resets the
 * running chain expectation to genesis for whatever follows, so real
 * tampering later in the file is still caught.
 */
export function verifyAuditLog(serialized: string): AuditChainVerification {
  const lines = serialized.split('\n').filter((line) => line.trim().length > 0);
  let expectedPreviousHash: string = AUDIT_CHAIN_GENESIS;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined) {
      continue;
    }
    const parsed = JSON.parse(line) as Partial<AuditEntry>;

    if (typeof parsed.entryHash !== 'string' || typeof parsed.previousEntryHash !== 'string') {
      expectedPreviousHash = AUDIT_CHAIN_GENESIS;
      continue;
    }

    if (parsed.previousEntryHash !== expectedPreviousHash) {
      return {
        valid: false,
        error: `entry ${index + 1} does not chain from the previous entry — it may have been reordered, or a prior entry was deleted`,
        verifiedEntryCount: index,
        totalEntryCount: lines.length,
      };
    }

    const { entryHash, ...unhashed } = parsed;
    const recomputed = computeEntryHash(unhashed as UnhashedEntryFields);
    if (recomputed !== entryHash) {
      return {
        valid: false,
        error: `entry ${index + 1}'s content does not match its recorded hash — it may have been tampered with`,
        verifiedEntryCount: index,
        totalEntryCount: lines.length,
      };
    }

    expectedPreviousHash = entryHash;
  }

  return { valid: true, verifiedEntryCount: lines.length, totalEntryCount: lines.length };
}

/** A short, generic fallback summary for a manual edit that didn't supply one — derived structurally from the patch itself, never from spec content (which could be arbitrarily large or, in principle, sensitive). */
export function describeSpecPatch(
  patch: readonly { readonly op: string; readonly path: readonly (string | number)[] }[],
): string {
  if (patch.length === 0) {
    return 'Applied an empty patch (no-op).';
  }
  const operation = patch[0];
  if (patch.length === 1 && operation !== undefined) {
    return `${operation.op} ${operation.path.join('.')}`;
  }
  return `Applied ${patch.length} changes`;
}
