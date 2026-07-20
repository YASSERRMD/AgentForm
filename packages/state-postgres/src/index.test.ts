import { describe, expect, it } from 'vitest';
import { PACKAGE_NAME, PACKAGE_VERSION } from './index.js';

describe('@agentform/state-postgres', () => {
  it('exposes its package identity', () => {
    expect(PACKAGE_NAME).toBe('@agentform/state-postgres');
    expect(PACKAGE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
