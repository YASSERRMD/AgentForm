import { afterEach, describe, expect, it, vi } from 'vitest';
import { getFormSchemas, getHealth, getSpec, patchSpec } from './client';

describe('client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getHealth() fetches /api/health and returns the parsed JSON', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', rootDir: '/project' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await getHealth();

    expect(mockFetch).toHaveBeenCalledWith('/api/health');
    expect(result).toEqual({ status: 'ok', rootDir: '/project' });
  });

  it('getSpec() fetches /api/spec and returns the parsed JSON', async () => {
    const body = { diagnostics: [] };
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => body });
    vi.stubGlobal('fetch', mockFetch);

    const result = await getSpec();

    expect(mockFetch).toHaveBeenCalledWith('/api/spec');
    expect(result).toEqual(body);
  });

  it('throws when the response is not ok', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    vi.stubGlobal('fetch', mockFetch);

    await expect(getSpec()).rejects.toThrow('500');
  });

  it('getFormSchemas() fetches /api/form-schemas and returns the parsed JSON', async () => {
    const body = { models: { resourceType: 'models', jsonSchema: {} } };
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => body });
    vi.stubGlobal('fetch', mockFetch);

    const result = await getFormSchemas();

    expect(mockFetch).toHaveBeenCalledWith('/api/form-schemas');
    expect(result).toEqual(body);
  });

  it('patchSpec() posts the patch as a JSON body and returns the parsed response', async () => {
    const body = { success: true, diagnostics: [] };
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => body });
    vi.stubGlobal('fetch', mockFetch);
    const patch = [{ op: 'replace' as const, path: ['metadata', 'version'], value: '2.0.0' }];

    const result = await patchSpec(patch);

    expect(mockFetch).toHaveBeenCalledWith('/api/spec/patch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patch }),
    });
    expect(result).toEqual(body);
  });

  it('patchSpec() throws on a malformed-request 400, not just non-2xx in general', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 400, json: async () => ({}) });
    vi.stubGlobal('fetch', mockFetch);

    await expect(patchSpec([])).rejects.toThrow('400');
  });
});
