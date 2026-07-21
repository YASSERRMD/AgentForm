import { buildIR, type AgentformIR } from '@agentform/ir';

/** Mirrors every other adapter's `test-fixtures.ts` convention: build through the real `buildIR` so a fixture that drifts from the schema fails the test that uses it. */
export function baseIR(): AgentformIR {
  const result = buildIR({
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: { name: 'fixture-app', version: '1.0.0' },
    spec: {
      runtime: { target: 'microsoft', environment: 'development' },
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

/** A richer fixture exercising reachable delegation, a tool, and a terminate node: two agents (intake delegating to research-specialist), a tool, and a terminate node. */
export function multiAgentIR(): AgentformIR {
  const result = buildIR({
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: { name: 'multi-agent-fixture', version: '1.0.0' },
    spec: {
      runtime: { target: 'microsoft', environment: 'production' },
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

/** Two agents with no delegation declared between them at all — exercises `AgentWorkflowBuilder.BuildSequential`, the plain fallback path for a multi-agent workflow with no handoff structure. */
export function sequentialMultiAgentIR(): AgentformIR {
  const result = buildIR({
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: { name: 'sequential-fixture', version: '1.0.0' },
    spec: {
      runtime: { target: 'microsoft', environment: 'production' },
      models: { primary: { provider: 'openai', model: 'gpt-5' } },
      agents: {
        drafter: {
          model: 'primary',
          role: 'drafter',
          instructions: { text: 'Draft a first response.' },
        },
        editor: {
          model: 'primary',
          role: 'editor',
          instructions: { text: 'Polish the draft.' },
        },
      },
      workflows: {
        main: {
          entrypoint: 'drafter',
          nodes: {
            drafter: { type: 'agent', agent: 'drafter' },
            editor: { type: 'agent', agent: 'editor' },
            done: { type: 'terminate' },
          },
          edges: [
            { from: 'drafter', to: 'editor' },
            { from: 'editor', to: 'done' },
          ],
        },
      },
    },
  });
  if (!result.ir) {
    throw new Error(
      `sequentialMultiAgentIR() fixture failed to build: ${JSON.stringify(result.diagnostics)}`,
    );
  }
  return result.ir;
}

/** A `humanApproval`-type workflow node has no Microsoft Agent Framework node-level generator — used to exercise the "unsupported node type" branch of `validateMicrosoftCompatibility`. */
export function unsupportedNodeIR(): AgentformIR {
  const result = buildIR({
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: { name: 'unsupported-node-fixture', version: '1.0.0' },
    spec: {
      runtime: { target: 'microsoft', environment: 'development' },
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

/**
 * `orphan` declares a delegation target (`specialist`), but nothing hands
 * off *to* `orphan` from the entrypoint (`intake`) — `intake` itself
 * declares no delegation at all. The *workflow* graph (`edges`) is still a
 * valid, fully reachable chain (`intake -> orphan -> specialist -> done`),
 * since that's a separate graph from the delegation one; only the
 * delegation graph is disconnected from the entrypoint. Exercises the
 * unreachable-handoff-source branch of `validateMicrosoftCompatibility`.
 */
export function unreachableHandoffIR(): AgentformIR {
  const result = buildIR({
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: { name: 'unreachable-handoff-fixture', version: '1.0.0' },
    spec: {
      runtime: { target: 'microsoft', environment: 'development' },
      models: { primary: { provider: 'openai', model: 'gpt-5' } },
      agents: {
        intake: {
          model: 'primary',
          role: 'intake',
          instructions: { text: 'Intake, no delegation of its own.' },
        },
        orphan: {
          model: 'primary',
          role: 'orphan',
          instructions: { text: 'Declares delegation but is never handed off to.' },
          delegation: { allowedAgents: ['specialist'] },
        },
        specialist: {
          model: 'primary',
          role: 'specialist',
          instructions: { text: 'The delegation target.' },
        },
      },
      workflows: {
        main: {
          entrypoint: 'intake',
          nodes: {
            intake: { type: 'agent', agent: 'intake' },
            orphan: { type: 'agent', agent: 'orphan' },
            specialist: { type: 'agent', agent: 'specialist' },
            done: { type: 'terminate' },
          },
          edges: [
            { from: 'intake', to: 'orphan' },
            { from: 'orphan', to: 'specialist' },
            { from: 'specialist', to: 'done' },
          ],
        },
      },
    },
  });
  if (!result.ir) {
    throw new Error(
      `unreachableHandoffIR() fixture failed to build: ${JSON.stringify(result.diagnostics)}`,
    );
  }
  return result.ir;
}
