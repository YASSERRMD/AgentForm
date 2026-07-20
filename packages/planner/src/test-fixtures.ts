import { buildIR, type AgentformIR } from '@agentform/ir';

/**
 * A minimal, schema-valid application built all the way to a real
 * `AgentformIR` via the real `buildIR` — mirrors `@agentform/ir`'s own
 * `test-fixtures.ts` convention. Building through the real pipeline means
 * a fixture that drifts out of sync with the schema fails the test that
 * uses it, instead of silently asserting past a shape mismatch.
 */
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
