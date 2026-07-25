import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';

describe('GET /api/form-schemas', () => {
  it('returns a real JSON Schema for every resource type', async () => {
    const app = buildApp({ rootDir: '/project' });

    const response = await app.inject({ method: 'GET', url: '/api/form-schemas' });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, { resourceType: string; jsonSchema: unknown }>;
    expect(body.models?.resourceType).toBe('models');
    expect(body.agents?.resourceType).toBe('agents');
    expect(body.tools?.resourceType).toBe('tools');
    expect(body.workflows?.resourceType).toBe('workflows');
  });
});
