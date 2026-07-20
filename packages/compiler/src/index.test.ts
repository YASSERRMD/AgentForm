import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME, PACKAGE_VERSION } from './index.js';

describe('@agentform/compiler', () => {
  it('exposes its package identity', () => {
    expect(PACKAGE_NAME).toBe('@agentform/compiler');
    expect(PACKAGE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
