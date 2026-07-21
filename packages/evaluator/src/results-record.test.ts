import { describe, expect, it } from 'vitest';
import {
  createTestResultsRecord,
  parseTestResultsRecord,
  serializeTestResultsRecord,
} from './results-record.js';

const SAMPLE = {
  ranAt: '2026-01-01T00:00:00.000Z',
  irHash: 'sha256:abc123',
  success: true,
  totalTests: 5,
  passedTests: 5,
};

describe('createTestResultsRecord / parseTestResultsRecord round trip', () => {
  it('a freshly created record verifies successfully', () => {
    const record = createTestResultsRecord(SAMPLE);
    const result = parseTestResultsRecord(serializeTestResultsRecord(record));
    expect(result.valid).toBe(true);
    expect(result.record?.irHash).toBe(SAMPLE.irHash);
  });

  it('rejects a record whose fields were edited after hashing (tampered)', () => {
    const record = createTestResultsRecord(SAMPLE);
    const serialized = serializeTestResultsRecord(record);
    const tampered = serialized.replace('"success": true', '"success": false');

    const result = parseTestResultsRecord(tampered);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('tampered');
  });

  it('rejects a record whose recorded hash was edited to match tampered content', () => {
    const record = createTestResultsRecord(SAMPLE);
    const serialized = serializeTestResultsRecord(record);
    const tampered = serialized.replace(record.contentHash, 'sha256:0000000000000000');

    expect(parseTestResultsRecord(tampered).valid).toBe(false);
  });

  it('rejects malformed JSON', () => {
    const result = parseTestResultsRecord('{not valid json');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('JSON');
  });

  it('rejects valid JSON that does not match the record shape', () => {
    const result = parseTestResultsRecord(JSON.stringify({ hello: 'world' }));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('shape');
  });

  it('produces a different hash when irHash differs, even with identical results', () => {
    const a = createTestResultsRecord(SAMPLE);
    const b = createTestResultsRecord({ ...SAMPLE, irHash: 'sha256:def456' });
    expect(a.contentHash).not.toBe(b.contentHash);
  });

  it('produces the same hash for identical input', () => {
    const a = createTestResultsRecord(SAMPLE);
    const b = createTestResultsRecord(SAMPLE);
    expect(a.contentHash).toBe(b.contentHash);
  });
});
