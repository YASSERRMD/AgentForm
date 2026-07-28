import { describe, expect, it, vi } from 'vitest';
import { loadConfig, StudioConfigError } from './config.js';

describe('loadConfig', () => {
  it('defaults genaiProviderName to "anthropic" when unset', () => {
    const config = loadConfig({});
    expect(config.genaiProviderName).toBe('anthropic');
  });

  it('selects "local-demo" only for that exact env value', () => {
    expect(loadConfig({ AGENTFORM_STUDIO_GENAI_PROVIDER: 'local-demo' }).genaiProviderName).toBe(
      'local-demo',
    );
  });

  it('throws StudioConfigError for an unrecognized value, rather than silently falling back', () => {
    expect(() => loadConfig({ AGENTFORM_STUDIO_GENAI_PROVIDER: 'bogus' })).toThrow(
      StudioConfigError,
    );
  });

  it('defaults rootDir, port, and devOrigin when unset', () => {
    const config = loadConfig({});
    expect(config.rootDir).toBe(process.cwd());
    expect(config.port).toBe(4310);
    expect(config.devOrigin).toBe('http://localhost:5173');
  });

  it('accepts a valid custom port', () => {
    expect(loadConfig({ AGENTFORM_STUDIO_PORT: '8080' }).port).toBe(8080);
  });

  it('throws StudioConfigError for a non-integer port', () => {
    expect(() => loadConfig({ AGENTFORM_STUDIO_PORT: 'abc' })).toThrow(StudioConfigError);
    expect(() => loadConfig({ AGENTFORM_STUDIO_PORT: '3.5' })).toThrow(StudioConfigError);
  });

  it('throws StudioConfigError for a port outside 1-65535', () => {
    expect(() => loadConfig({ AGENTFORM_STUDIO_PORT: '0' })).toThrow(StudioConfigError);
    expect(() => loadConfig({ AGENTFORM_STUDIO_PORT: '65536' })).toThrow(StudioConfigError);
    expect(() => loadConfig({ AGENTFORM_STUDIO_PORT: '-1' })).toThrow(StudioConfigError);
  });

  it('leaves authToken unset when AGENTFORM_STUDIO_TOKEN is absent', () => {
    expect(loadConfig({}).authToken).toBeUndefined();
  });

  it('treats a blank/whitespace-only AGENTFORM_STUDIO_TOKEN as unset', () => {
    expect(loadConfig({ AGENTFORM_STUDIO_TOKEN: '   ' }).authToken).toBeUndefined();
  });

  it('trims AGENTFORM_STUDIO_TOKEN', () => {
    expect(loadConfig({ AGENTFORM_STUDIO_TOKEN: '  a-real-token-value-here  ' }).authToken).toBe(
      'a-real-token-value-here',
    );
  });

  it('warns, but does not throw, for a token shorter than the recommended length', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const config = loadConfig({ AGENTFORM_STUDIO_TOKEN: 'short' });

    expect(config.authToken).toBe('short');
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });
});
