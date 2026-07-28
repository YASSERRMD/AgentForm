import { createInMemoryFileSystem } from '@agentform/parser';
import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';

const VALID_SPEC = {
  apiVersion: 'agentform.dev/v1alpha1',
  kind: 'AgenticApplication',
  metadata: { name: 'app-test-fixture', version: '1.0.0' },
  spec: {
    runtime: { target: 'openai', environment: 'development' },
    models: { primary: { provider: 'openai', model: 'gpt-5' } },
    agents: {
      assistant: { model: 'primary', role: 'assistant', instructions: { text: 'Be helpful.' } },
    },
    workflows: {
      main: {
        entrypoint: 'assistant',
        nodes: { assistant: { type: 'agent', agent: 'assistant' } },
      },
    },
  },
};

function fixtureFs() {
  return createInMemoryFileSystem({ '/project/agentform.json': JSON.stringify(VALID_SPEC) });
}

describe('buildApp — auth', () => {
  it('leaves every route reachable with no token configured (regression guard)', async () => {
    const app = buildApp({ rootDir: '/project', fs: fixtureFs() });

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
  });

  it('401s a request with no Authorization header when a token is configured', async () => {
    const app = buildApp({ rootDir: '/project', fs: fixtureFs(), authToken: 'a-real-token' });

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(401);
  });

  it('401s a request carrying the wrong token', async () => {
    const app = buildApp({ rootDir: '/project', fs: fixtureFs(), authToken: 'a-real-token' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { authorization: 'Bearer wrong-token' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('succeeds with the correct token in the Authorization header', async () => {
    const app = buildApp({ rootDir: '/project', fs: fixtureFs(), authToken: 'a-real-token' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { authorization: 'Bearer a-real-token' },
    });

    expect(response.statusCode).toBe(200);
  });

  it('succeeds with the correct token via the ?token= query param (bootstrap-only fallback)', async () => {
    const app = buildApp({ rootDir: '/project', fs: fixtureFs(), authToken: 'a-real-token' });

    const response = await app.inject({ method: 'GET', url: '/api/health?token=a-real-token' });

    expect(response.statusCode).toBe(200);
  });

  it('401s GET /api/health specifically — no per-route exemption, since it leaks rootDir', async () => {
    const app = buildApp({ rootDir: '/project', fs: fixtureFs(), authToken: 'a-real-token' });

    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).not.toHaveProperty('rootDir');
  });

  /**
   * The one test this whole mechanism's correctness actually depends on:
   * the auth hook is registered *after* CORS (see app.ts), so a
   * preflight — which carries no Authorization header by browser design
   * — must be resolved by CORS's own earlier-registered hook before it
   * ever reaches the auth hook. If registration order were reversed,
   * this would 401 instead, breaking every cross-origin request the
   * moment a token is configured.
   */
  it('lets a CORS preflight (OPTIONS) succeed with no token, even when a token is configured', async () => {
    const app = buildApp({
      rootDir: '/project',
      fs: fixtureFs(),
      devOrigin: 'http://localhost:5173',
      authToken: 'a-real-token',
    });

    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/health',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'GET',
      },
    });

    expect(response.statusCode).toBeLessThan(300);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('a real GET still requires the token even when CORS is also configured', async () => {
    const app = buildApp({
      rootDir: '/project',
      fs: fixtureFs(),
      devOrigin: 'http://localhost:5173',
      authToken: 'a-real-token',
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'http://localhost:5173' },
    });

    expect(response.statusCode).toBe(401);
  });
});
