import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

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

  it('falls back to "anthropic" for an unrecognized value, rather than throwing', () => {
    expect(loadConfig({ AGENTFORM_STUDIO_GENAI_PROVIDER: 'bogus' }).genaiProviderName).toBe(
      'anthropic',
    );
  });

  it('defaults rootDir, port, and devOrigin when unset', () => {
    const config = loadConfig({});
    expect(config.rootDir).toBe(process.cwd());
    expect(config.port).toBe(4310);
    expect(config.devOrigin).toBe('http://localhost:5173');
  });
});
