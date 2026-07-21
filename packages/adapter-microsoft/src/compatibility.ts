import { resourceAddress, type AgentformIR, type IRWorkflow } from '@agentform/ir';
import type {
  CompatibilityReport,
  FeatureSupportEntry,
  FeatureSupportLevel,
} from '@agentform/plugin-sdk';
import {
  DOTNET_TARGET_FRAMEWORK,
  MICROSOFT_AGENTS_AI_VERSION,
  MICROSOFT_AGENTS_AI_WORKFLOWS_VERSION,
} from './versions.js';

/**
 * Workflow node types this adapter can generate. `agent` maps to a real
 * `AIAgent` built via `IChatClient.AsAIAgent(...)`. `terminate` needs no
 * construct of its own — a handoff/sequential workflow simply finishes
 * once its agents are done. `humanApproval` is `unsupported`: Microsoft
 * Agent Framework has two real human-in-the-loop primitives — tool-level
 * `ApprovalRequiredAIFunction`/`ToolApprovalRequestContent` (verified
 * end-to-end: wrapping a tool, running the agent, collecting the
 * resulting `ToolApprovalRequestContent`, and resuming via
 * `requestContent.CreateResponse(true)`), and a lower-level
 * `RequestPort<TRequest, TResponse>` primitive for pausing a *raw*
 * executor graph for external input (verified to exist via reflection) —
 * but the former is tool-scoped like ADK's equivalent, not a workflow
 * node, and the latter requires building the workflow with the low-level
 * `WorkflowBuilder`/`Executor<TIn,TOut>` graph API this adapter doesn't
 * target (it targets `AgentWorkflowBuilder`'s agent-level convenience
 * builders — `BuildSequential`/`CreateHandoffBuilderWith` — the same
 * "well-scoped basic translation, not full graph fidelity" precedent
 * every other adapter in this repo follows). `tool`/`router`/`loop`/
 * `parallel`/etc. have no generator for the same reason.
 */
const NODE_TYPE_LEVELS: Readonly<Record<string, FeatureSupportLevel>> = {
  agent: 'supported',
  terminate: 'supported',
};

const SUPPORTED_TOOL_TYPES = new Set([
  'function',
  'http',
  'openapi',
  'mcp',
  'database',
  'queue',
  'agent',
  'humanApproval',
  'customPlugin',
]);

/**
 * Which of a workflow's delegating agents can become a real
 * `HandoffWorkflowBuilder.WithHandoffs(...)` edge, and which can't.
 * Verified directly: `HandoffWorkflowBuilder.Build()` throws a real
 * `InvalidOperationException` ("unreachable executors: ...") unless
 * *every* handoff source is reachable from the workflow's entrypoint
 * through some chain of handoff edges — unlike ADK's single-parent-tree
 * constraint (which blocks *sharing* a target) or CrewAI's crew-wide
 * scoping (which never blocks, just widens), this is a *reachability*
 * requirement: an agent that declares delegation but that nothing ever
 * hands off *to* is a dangling, unreachable node the builder rejects
 * outright. A shared target reachable from two different sources builds
 * fine (verified directly) — Agentform's `delegation.allowedAgents` graph
 * has no equivalent of ADK's ownership-tree hazard.
 */
function computeHandoffReachability(
  workflow: IRWorkflow,
  ir: AgentformIR,
): { readonly supported: readonly string[]; readonly unreachable: readonly string[] } {
  const entrypointNode = workflow.nodes.get(workflow.entrypoint);
  if (!entrypointNode || entrypointNode.type !== 'agent') {
    return { supported: [], unreachable: [] };
  }

  const participantIds = new Set<string>();
  for (const node of workflow.nodes.values()) {
    if (node.type === 'agent') participantIds.add(node.agent);
  }

  const delegatingAgentIds = [...participantIds].filter(
    (id) => (ir.agents.get(id)?.delegation?.allowedAgents ?? []).length > 0,
  );
  if (delegatingAgentIds.length === 0) {
    return { supported: [], unreachable: [] };
  }

  const edges: Array<{ readonly from: string; readonly to: string }> = [];
  for (const agentId of participantIds) {
    for (const target of ir.agents.get(agentId)?.delegation?.allowedAgents ?? []) {
      if (participantIds.has(target)) edges.push({ from: agentId, to: target });
    }
  }

  const reachable = new Set([entrypointNode.agent]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) {
      if (reachable.has(edge.from) && !reachable.has(edge.to)) {
        reachable.add(edge.to);
        changed = true;
      }
    }
  }

  return {
    supported: delegatingAgentIds.filter((id) => reachable.has(id)),
    unreachable: delegatingAgentIds.filter((id) => !reachable.has(id)),
  };
}

