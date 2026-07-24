import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';

describe('GET /api/health', () => {
  it('returns ok status and the served root directory', async () => {
    const app = buildApp({ rootDir: '/project' });

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', rootDir: '/project' });
  });
});
