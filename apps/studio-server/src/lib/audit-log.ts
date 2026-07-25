import { resolvePathWithinRoot } from '@agentform/core';
import type { FileSystem } from '@agentform/parser';
import type { AuditEntry, AuditTarget, ChangeSource } from '@agentform/studio-core';
import type { FileWriter } from './file-writer.js';

const AUDIT_LOG_RELATIVE_PATH = '.agentform/studio-audit.jsonl';

/**
 * Local, append-only, best-effort provenance for every write Studio
 * makes (Phase 18) — deliberately NOT a security control, unlike
 * `@agentform/planner`'s hash-verified `.afplan` files or
 * `@agentform/evaluator`'s tamper-evident test-results record: a JSONL
 * line is trivially editable by hand, and nothing here detects that.
 * This is operational visibility only — what changed, from where
 * (manual/genai/chat), and when — for a developer reviewing their own
 * history. Lives under `.agentform/`, the same local/uncommitted-by-
 * convention directory the CLI's own state (`state.db`,
 * `test-results.json`) already uses; never checked into git, never a
 * shared team artifact. See ADR-0021.
 */
export function appendAuditEntry(
  rootDir: string,
  fs: FileSystem,
  fileWriter: FileWriter,
  entry: { readonly source: ChangeSource; readonly summary: string; readonly target: AuditTarget },
): AuditEntry {
  const stamped: AuditEntry = { ...entry, timestamp: new Date().toISOString() };
  const absolutePath = resolvePathWithinRoot(rootDir, AUDIT_LOG_RELATIVE_PATH);
  const existing = fs.exists(absolutePath) ? fs.readFile(absolutePath) : '';
  fileWriter.writeFile(absolutePath, `${existing}${JSON.stringify(stamped)}\n`);
  return stamped;
}

/** Newest first — matches every other history listing in this codebase (apply history, backups). Returns `[]`, not an error, when nothing has ever been written yet. */
export function readAuditLog(
  rootDir: string,
  fs: FileSystem,
  limit?: number,
): readonly AuditEntry[] {
  const absolutePath = resolvePathWithinRoot(rootDir, AUDIT_LOG_RELATIVE_PATH);
  if (!fs.exists(absolutePath)) {
    return [];
  }
  const entries = fs
    .readFile(absolutePath)
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as AuditEntry)
    .reverse();
  return limit === undefined ? entries : entries.slice(0, limit);
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
