import { describe, expect, it } from 'vitest';
import { af015GeneratedCodeMustBeReproducible } from './af015-generated-code-must-be-reproducible.js';
import { withApplication } from '../test-fixtures.js';
import type { PolicyContext } from '../types.js';

describe('AF015 generated-code-must-be-reproducible', () => {
  it('is registered as mandatory so it cannot be silently disabled ahead of Phase 8', () => {
    expect(af015GeneratedCodeMustBeReproducible.mandatory).toBe(true);
  });

  it('always passes today, since there is no compiler yet to check', () => {
    const context: PolicyContext = { application: withApplication(() => {}) };
    expect(af015GeneratedCodeMustBeReproducible.check(context)).toEqual([]);
  });
});
