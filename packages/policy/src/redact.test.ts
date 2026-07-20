import { describe, expect, it } from 'vitest';
import { redactSecretValue } from './redact.js';

describe('redactSecretValue', () => {
  it('fully masks a short value', () => {
    expect(redactSecretValue('abcd')).toBe('****');
    expect(redactSecretValue('ab')).toBe('**');
  });

  it('keeps only the first and last two characters of a longer value', () => {
    const result = redactSecretValue('sk-abcdefghijklmnopqrstuvwxyz');
    expect(result.startsWith('sk')).toBe(true);
    expect(result.endsWith('yz')).toBe(true);
    expect(result).not.toContain('abcdefghijklmnopqrstuvwxyz'.slice(2, -2));
  });

  it('never returns the original value for a realistic secret length', () => {
    const secret = 'AKIAIOSFODNN7EXAMPLE';
    expect(redactSecretValue(secret)).not.toBe(secret);
    expect(redactSecretValue(secret)).not.toContain(secret.slice(4, -4));
  });

  it('caps the masked middle section length rather than growing unboundedly', () => {
    const long = 'x'.repeat(500);
    expect(redactSecretValue(long).length).toBeLessThan(20);
  });
});
