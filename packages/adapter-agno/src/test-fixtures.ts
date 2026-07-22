import { buildIR, type AgentformIR } from '@agentform/ir';

/** Mirrors every other adapter's `test-fixtures.ts` convention: build through the real `buildIR` so a fixture that drifts from the schema fails the test that uses it. */
export function baseIR(): AgentformIR {
  const result = buildIR({
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: { name: 'fixture-app', version: '1.0.0' },
    spec: {
      runtime: { target: 'agno', environment: 'development' },
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
 * Exercises the node types this adapter resolves faithfully from real,
 * declared graph structure (no guessing at "what's inside" a construct):
 * `tool`, `humanApproval`, `router` (choices from its own outgoing
 * edges), `parallel` (branches from `node.branches`, a real IR field),
 * `condition` (then/else from its own outgoing edges), and `terminate`.
 */
export function richWorkflowIR(): AgentformIR {
  const result = buildIR({
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: { name: 'rich-workflow-fixture', version: '1.0.0' },
    spec: {
      runtime: { target: 'agno', environment: 'development' },
      models: { primary: { provider: 'openai', model: 'gpt-5' } },
      tools: {
        lookup: {
          type: 'function',
          handler: 'lookup.ts#run',
          sideEffect: 'read',
          inputSchema: { type: 'object', properties: { id: { type: 'string' } } },
        },
        issueRefund: {
          type: 'function',
          handler: 'refund.ts#run',
          sideEffect: 'destructive',
          permissions: ['refunds:write'],
          inputSchema: { type: 'object', properties: { amount: { type: 'number' } } },
        },
      },
      agents: {
        triage: {
          model: 'primary',
          role: 'triage',
          instructions: { text: 'Route the request.' },
          tools: ['lookup'],
        },
        billing: {
          model: 'primary',
          role: 'billing specialist',
          instructions: { text: 'Handle billing requests.' },
        },
        technical: {
          model: 'primary',
          role: 'technical specialist',
          instructions: { text: 'Handle technical requests.' },
        },
        branchA: { model: 'primary', role: 'branch a', instructions: { text: 'Do branch A.' } },
        branchB: { model: 'primary', role: 'branch b', instructions: { text: 'Do branch B.' } },
        thenAgent: { model: 'primary', role: 'then', instructions: { text: 'Then path.' } },
        elseAgent: { model: 'primary', role: 'else', instructions: { text: 'Else path.' } },
      },
      workflows: {
        main: {
          entrypoint: 'triage',
          nodes: {
            triage: { type: 'agent', agent: 'triage' },
            classify: { type: 'router' },
            billing: { type: 'agent', agent: 'billing' },
            technical: { type: 'agent', agent: 'technical' },
            approve: { type: 'humanApproval', approvers: ['ops-lead'] },
            fanout: { type: 'parallel', branches: ['branchANode', 'branchBNode'] },
            branchANode: { type: 'agent', agent: 'branchA' },
            branchBNode: { type: 'agent', agent: 'branchB' },
            checkConfidence: { type: 'condition', expression: 'output.confidence >= 0.8' },
            thenNode: { type: 'agent', agent: 'thenAgent' },
            elseNode: { type: 'agent', agent: 'elseAgent' },
            done: { type: 'terminate' },
          },
          edges: [
            { from: 'triage', to: 'classify' },
            { from: 'classify', to: 'billing', when: 'category == "billing"' },
            { from: 'classify', to: 'technical', when: 'category == "technical"' },
            { from: 'billing', to: 'approve' },
            { from: 'technical', to: 'approve' },
            { from: 'approve', to: 'fanout' },
            { from: 'fanout', to: 'branchANode' },
            { from: 'fanout', to: 'branchBNode' },
            { from: 'branchANode', to: 'checkConfidence' },
            { from: 'branchBNode', to: 'checkConfidence' },
            { from: 'checkConfidence', to: 'thenNode', when: 'confidence >= 0.8' },
            { from: 'checkConfidence', to: 'elseNode', when: 'confidence < 0.8' },
            { from: 'thenNode', to: 'done' },
            { from: 'elseNode', to: 'done' },
          ],
        },
      },
    },
  });
  if (!result.ir) {
    throw new Error(
      `richWorkflowIR() fixture failed to build: ${JSON.stringify(result.diagnostics)}`,
    );
  }
  return result.ir;
}

/**
 * Exercises `loop` (cyclic back-edge, deliberately excluded from the
 * top-level sequence — see `generate-workflow.ts`'s module doc comment),
 * `transform`, `delay`, and `subworkflow` (referencing a second declared
 * workflow).
 */
export function loopAndStubsIR(): AgentformIR {
  const result = buildIR({
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: { name: 'loop-and-stubs-fixture', version: '1.0.0' },
    spec: {
      runtime: { target: 'agno', environment: 'development' },
      models: { primary: { provider: 'openai', model: 'gpt-5' } },
      agents: {
        worker: {
          model: 'primary',
          role: 'worker',
          instructions: { text: 'Do the work.' },
        },
        subAgent: {
          model: 'primary',
          role: 'sub agent',
          instructions: { text: 'Handle the subworkflow.' },
        },
      },
      workflows: {
        sub: {
          entrypoint: 'subStart',
          nodes: { subStart: { type: 'agent', agent: 'subAgent' } },
        },
        main: {
          entrypoint: 'attempt',
          nodes: {
            attempt: { type: 'agent', agent: 'worker' },
            retry: { type: 'loop', maxIterations: 3, condition: 'output.succeeded == false' },
            reformat: { type: 'transform', expression: 'output.text | trim' },
            wait: { type: 'delay', duration: '5s' },
            delegate: { type: 'subworkflow', workflow: 'sub' },
            done: { type: 'terminate' },
          },
          edges: [
            { from: 'attempt', to: 'retry', when: 'output.succeeded == false' },
            { from: 'retry', to: 'attempt' },
            { from: 'attempt', to: 'reformat', when: 'output.succeeded == true' },
            { from: 'reformat', to: 'wait' },
            { from: 'wait', to: 'delegate' },
            { from: 'delegate', to: 'done' },
          ],
        },
      },
    },
  });
  if (!result.ir) {
    throw new Error(
      `loopAndStubsIR() fixture failed to build: ${JSON.stringify(result.diagnostics)}`,
    );
  }
  return result.ir;
}

/** A `join`-type workflow node has no Agno equivalent — used to exercise the "unsupported node type" branch of `validateAgnoCompatibility`. */
export function unsupportedNodeIR(): AgentformIR {
  const result = buildIR({
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: { name: 'unsupported-node-fixture', version: '1.0.0' },
    spec: {
      runtime: { target: 'agno', environment: 'development' },
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
            fanout: { type: 'parallel', branches: ['branchOne', 'branchTwo'] },
            branchOne: { type: 'agent', agent: 'assistant' },
            branchTwo: { type: 'agent', agent: 'assistant' },
            merge: { type: 'join', strategy: 'all' },
          },
          edges: [
            { from: 'assistant', to: 'fanout' },
            { from: 'fanout', to: 'branchOne' },
            { from: 'fanout', to: 'branchTwo' },
            { from: 'branchOne', to: 'merge' },
            { from: 'branchTwo', to: 'merge' },
          ],
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
