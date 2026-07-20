import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME, PACKAGE_VERSION } from './index.js';

describe('@agentform/plugin-sdk', () => {
  it('exposes its package identity', () => {
    expect(PACKAGE_NAME).toBe('@agentform/plugin-sdk');
    expect(PACKAGE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
