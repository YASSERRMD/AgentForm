import { describe, expect, it } from 'vitest';
import { redactSecretsFromReport } from './report-redaction.js';

describe('redactSecretsFromReport', () => {
  it('redacts an OpenAI-style secret key embedded in a larger string, keeping only a masked hint', () => {
    const input = 'PASS  calls the api (main)\n      apiKey: sk-abcdefghijklmnopqrstuvwx\n';
    const output = redactSecretsFromReport(input);
    expect(output).not.toContain('sk-abcdefghijklmnopqrstuvwx');
    expect(output).toContain('PASS  calls the api (main)');
    expect(output).toMatch(/apiKey: sk\*+wx/);
  });

  it('redacts an AWS access key ID', () => {
    const output = redactSecretsFromReport('accessKeyId: AKIAABCDEFGHIJKLMNOP');
    expect(output).not.toContain('AKIAABCDEFGHIJKLMNOP');
  });

  it('redacts every occurrence, not just the first, and across multiple patterns', () => {
    const input = [
      'first: sk-abcdefghijklmnopqrstuvwx',
      'second: sk-zyxwvutsrqponmlkjihgfedc',
      'token: ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    ].join('\n');
    const output = redactSecretsFromReport(input);
    expect(output).not.toContain('sk-abcdefghijklmnopqrstuvwx');
    expect(output).not.toContain('sk-zyxwvutsrqponmlkjihgfedc');
    expect(output).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz0123456789');
  });

  it('leaves ordinary report text untouched', () => {
    const input = '2 passed, 1 failed (3 total)\n{"name":"reaches the terminal node"}';
    expect(redactSecretsFromReport(input)).toBe(input);
  });

  it('is safe to run on already-redacted text (idempotent)', () => {
    const once = redactSecretsFromReport('sk-abcdefghijklmnopqrstuvwx');
    expect(redactSecretsFromReport(once)).toBe(once);
  });
});