export function validateMicrosoftCompatibility(ir: AgentformIR): CompatibilityReport {
  const entries: FeatureSupportEntry[] = [];

  for (const [id, tool] of ir.tools) {
    const address = resourceAddress('tool', id);
    if (SUPPORTED_TOOL_TYPES.has(tool.type)) {
      entries.push({
        feature: `tool (${tool.type})`,
        level: 'supported',
        resourceAddress: address,
      });
    } else {
      entries.push({
        feature: `tool (${tool.type})`,
        level: 'unsupported',
        detail: `tool type "${tool.type}" has no Microsoft Agent Framework AIFunction equivalent yet`,
        resourceAddress: address,
      });
    }
  }

  for (const [workflowId, workflow] of ir.workflows) {
    for (const [nodeId, node] of workflow.nodes) {
      const address = `${resourceAddress('workflow', workflowId)}.nodes.${nodeId}`;
      const level = NODE_TYPE_LEVELS[node.type];
      if (level) {
        entries.push({ feature: `workflow node (${node.type})`, level, resourceAddress: address });
      } else {
        const detail =
          node.type === 'humanApproval'
            ? "Microsoft Agent Framework has real human-in-the-loop mechanisms (ApprovalRequiredAIFunction at the tool level, RequestPort at the raw executor-graph level), but neither is a node this adapter — which targets AgentWorkflowBuilder's agent-level convenience builders — can faithfully bind to a workflow graph node"
            : `"${node.type}" nodes have no generator in this adapter yet — targets AgentWorkflowBuilder's BuildSequential/handoff builders, not the low-level executor graph API`;
        entries.push({
          feature: `workflow node (${node.type})`,
          level: 'unsupported',
          detail,
          resourceAddress: address,
        });
      }
    }

    const { supported, unreachable } = computeHandoffReachability(workflow, ir);
    for (const agentId of supported) {
      entries.push({
        feature: 'agent delegation',
        level: 'supported',
        detail: `"${agentId}"'s declared delegation targets become real HandoffWorkflowBuilder.WithHandoffs(...) edges in workflow "${workflowId}" — unlike the other three Phase 9 adapters, Microsoft Agent Framework's handoff graph precisely represents a per-agent allowlist with no sharing or scoping caveat`,
        resourceAddress: resourceAddress('agent', agentId),
      });
    }
    for (const agentId of unreachable) {
      entries.push({
        feature: 'agent delegation',
        level: 'unsupported',
        detail: `"${agentId}" declares delegation, but nothing hands off *to* it from workflow "${workflowId}"'s entrypoint — HandoffWorkflowBuilder.Build() requires every handoff source to be reachable, verified directly (an unreachable source raises a real InvalidOperationException)`,
        resourceAddress: resourceAddress('agent', agentId),
      });
    }
  }

  return {
    target: 'microsoft',
    entries,
    generatedDependencies: {
      'Microsoft.Agents.AI': MICROSOFT_AGENTS_AI_VERSION,
      'Microsoft.Agents.AI.Workflows': MICROSOFT_AGENTS_AI_WORKFLOWS_VERSION,
    },
    frameworkVersion: MICROSOFT_AGENTS_AI_VERSION,
    runtimeRequirements: [`dotnet ${DOTNET_TARGET_FRAMEWORK}`],
    securityWarnings: [
      'Generated code never embeds API keys — set them via environment variables; see .env.example.',
      'Model chat clients are generated as NotImplementedException stubs; nothing runs until you implement them.',
    ],
    hasBlockingIncompatibility: entries.some((entry) => entry.level === 'unsupported'),
  };
}
