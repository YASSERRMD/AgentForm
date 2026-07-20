import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME, PACKAGE_VERSION } from './index.js';

describe('@agentform/test-utils', () => {
  it('exposes its package identity', () => {
    expect(PACKAGE_NAME).toBe('@agentform/test-utils');
    expect(PACKAGE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
