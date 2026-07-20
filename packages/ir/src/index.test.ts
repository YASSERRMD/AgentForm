import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME, PACKAGE_VERSION } from './index.js';

describe('@agentform/ir', () => {
  it('exposes its package identity', () => {
    expect(PACKAGE_NAME).toBe('@agentform/ir');
    expect(PACKAGE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
