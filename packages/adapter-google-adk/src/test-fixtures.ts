import { buildIR, type AgentformIR } from '@agentform/ir';

/** Mirrors every other adapter's `test-fixtures.ts` convention: build through the real `buildIR` so a fixture that drifts from the schema fails the test that uses it. */
export function baseIR(): AgentformIR {
  const result = buildIR({
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: { name: 'fixture-app', version: '1.0.0' },
    spec: {
      runtime: { target: 'google-adk', environment: 'development' },
      models: { primary: { provider: 'google', model: 'gemini-flash-latest' } },
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

/**
 * A richer fixture exercising delegation and a non-Google model provider: two
 * agents (one delegating to the other), a tool, and a terminate node.
 */
export function multiAgentIR(): AgentformIR {
  const result = buildIR({
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: { name: 'multi-agent-fixture', version: '1.0.0' },
    spec: {
      runtime: { target: 'google-adk', environment: 'production' },
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
            done: { type: 'terminate' },
          },
          edges: [
            { from: 'intake', to: 'research' },
            { from: 'research', to: 'done' },
          ],
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

/** A `humanApproval`-type workflow node has no ADK generator (tool-level confirmation exists, but not a node-level equivalent) — used to exercise the "unsupported node type" branch of `validateGoogleAdkCompatibility`. */
export function unsupportedNodeIR(): AgentformIR {
  const result = buildIR({
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: { name: 'unsupported-node-fixture', version: '1.0.0' },
    spec: {
      runtime: { target: 'google-adk', environment: 'development' },
      models: { primary: { provider: 'google', model: 'gemini-flash-latest' } },
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
          nodes: {
            assistant: { type: 'agent', agent: 'assistant' },
            approve: { type: 'humanApproval' },
          },
          edges: [{ from: 'assistant', to: 'approve' }],
        },
      },
    },
  });
  if (!result.ir) {
    throw new Error(
      `unsupportedNodeIR() fixture failed to build: ${JSON.stringify(result.diagnostics)}`,
    );
  }
  return result.ir;
}

/** Two different agents both name the same target as an allowed delegate — a real ADK ValidationError case (single-parent sub_agents tree), used to exercise `findSharedDelegationTargets`. */
export function sharedDelegationTargetIR(): AgentformIR {
  const result = buildIR({
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: { name: 'shared-delegation-fixture', version: '1.0.0' },
    spec: {
      runtime: { target: 'google-adk', environment: 'development' },
      models: { primary: { provider: 'google', model: 'gemini-flash-latest' } },
      agents: {
        'parent-a': {
          model: 'primary',
          role: 'parent-a',
          instructions: { text: 'Parent A.' },
          delegation: { allowedAgents: ['specialist'] },
        },
        'parent-b': {
          model: 'primary',
          role: 'parent-b',
          instructions: { text: 'Parent B.' },
          delegation: { allowedAgents: ['specialist'] },
        },
        specialist: {
          model: 'primary',
          role: 'specialist',
          instructions: { text: 'The shared specialist.' },
        },
      },
      workflows: {
        main: {
          entrypoint: 'parent-a',
          nodes: {
            'parent-a': { type: 'agent', agent: 'parent-a' },
            'parent-b': { type: 'agent', agent: 'parent-b' },
            done: { type: 'terminate' },
          },
          edges: [
            { from: 'parent-a', to: 'parent-b' },
            { from: 'parent-b', to: 'done' },
          ],
        },
      },
    },
  });
  if (!result.ir) {
    throw new Error(
      `sharedDelegationTargetIR() fixture failed to build: ${JSON.stringify(result.diagnostics)}`,
    );
  }
  return result.ir;
}
