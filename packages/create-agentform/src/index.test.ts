import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME, PACKAGE_VERSION } from './index.js';

describe('@agentform/create-agentform', () => {
  it('exposes its package identity', () => {
    expect(PACKAGE_NAME).toBe('@agentform/create-agentform');
    expect(PACKAGE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
