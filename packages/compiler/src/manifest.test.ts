import { describe, expect, it } from 'vitest';
import { buildManifest } from './manifest.js';

describe('buildManifest', () => {
  it('builds the §22 manifest shape', () => {
    const manifest = buildManifest({
      adapter: {
        name: '@agentform/adapter-langgraph',
        version: '0.1.0',
        apiVersion: 'agentform.dev/v1alpha1',
        type: 'FrameworkAdapter',
        capabilities: [],
        supportedSpecVersions: ['v1alpha1'],
      },
      agentformVersion: '0.1.0',
      specVersion: 'v1alpha1',
      sourceHash: 'sha256:aaaa',
      irHash: 'sha256:bbbb',
    });

    expect(manifest).toEqual({
      generatedBy: 'agentform',
      agentformVersion: '0.1.0',
      specVersion: 'v1alpha1',
      adapter: '@agentform/adapter-langgraph',
      adapterVersion: '0.1.0',
      sourceHash: 'sha256:aaaa',
      irHash: 'sha256:bbbb',
      generatedAt: null,
    });
  });

  it('always sets generatedAt to null, never a real timestamp', () => {
    const manifest = buildManifest({
      adapter: {
        name: 'x',
        version: '1.0.0',
        apiVersion: 'v1',
        type: 'FrameworkAdapter',
        capabilities: [],
        supportedSpecVersions: [],
      },
      agentformVersion: '0.1.0',
      specVersion: 'v1alpha1',
      sourceHash: 'sha256:a',
      irHash: 'sha256:b',
    });
    expect(manifest.generatedAt).toBeNull();
  });
});
