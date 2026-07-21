import { describe, expect, it } from 'vitest';
import { checkEvaluationGateStatus } from './gate-status.js';
import {
  createTestResultsRecord,
  parseTestResultsRecord,
  serializeTestResultsRecord,
} from './results-record.js';

const CURRENT_IR_HASH = 'sha256:current-ir';

describe('checkEvaluationGateStatus', () => {
  it('reports never-run when no results file exists', () => {
    expect(checkEvaluationGateStatus(CURRENT_IR_HASH, undefined)).toEqual({ kind: 'never-run' });
  });

  it('reports never-run when the results file is invalid (malformed or tampered)', () => {
    const invalid = parseTestResultsRecord('{not valid json');
    expect(checkEvaluationGateStatus(CURRENT_IR_HASH, invalid)).toEqual({ kind: 'never-run' });
  });

  it('reports stale when the recorded irHash does not match the current specification', () => {
    const record = createTestResultsRecord({
      ranAt: '2026-01-01T00:00:00.000Z',
      irHash: 'sha256:an-earlier-ir',
      success: true,
      totalTests: 3,
      passedTests: 3,
    });
    const parsed = parseTestResultsRecord(serializeTestResultsRecord(record));
    expect(checkEvaluationGateStatus(CURRENT_IR_HASH, parsed)).toEqual({
      kind: 'stale',
      lastRanIrHash: 'sha256:an-earlier-ir',
      currentIrHash: CURRENT_IR_HASH,
    });
  });

  it('reports failed when the recorded run matches the current IR but did not succeed', () => {
    const record = createTestResultsRecord({
      ranAt: '2026-01-01T00:00:00.000Z',
      irHash: CURRENT_IR_HASH,
      success: false,
      totalTests: 3,
      passedTests: 1,
    });
    const parsed = parseTestResultsRecord(serializeTestResultsRecord(record));
    const status = checkEvaluationGateStatus(CURRENT_IR_HASH, parsed);
    expect(status.kind).toBe('failed');
    expect(status.kind === 'failed' && status.record.passedTests).toBe(1);
  });

  it('reports passed when the recorded run matches the current IR and succeeded', () => {
    const record = createTestResultsRecord({
      ranAt: '2026-01-01T00:00:00.000Z',
      irHash: CURRENT_IR_HASH,
      success: true,
      totalTests: 3,
      passedTests: 3,
    });
    const parsed = parseTestResultsRecord(serializeTestResultsRecord(record));
    const status = checkEvaluationGateStatus(CURRENT_IR_HASH, parsed);
    expect(status.kind).toBe('passed');
    expect(status.kind === 'passed' && status.record.passedTests).toBe(3);
  });
});
