import type { AgentformIR, IRWorkflow, IRWorkflowNode } from '@agentform/ir';
import type {
  ApprovalRequestRecord,
  ExecutionEvent,
  ExecutionTrace,
  Scenario,
  ScenarioNodeOverride,
  ToolCallRecord,
} from './types.js';

const DEFAULT_MAX_STEPS = 1000;

class WorkflowRunError extends Error {}

function outgoingEdges(workflow: IRWorkflow, nodeId: string): readonly { readonly to: string }[] {
  return workflow.edges.filter((edge) => edge.from === nodeId);
}

/**
 * The mock analog of evaluating a real routing decision — Agentform has no
 * expression evaluator for `when` conditions (see `ScenarioNodeOverride`'s
 * doc comment), so a node with more than one outgoing edge requires the
 * scenario to say which one to take.
 */
function resolveNextNode(
  workflow: IRWorkflow,
  nodeId: string,
  override: ScenarioNodeOverride | undefined,
): string | undefined {
  const outgoing = outgoingEdges(workflow, nodeId);
  if (outgoing.length === 0) return undefined;
  if (outgoing.length === 1) return outgoing[0]?.to;
  if (override?.next === undefined) {
    throw new WorkflowRunError(
      `Node "${nodeId}" has ${outgoing.length} outgoing edges — the scenario must declare nodes["${nodeId}"].next to pick one (Agentform has no expression evaluator to decide automatically).`,
    );
  }
  const match = outgoing.find((edge) => edge.to === override.next);
  if (!match) {
    throw new WorkflowRunError(
      `Scenario declares nodes["${nodeId}"].next = "${override.next}", but node "${nodeId}" has no such outgoing edge.`,
    );
  }
  return match.to;
}

interface MutableTrace {
  events: ExecutionEvent[];
  visitedNodes: string[];
  toolCalls: ToolCallRecord[];
  approvalRequests: ApprovalRequestRecord[];
  retryCount: number;
  terminationReason?: string;
  costUsd: number;
  latencyMs: number;
  finalOutput?: unknown;
}

/**
 * Runs one `ScenarioToolCall`, retrying up to the calling agent's real,
 * declared `retry.maxAttempts` (defaulting to 0 — no retry) whenever the
 * scenario's mock declares `failCount` failures before succeeding. This
 * uses genuine IR data (an agent's own configured retry budget), not a
 * fabricated one — the same "only what's declared" discipline every
 * framework adapter's generated code follows.
 */
function invokeTool(
  trace: MutableTrace,
  nodeId: string,
  tool: { readonly tool: string; readonly args?: Readonly<Record<string, unknown>> },
  scenario: Scenario,
  maxAttempts: number,
): boolean {
  const mock = scenario.mocks?.[tool.tool];
  const failCount = mock?.failCount ?? 0;
  const args = tool.args ?? {};

  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    if (attempt < failCount) {
      trace.retryCount += 1;
      trace.events.push({ type: 'toolCallFailed', nodeId, tool: tool.tool, args });
      if (attempt < maxAttempts) {
        trace.events.push({ type: 'retryAttempted', nodeId, tool: tool.tool });
      }
      continue;
    }
    const result = mock?.return ?? null;
    trace.toolCalls.push({ nodeId, tool: tool.tool, args, result });
    trace.events.push({ type: 'toolCalled', nodeId, tool: tool.tool, args, result });
    trace.costUsd += mock?.costUsd ?? 0;
    trace.latencyMs += mock?.latencyMs ?? 0;
    return true;
  }
  return false;
}

