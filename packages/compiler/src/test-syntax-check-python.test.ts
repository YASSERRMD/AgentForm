import { describe, expect, it } from 'vitest';
import { isSyntacticallyValidPython } from './test-syntax-check-python.js';

describe('isSyntacticallyValidPython', () => {
  it('accepts valid Python source', () => {
    expect(isSyntacticallyValidPython('def f(x: int) -> int:\n    return x + 1\n')).toBe(true);
  });

  it('rejects invalid Python source', () => {
    expect(isSyntacticallyValidPython('def f(x: int) -> int\n    return x + 1\n')).toBe(false);
  });

  it('accepts an empty string as a valid (empty) module', () => {
    expect(isSyntacticallyValidPython('')).toBe(true);
  });
});
