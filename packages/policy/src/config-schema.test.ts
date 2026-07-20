import { describe, expect, it } from 'vitest';
import { validatePolicyEngineConfig } from './config-schema.js';

describe('validatePolicyEngineConfig', () => {
  it('accepts an empty object (no overrides)', () => {
    const result = validatePolicyEngineConfig({});
    expect(result.success).toBe(true);
    expect(result.data).toEqual({});
    expect(result.diagnostics).toEqual([]);
  });

  it('accepts a well-formed overrides map', () => {
    const result = validatePolicyEngineConfig({
      overrides: {
        AF006: { severity: 'warning' },
        AF012: { severity: 'skip', justification: 'no outbound HTTP tools in this project' },
      },
    });
    expect(result.success).toBe(true);
    expect(result.data?.overrides?.AF006).toEqual({ severity: 'warning' });
  });

  it('rejects an override with an invalid severity value', () => {
    const result = validatePolicyEngineConfig({
      overrides: { AF006: { severity: 'off' } },
    });
    expect(result.success).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('AGF4004');
    expect(result.diagnostics[0]?.path).toEqual(['overrides', 'AF006', 'severity']);
  });

  it('rejects an unrecognized top-level key', () => {
    const result = validatePolicyEngineConfig({ disablePolicies: true });
    expect(result.success).toBe(false);
    expect(result.diagnostics[0]?.code).toBe('AGF4004');
  });

  it('rejects a blank justification string', () => {
    const result = validatePolicyEngineConfig({
      overrides: { AF006: { severity: 'skip', justification: '' } },
    });
    expect(result.success).toBe(false);
  });
});