function processNode(
  ir: AgentformIR,
  node: IRWorkflowNode,
  nodeId: string,
  scenario: Scenario,
  override: ScenarioNodeOverride | undefined,
  trace: MutableTrace,
): { readonly halt: boolean } {
  switch (node.type) {
    case 'agent': {
      const agent = ir.agents.get(node.agent);
      const maxAttempts = agent?.retry?.maxAttempts ?? 0;
      for (const call of override?.toolCalls ?? []) {
        const succeeded = invokeTool(trace, nodeId, call, scenario, maxAttempts);
        if (!succeeded) {
          trace.terminationReason = `tool-failed:${call.tool}`;
          return { halt: true };
        }
      }
      if (override?.output !== undefined) {
        trace.finalOutput = override.output;
      }
      return { halt: false };
    }
    case 'tool': {
      const succeeded = invokeTool(trace, nodeId, { tool: node.tool }, scenario, 0);
      if (!succeeded) {
        trace.terminationReason = `tool-failed:${node.tool}`;
        return { halt: true };
      }
      return { halt: false };
    }
    case 'humanApproval': {
      const approved = override?.approve ?? true;
      trace.approvalRequests.push({ nodeId, approved });
      trace.events.push({ type: 'approvalRequested', nodeId, approved });
      if (!approved) {
        trace.terminationReason = 'approval-rejected';
        return { halt: true };
      }
      return { halt: false };
    }
    case 'terminate': {
      trace.terminationReason = node.reason ?? 'terminate';
      return { halt: true };
    }
    case 'subworkflow': {
      const nested = runWorkflowById(ir, node.workflow, {
        ...scenario,
        workflow: node.workflow,
      });
      trace.events.push(...nested.events);
      trace.visitedNodes.push(...nested.visitedNodes);
      trace.toolCalls.push(...nested.toolCalls);
      trace.approvalRequests.push(...nested.approvalRequests);
      trace.retryCount += nested.retryCount;
      trace.costUsd += nested.costUsd;
      trace.latencyMs += nested.latencyMs;
      if (nested.finalOutput !== undefined) trace.finalOutput = nested.finalOutput;
      return { halt: false };
    }
    // router/parallel/join/delay/event/transform/condition: structural
    // pass-throughs in mock mode — Agentform has no expression evaluator
    // or real timing/concurrency to simulate for these yet (same scope
    // limit every framework adapter's own generator documents for the
    // identical node types).
    default:
      return { halt: false };
  }
}

function runWorkflowById(ir: AgentformIR, workflowId: string, scenario: Scenario): ExecutionTrace {
  const workflow = ir.workflows.get(workflowId);
  if (!workflow) {
    throw new WorkflowRunError(`No workflow "${workflowId}" in this project.`);
  }

  const trace: MutableTrace = {
    events: [],
    visitedNodes: [],
    toolCalls: [],
    approvalRequests: [],
    retryCount: 0,
    costUsd: 0,
    latencyMs: 0,
  };

  const maxSteps = scenario.maxSteps ?? DEFAULT_MAX_STEPS;
  const loopVisitCounts = new Map<string, number>();
  let currentNodeId: string | undefined = workflow.entrypoint;
  let steps = 0;

  while (currentNodeId !== undefined) {
    if (steps++ >= maxSteps) {
      trace.terminationReason = 'max-steps-exceeded';
      break;
    }

    const node = workflow.nodes.get(currentNodeId);
    if (!node) {
      trace.terminationReason = `missing-node:${currentNodeId}`;
      break;
    }

    if (node.type === 'loop') {
      const visits = (loopVisitCounts.get(currentNodeId) ?? 0) + 1;
      loopVisitCounts.set(currentNodeId, visits);
      if (visits > node.maxIterations) {
        trace.terminationReason = 'loop-limit-exceeded';
        break;
      }
    }

    trace.visitedNodes.push(currentNodeId);
    trace.events.push({ type: 'nodeVisited', nodeId: currentNodeId, nodeType: node.type });

    const override = scenario.nodes?.[currentNodeId];
    const { halt } = processNode(ir, node, currentNodeId, scenario, override, trace);
    if (halt) break;

    currentNodeId = resolveNextNode(workflow, currentNodeId, override);
  }

  if (trace.terminationReason) {
    trace.events.push({ type: 'terminated', reason: trace.terminationReason });
  }

  return { workflow: workflowId, ...trace };
}

/**
 * Runs one workflow through Agentform's own deterministic mock
 * interpreter — testing the *specification's* logic (routing, retries,
 * approval gates, cost/latency bookkeeping) independent of which of the
 * six target frameworks it will eventually compile to. Offline by
 * construction: nothing here makes a network call or invokes a real model
 * (§17 "Mock providers must make offline tests deterministic").
 */
export function runWorkflow(ir: AgentformIR, scenario: Scenario): ExecutionTrace {
  return runWorkflowById(ir, scenario.workflow, scenario);
}

export { WorkflowRunError };
