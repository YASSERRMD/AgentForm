import { buildIR, type AgentformIR } from '@agentform/ir';

/** Mirrors `@agentform/planner`/`@agentform/compiler`'s own `test-fixtures.ts` convention: build through the real `buildIR` so a fixture that drifts from the schema fails the test that uses it. */
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

/** A richer fixture: two agents (one delegating to the other), a tool, a guardrail, structured output — exercises every branch the generators handle. */
export function multiAgentIR(): AgentformIR {
  const result = buildIR({
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: { name: 'multi-agent-fixture', version: '1.0.0' },
    spec: {
      runtime: { target: 'openai', environment: 'production' },
      models: {
        primary: { provider: 'openai', model: 'gpt-5', temperature: 0.2, maxTokens: 2048 },
      },
      tools: {
        'search-registry': {
          type: 'function',
          handler: 'search.ts#run',
          sideEffect: 'read',
          inputSchema: {
            type: 'object',
            properties: { query: { type: 'string' } },
            required: ['query'],
          },
        },
      },
      agents: {
        intake: {
          model: 'primary',
          role: 'intake',
          description: 'Handles the first pass over an incoming request.',
          instructions: { text: 'Triage the request and hand off to research when needed.' },
          tools: ['search-registry'],
          delegation: { allowedAgents: ['research-specialist'] },
          guardrails: ['no-pii'],
          outputSchema: {
            type: 'object',
            properties: { summary: { type: 'string' } },
            required: ['summary'],
          },
        },
        'research-specialist': {
          model: 'primary',
          role: 'researcher',
          instructions: { text: 'Research the topic thoroughly.' },
        },
      },
      workflows: {
        main: {
          entrypoint: 'intake',
          nodes: {
            intake: { type: 'agent', agent: 'intake' },
            research: { type: 'agent', agent: 'research-specialist' },
          },
          edges: [{ from: 'intake', to: 'research' }],
        },
      },
    },
  });
  if (!result.ir) {
    throw new Error(
      `multiAgentIR() fixture failed to build: ${JSON.stringify(result.diagnostics)}`,
    );
  }
  return result.ir;
}
