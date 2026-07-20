import { buildIR, type AgentformIR } from '@agentform/ir';
import type {
  CompatibilityReport,
  FrameworkAdapter,
  GeneratedProject,
} from '@agentform/plugin-sdk';

/** Mirrors `@agentform/planner`/`@agentform/ir`'s own `test-fixtures.ts` convention: build through the real `buildIR` so a fixture that drifts from the schema fails the test that uses it. */
export function baseIR(): AgentformIR {
  const result = buildIR({
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: { name: 'fixture-app', version: '1.0.0' },
    spec: {
      runtime: { target: 'openai', environment: 'development' },
      models: { primary: { provider: 'openai', model: 'gpt-5' } },
      agents: {
        assistant: {
          model: 'primary',
          role: 'assistant',
          instructions: { text: 'You are a helpful assistant.' },
        },
      },
      workflows: {
        main: {
          entrypoint: 'assistant',
          nodes: { assistant: { type: 'agent', agent: 'assistant' } },
        },
      },
    },
  });
  if (!result.ir) {
    throw new Error(`baseIR() fixture failed to build: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.ir;
}

export interface FakeAdapterOptions {
  readonly compatibilityReport?: Partial<CompatibilityReport>;
  readonly generatedProject?: Partial<GeneratedProject>;
}

/** A minimal in-memory `FrameworkAdapter` for exercising `@agentform/compiler`'s orchestration without a real target framework. */
export function fakeAdapter(options: FakeAdapterOptions = {}): FrameworkAdapter {
  return {
    manifest: {
      name: '@agentform/adapter-fake',
      version: '0.1.0',
      apiVersion: 'agentform.dev/v1alpha1',
      type: 'FrameworkAdapter',
      capabilities: [],
      supportedSpecVersions: ['v1alpha1'],
    },
    validateCompatibility: async () => ({
      target: 'fake',
      entries: [],
      generatedDependencies: {},
      frameworkVersion: '0.0.0',
      runtimeRequirements: [],
      securityWarnings: [],
      hasBlockingIncompatibility: false,
      ...options.compatibilityReport,
    }),
    generate: async () => ({
      target: 'fake',
      files: [{ path: 'src/index.ts', content: 'export {};' }],
      manifest: {
        generatedBy: 'agentform',
        agentformVersion: '0.1.0',
        specVersion: 'v1alpha1',
        adapter: '@agentform/adapter-fake',
        adapterVersion: '0.1.0',
        sourceHash: 'sha256:a',
        irHash: 'sha256:b',
        generatedAt: null,
      },
      ...options.generatedProject,
    }),
  };
}
