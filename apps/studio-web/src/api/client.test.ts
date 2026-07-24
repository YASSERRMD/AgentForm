import { afterEach, describe, expect, it, vi } from 'vitest';
import { getHealth, getSpec } from './client';

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
});
