import { computeContentHash } from '@agentform/ir';
import type { PlanItem } from './types.js';

export const PLAN_FILE_FORMAT_VERSION = '1';

/** The `.afplan` file shape (§9 "Plan files must be tamper-evident using hashes"). `contentHash` covers `formatVersion`/`createdAt`/`items` — anything editing the file without recomputing it is detected by `verifyPlanFile`. File I/O is deliberately not this package's job (mirrors `@agentform/policy`'s config schema staying fs-free) — the CLI reads/writes the file and calls these pure functions. */
export interface PlanFile {
  readonly formatVersion: string;
  readonly createdAt: string;
  readonly items: readonly PlanItem[];
  readonly contentHash: string;
}

function computePlanHash(formatVersion: string, createdAt: string, items: readonly PlanItem[]): string {
  return computeContentHash({ formatVersion, createdAt, items });
}

/** Builds a tamper-evident `PlanFile` from a set of plan items. */
export function createPlanFile(items: readonly PlanItem[], createdAt: string): PlanFile {
  return {
    formatVersion: PLAN_FILE_FORMAT_VERSION,
    createdAt,
    items,
    contentHash: computePlanHash(PLAN_FILE_FORMAT_VERSION, createdAt, items),
  };
}

export function serializePlanFile(planFile: PlanFile): string {
  return `${JSON.stringify(planFile, null, 2)}\n`;
}

function isPlanFileShape(value: unknown): value is PlanFile {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.formatVersion === 'string' &&
    typeof record.createdAt === 'string' &&
    typeof record.contentHash === 'string' &&
    Array.isArray(record.items)
  );
}

export interface PlanFileVerificationResult {
  readonly valid: boolean;
  readonly planFile?: PlanFile;
  readonly error?: string;
}

/**
 * Parses and verifies a serialized plan file: valid JSON, matching the
 * expected shape, and — the tamper-evidence check — its recomputed
 * content hash matches the hash recorded inside it. Never throws; a
 * malformed or tampered file comes back as `{ valid: false, error }`,
 * mirroring this codebase's established `{ success, diagnostics }`-style
 * validation results rather than exceptions for an expected negative
 * outcome.
 */
export function verifyPlanFile(serialized: string): PlanFileVerificationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return { valid: false, error: 'plan file is not valid JSON' };
  }

  if (!isPlanFileShape(parsed)) {
    return { valid: false, error: 'plan file does not match the expected shape' };
  }

  const expectedHash = computePlanHash(parsed.formatVersion, parsed.createdAt, parsed.items);
  if (expectedHash !== parsed.contentHash) {
    return {
      valid: false,
      error: 'plan file content hash does not match its recorded hash — it may have been tampered with',
      planFile: parsed,
    };
  }

  return { valid: true, planFile: parsed };
}
