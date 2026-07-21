import { buildIR, type AgentformIR } from '@agentform/ir';

/** Mirrors every other package's `test-fixtures.ts` convention: build through the real `buildIR` so a fixture that drifts from the schema fails the test that uses it. One agent, one tool, and a `retry.maxAttempts` — enough surface for every assertion type this package evaluates. */
export function fixtureIR(): AgentformIR {
  const result = buildIR({
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: { name: 'evaluator-fixture', version: '1.0.0' },
    spec: {
      runtime: { target: 'openai', environment: 'development' },
      models: { primary: { provider: 'openai', model: 'gpt-5' } },
      tools: {
        'complaint-registry-search': {
          type: 'function',
          handler: 'search.ts#run',
          sideEffect: 'read',
        },
        'complaint-registry-create': {
          type: 'function',
          handler: 'create.ts#run',
          sideEffect: 'write',
          permissions: ['complaints:write'],
        },
      },
      agents: {
        intake: {
          model: 'primary',
          role: 'intake',
          instructions: { text: 'Check for duplicates before creating a complaint.' },
          tools: ['complaint-registry-search', 'complaint-registry-create'],
          retry: { maxAttempts: 2 },
        },
      },
      workflows: {
        main: {
          entrypoint: 'intake',
          nodes: {
            intake: { type: 'agent', agent: 'intake' },
            done: { type: 'terminate', reason: 'duplicate-found' },
          },
          edges: [{ from: 'intake', to: 'done' }],
        },
      },
    },
  });
  if (!result.ir) {
    throw new Error(`fixtureIR() fixture failed to build: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.ir;
}
