import { describe, expect, it } from 'vitest';
import { evaluatePolicies } from '../evaluate.js';
import { baseApplication } from '../test-fixtures.js';
import { BUILTIN_POLICIES } from './index.js';

describe('BUILTIN_POLICIES', () => {
  it('registers exactly AF001 through AF015, each once', () => {
    const ids = BUILTIN_POLICIES.map((policy) => policy.id).sort();
    const expected = Array.from({ length: 15 }, (_, i) => `AF${String(i + 1).padStart(3, '0')}`);
    expect(ids).toEqual(expected);
  });

  it('every policy declares a non-empty name and description', () => {
    for (const policy of BUILTIN_POLICIES) {
      expect(policy.name.length).toBeGreaterThan(0);
      expect(policy.description.length).toBeGreaterThan(0);
    }
  });

  it('evaluates cleanly end-to-end against the minimal fixture application', () => {
    const { results, diagnostics } = evaluatePolicies(BUILTIN_POLICIES, {
      application: baseApplication(),
    });
    expect(diagnostics).toEqual([]);
    expect(results).toHaveLength(BUILTIN_POLICIES.length);
    expect(results.every((result) => result.status === 'pass')).toBe(true);
  });
});
