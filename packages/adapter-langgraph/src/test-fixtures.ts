import { buildIR, type AgentformIR } from '@agentform/ir';

/** Mirrors `@agentform/adapter-openai`'s `test-fixtures.ts` convention: build through the real `buildIR` so a fixture that drifts from the schema fails the test that uses it. */
export function baseIR(): AgentformIR {
  const result = buildIR({
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: { name: 'fixture-app', version: '1.0.0' },
    spec: {
      runtime: { target: 'langgraph', environment: 'development' },
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
 * A richer fixture exercising every node type this adapter supports: an
 * agent node, a tool node, a router (conditional edges), a loop (bounding a
 * real cycle back through the router), a human approval gate, and a
 * terminate node.
 */
export function graphWorkflowIR(): AgentformIR {
  const result = buildIR({
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: { name: 'graph-fixture', version: '1.0.0' },
    spec: {
      runtime: { target: 'langgraph', environment: 'production' },
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
        triage: {
          model: 'primary',
          role: 'triage',
          instructions: { text: 'Triage the incoming request.' },
          tools: ['search-registry'],
        },
        researcher: {
          model: 'primary',
          role: 'researcher',
          instructions: { text: 'Research the topic thoroughly.' },
        },
      },
      workflows: {
        main: {
          entrypoint: 'triage',
          nodes: {
            triage: { type: 'agent', agent: 'triage' },
            'use-search': { type: 'tool', tool: 'search-registry' },
            route: { type: 'router', default: 'approve' },
            research: { type: 'agent', agent: 'researcher' },
            retry: { type: 'loop', maxIterations: 3, condition: 'state.incomplete' },
            approve: { type: 'humanApproval', approvers: ['ops-team'] },
            done: { type: 'terminate' },
          },
          edges: [
            { from: 'triage', to: 'use-search' },
            { from: 'use-search', to: 'route' },
            { from: 'route', to: 'research', when: 'state.needsResearch == true' },
            { from: 'route', to: 'approve', when: 'state.needsResearch == false' },
            { from: 'research', to: 'retry' },
            { from: 'retry', to: 'route', when: 'state.retryNeeded == true' },
            { from: 'retry', to: 'approve', when: 'state.retryNeeded == false' },
            { from: 'approve', to: 'done' },
          ],
        },
      },
    },
  });
  if (!result.ir) {
    throw new Error(
      `graphWorkflowIR() fixture failed to build: ${JSON.stringify(result.diagnostics)}`,
    );
  }
  return result.ir;
}

/** A `delay` node has no LangGraph generator yet — used to exercise the "unsupported node type" branch of `validateLangGraphCompatibility`. */
export function unsupportedNodeIR(): AgentformIR {
  const result = buildIR({
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: { name: 'unsupported-node-fixture', version: '1.0.0' },
    spec: {
      runtime: { target: 'langgraph', environment: 'development' },
      models: { primary: { provider: 'openai', model: 'gpt-5' } },
      agents: {
        triage: {
          model: 'primary',
          role: 'triage',
          instructions: { text: 'Triage the incoming request.' },
        },
      },
      workflows: {
        main: {
          entrypoint: 'triage',
          nodes: {
            triage: { type: 'agent', agent: 'triage' },
            pause: { type: 'delay', duration: '5s' },
          },
          edges: [{ from: 'triage', to: 'pause' }],
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
