import { describe, expect, it } from 'vitest';
import { af014StateMustNotContainSecrets } from './af014-state-must-not-contain-secrets.js';
import { withApplication } from '../test-fixtures.js';
import type { PolicyContext } from '../types.js';

describe('AF014 state-must-not-contain-secrets', () => {
  it('is registered as mandatory so it cannot be silently disabled ahead of Phase 7', () => {
    expect(af014StateMustNotContainSecrets.mandatory).toBe(true);
  });

  it('always passes today, since there is no state engine yet to check', () => {
    const context: PolicyContext = { application: withApplication(() => {}) };
    expect(af014StateMustNotContainSecrets.check(context)).toEqual([]);
  });
});
