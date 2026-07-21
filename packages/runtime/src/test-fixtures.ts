import { buildIR, type AgentformIR } from '@agentform/ir';

/** Mirrors every adapter's `test-fixtures.ts` convention: build through the real `buildIR` so a fixture that drifts from the schema fails the test that uses it. */
export function linearIR(): AgentformIR {
  const result = buildIR({
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: { name: 'linear-fixture', version: '1.0.0' },
    spec: {
      runtime: { target: 'openai', environment: 'development' },
      models: { primary: { provider: 'openai', model: 'gpt-5' } },
      tools: {
        lookup: {
          type: 'function',
          handler: 'lookup.ts#run',
          sideEffect: 'read',
          inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
        },
      },
      agents: {
        assistant: {
          model: 'primary',
          role: 'assistant',
          instructions: { text: 'Look things up and respond.' },
          tools: ['lookup'],
        },
      },
      workflows: {
        main: {
          entrypoint: 'assistant',
          nodes: {
            assistant: { type: 'agent', agent: 'assistant' },
            done: { type: 'terminate', reason: 'complete' },
          },
          edges: [{ from: 'assistant', to: 'done' }],
        },
      },
    },
  });
  if (!result.ir) {
    throw new Error(`linearIR() fixture failed to build: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.ir;
}

/** A router node with two outgoing edges — exercises `resolveNextNode`'s branching requirement. */
export function branchingIR(): AgentformIR {
  const result = buildIR({
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: { name: 'branching-fixture', version: '1.0.0' },
    spec: {
      runtime: { target: 'openai', environment: 'development' },
      models: { primary: { provider: 'openai', model: 'gpt-5' } },
      agents: {
        intake: {
          model: 'primary',
          role: 'intake',
          instructions: { text: 'Triage the request.' },
        },
        billing: {
          model: 'primary',
          role: 'billing',
          instructions: { text: 'Handle billing questions.' },
        },
        tech: {
          model: 'primary',
          role: 'tech',
          instructions: { text: 'Handle tech questions.' },
        },
      },
      workflows: {
        main: {
          entrypoint: 'intake',
          nodes: {
            intake: { type: 'router' },
            billing: { type: 'agent', agent: 'billing' },
            tech: { type: 'agent', agent: 'tech' },
            done: { type: 'terminate' },
          },
          edges: [
            // A node may have at most one *unconditional* outgoing edge
            // (AGF3009) — the other needs a `when` guard to disambiguate,
            // even though nothing evaluates it for real; the mock runtime
            // always defers to the scenario's own `next` override instead.
            { from: 'intake', to: 'billing', when: 'category == "billing"' },
            { from: 'intake', to: 'tech' },
            { from: 'billing', to: 'done' },
            { from: 'tech', to: 'done' },
          ],
        },
      },
    },
  });
  if (!result.ir) {
    throw new Error(`branchingIR() fixture failed to build: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.ir;
}

/** A loop node with a small `maxIterations`, looping back to itself, then exiting — exercises real loop-limit enforcement. */
export function loopIR(maxIterations = 3): AgentformIR {
  const result = buildIR({
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: { name: 'loop-fixture', version: '1.0.0' },
    spec: {
      runtime: { target: 'langgraph', environment: 'development' },
      models: { primary: { provider: 'openai', model: 'gpt-5' } },
      agents: {
        assistant: {
          model: 'primary',
          role: 'assistant',
          instructions: { text: 'Iterate until satisfied.' },
        },
      },
      workflows: {
        main: {
          entrypoint: 'refine',
          nodes: {
            refine: { type: 'loop', maxIterations },
            done: { type: 'terminate' },
          },
          edges: [
            // At most one unconditional outgoing edge (AGF3009) — see the
            // identical note in branchingIR() above.
            { from: 'refine', to: 'refine', when: 'needsMoreWork == true' },
            { from: 'refine', to: 'done' },
          ],
        },
      },
    },
  });
  if (!result.ir) {
    throw new Error(`loopIR() fixture failed to build: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.ir;
}

/** A humanApproval node between two agent nodes — exercises approve/reject termination. */
export function approvalIR(): AgentformIR {
  const result = buildIR({
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: { name: 'approval-fixture', version: '1.0.0' },
    spec: {
      runtime: { target: 'langgraph', environment: 'development' },
      models: { primary: { provider: 'openai', model: 'gpt-5' } },
      agents: {
        drafter: {
          model: 'primary',
          role: 'drafter',
          instructions: { text: 'Draft the action.' },
        },
        executor: {
          model: 'primary',
          role: 'executor',
          instructions: { text: 'Execute the approved action.' },
        },
      },
      workflows: {
        main: {
          entrypoint: 'drafter',
          nodes: {
            drafter: { type: 'agent', agent: 'drafter' },
            approve: { type: 'humanApproval' },
            executor: { type: 'agent', agent: 'executor' },
            done: { type: 'terminate' },
          },
          edges: [
            { from: 'drafter', to: 'approve' },
            { from: 'approve', to: 'executor' },
            { from: 'executor', to: 'done' },
          ],
        },
      },
    },
  });
  if (!result.ir) {
    throw new Error(`approvalIR() fixture failed to build: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.ir;
}

/** An agent with `retry.maxAttempts` declared and a tool it calls — exercises the fail-then-succeed retry path. */
export function retryIR(maxAttempts = 2): AgentformIR {
  const result = buildIR({
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: { name: 'retry-fixture', version: '1.0.0' },
    spec: {
      runtime: { target: 'openai', environment: 'development' },
      models: { primary: { provider: 'openai', model: 'gpt-5' } },
      tools: {
        flaky: {
          type: 'function',
          handler: 'flaky.ts#run',
          sideEffect: 'read',
        },
      },
      agents: {
        assistant: {
          model: 'primary',
          role: 'assistant',
          instructions: { text: 'Call the flaky tool.' },
          tools: ['flaky'],
          retry: { maxAttempts },
        },
      },
      workflows: {
        main: {
          entrypoint: 'assistant',
          nodes: {
            assistant: { type: 'agent', agent: 'assistant' },
            done: { type: 'terminate' },
          },
          edges: [{ from: 'assistant', to: 'done' }],
        },
      },
    },
  });
  if (!result.ir) {
    throw new Error(`retryIR() fixture failed to build: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.ir;
}

/** `main` delegates to `sub` via a `subworkflow` node — exercises nested-run tracing. */
export function subworkflowIR(): AgentformIR {
  const result = buildIR({
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: { name: 'subworkflow-fixture', version: '1.0.0' },
    spec: {
      runtime: { target: 'openai', environment: 'development' },
      models: { primary: { provider: 'openai', model: 'gpt-5' } },
      agents: {
        assistant: {
          model: 'primary',
          role: 'assistant',
          instructions: { text: 'Delegate to the sub-workflow.' },
        },
        helper: {
          model: 'primary',
          role: 'helper',
          instructions: { text: 'Helps with the sub-task.' },
        },
      },
      workflows: {
        main: {
          entrypoint: 'delegate',
          nodes: {
            delegate: { type: 'subworkflow', workflow: 'sub' },
            done: { type: 'terminate' },
          },
          edges: [{ from: 'delegate', to: 'done' }],
        },
        sub: {
          entrypoint: 'helper',
          nodes: {
            helper: { type: 'agent', agent: 'helper' },
            subDone: { type: 'terminate', reason: 'sub-complete' },
          },
          edges: [{ from: 'helper', to: 'subDone' }],
        },
      },
    },
  });
  if (!result.ir) {
    throw new Error(
      `subworkflowIR() fixture failed to build: ${JSON.stringify(result.diagnostics)}`,
    );
  }
  return result.ir;
}
