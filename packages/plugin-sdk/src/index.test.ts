import { describe, expect, it } from 'vitest';
import type { AgentformIR } from '@agentform/ir';
import { PACKAGE_NAME, PACKAGE_VERSION, type FrameworkAdapter } from './index.js';

describe('@agentform/plugin-sdk', () => {
  it('exposes its package identity', () => {
    expect(PACKAGE_NAME).toBe('@agentform/plugin-sdk');
    expect(PACKAGE_VERSION).toBe('0.1.0');
  });

  it('FrameworkAdapter is implementable with only the required members', async () => {
    const adapter: FrameworkAdapter = {
      manifest: {
        name: 'test-adapter',
        version: '0.1.0',
        apiVersion: 'agentform.dev/v1alpha1',
        type: 'FrameworkAdapter',
        capabilities: [],
        supportedSpecVersions: ['v1alpha1'],
      },
      validateCompatibility: async () => ({
        target: 'test',
        entries: [],
        generatedDependencies: {},
        frameworkVersion: '0.0.0',
        runtimeRequirements: [],
        securityWarnings: [],
        hasBlockingIncompatibility: false,
      }),
      generate: async () => ({
        target: 'test',
        files: [],
        manifest: {
          generatedBy: 'agentform',
          agentformVersion: '0.1.0',
          specVersion: 'v1alpha1',
          adapter: 'test-adapter',
          adapterVersion: '0.1.0',
          sourceHash: 'sha256:0',
          irHash: 'sha256:0',
          generatedAt: null,
        },
      }),
    };

    const report = await adapter.validateCompatibility({} as AgentformIR, { outputDir: '.' });
    expect(report.hasBlockingIncompatibility).toBe(false);

    const project = await adapter.generate({} as AgentformIR, {
      outputDir: '.',
      agentformVersion: '0.1.0',
    });
    expect(project.manifest.generatedAt).toBeNull();
  });
});
