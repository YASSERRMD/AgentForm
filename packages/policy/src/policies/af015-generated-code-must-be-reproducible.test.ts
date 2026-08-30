import { describe, expect, it } from 'vitest';
import { af015GeneratedCodeMustBeReproducible } from './af015-generated-code-must-be-reproducible.js';
import { withApplication } from '../test-fixtures.js';
import type { PolicyContext } from '../types.js';

describe('AF015 generated-code-must-be-reproducible', () => {
  it('is registered as mandatory so it cannot be silently disabled', () => {
    expect(af015GeneratedCodeMustBeReproducible.mandatory).toBe(true);
  });

  it('always passes: no generated artifact exists at policy-evaluation time', () => {
    const context: PolicyContext = { application: withApplication(() => {}) };
    expect(af015GeneratedCodeMustBeReproducible.check(context)).toEqual([]);
  });

  it('says in its own description that it is not enforced here', () => {
    expect(af015GeneratedCodeMustBeReproducible.description).toContain('Not enforced');
  });
});
