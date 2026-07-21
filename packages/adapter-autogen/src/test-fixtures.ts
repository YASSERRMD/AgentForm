import { buildIR, type AgentformIR } from '@agentform/ir';

/** Mirrors every other adapter's `test-fixtures.ts` convention: build through the real `buildIR` so a fixture that drifts from the schema fails the test that uses it. */
export function baseIR(): AgentformIR {
  const result = buildIR({
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: { name: 'fixture-app', version: '1.0.0' },
    spec: {
      runtime: { target: 'autogen', environment: 'development' },
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

/**
 * A richer fixture exercising every node type this adapter supports: two
 * agents (one delegating to the other), a tool, a human approval gate, and
 * a terminate node — enough to exercise team-building (multiple
 * participants) and UserProxyAgent generation.
 */
export function multiAgentIR(): AgentformIR {
  const result = buildIR({
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: { name: 'multi-agent-fixture', version: '1.0.0' },
    spec: {
      runtime: { target: 'autogen', environment: 'production' },
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
            approve: { type: 'humanApproval', approvers: ['ops-team'] },
            done: { type: 'terminate' },
          },
          edges: [
            { from: 'intake', to: 'research' },
            { from: 'research', to: 'approve' },
            { from: 'approve', to: 'done' },
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

/** A `tool`-type workflow node has no AutoGen generator — used to exercise the "unsupported node type" branch of `validateAutoGenCompatibility`. */
export function unsupportedNodeIR(): AgentformIR {
  const result = buildIR({
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: { name: 'unsupported-node-fixture', version: '1.0.0' },
    spec: {
      runtime: { target: 'autogen', environment: 'development' },
      models: { primary: { provider: 'openai', model: 'gpt-5' } },
      tools: {
        'search-registry': {
          type: 'function',
          handler: 'search.ts#run',
        },
      },
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
            search: { type: 'tool', tool: 'search-registry' },
          },
          edges: [{ from: 'assistant', to: 'search' }],
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
