import { computeContentHash } from '@agentform/ir';

export const TEST_RESULTS_FORMAT_VERSION = '1';

/**
 * The persisted `.agentform/test-results.json` shape — mirrors
 * `@agentform/planner`'s `.afplan` `PlanFile` design exactly (a tamper-evident
 * content hash over everything else in the record), so a stale or edited
 * results file is detectable the same way a stale or edited plan file is.
 * `irHash` (the IR's own `contentHash` at the moment tests ran) is what
 * lets a reader — starting with `agentform plan` — tell "tests passed for
 * the specification as it exists right now" apart from "tests passed for
 * some earlier version of the specification". File I/O is deliberately
 * not this package's job, matching `@agentform/planner`'s own plan-file
 * functions — the CLI reads/writes the file and calls these pure
 * functions.
 */
export interface TestResultsRecord {
  readonly formatVersion: string;
  readonly ranAt: string;
  readonly irHash: string;
  readonly success: boolean;
  readonly totalTests: number;
  readonly passedTests: number;
  readonly contentHash: string;
}

interface TestResultsRecordInput {
  readonly ranAt: string;
  readonly irHash: string;
  readonly success: boolean;
  readonly totalTests: number;
  readonly passedTests: number;
}

function computeResultsHash(record: { formatVersion: string } & TestResultsRecordInput): string {
  return computeContentHash(record);
}

export function createTestResultsRecord(input: TestResultsRecordInput): TestResultsRecord {
  const base = { formatVersion: TEST_RESULTS_FORMAT_VERSION, ...input };
  return { ...base, contentHash: computeResultsHash(base) };
}

export function serializeTestResultsRecord(record: TestResultsRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

function isTestResultsRecordShape(value: unknown): value is TestResultsRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.formatVersion === 'string' &&
    typeof record.ranAt === 'string' &&
    typeof record.irHash === 'string' &&
    typeof record.success === 'boolean' &&
    typeof record.totalTests === 'number' &&
    typeof record.passedTests === 'number' &&
    typeof record.contentHash === 'string'
  );
}

export interface TestResultsVerificationResult {
  readonly valid: boolean;
  readonly record?: TestResultsRecord;
  readonly error?: string;
}

/** Parses and verifies a serialized results record — never throws; a malformed or tampered file comes back as `{ valid: false, error }`, mirroring `verifyPlanFile`'s validation-result-not-exception convention for an expected negative outcome. */
export function parseTestResultsRecord(serialized: string): TestResultsVerificationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return { valid: false, error: 'test results file is not valid JSON' };
  }

  if (!isTestResultsRecordShape(parsed)) {
    return { valid: false, error: 'test results file does not match the expected shape' };
  }

  const { contentHash, ...rest } = parsed;
  const expectedHash = computeResultsHash(rest);
  if (expectedHash !== contentHash) {
    return {
      valid: false,
      error:
        'test results content hash does not match its recorded hash — it may have been tampered with',
      record: parsed,
    };
  }

  return { valid: true, record: parsed };
}
