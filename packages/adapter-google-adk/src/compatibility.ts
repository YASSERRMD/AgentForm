import { resourceAddress, type AgentformIR } from '@agentform/ir';
import type {
  CompatibilityReport,
  FeatureSupportEntry,
  FeatureSupportLevel,
} from '@agentform/plugin-sdk';
import { GOOGLE_ADK_VERSION, PYTHON_VERSION_REQUIREMENT } from './versions.js';

/**
 * Workflow node types this adapter can generate. `agent` maps to a real
 * `LlmAgent`; delegation between agents uses ADK's own `sub_agents`
 * transfer mechanism. `terminate` needs no construct of its own — ADK has
 * no explicit graph-level "end" node. `humanApproval` is `unsupported`
 * here (not `emulated`, unlike AutoGen): ADK's real, native
 * human-confirmation mechanism (`FunctionTool(func, require_confirmation=True)`,
 * verified end-to-end) operates at the *tool* level, not the workflow-node
 * level — Agentform's `humanApproval` node has no faithful mapping onto
 * that without inventing which tool call it's supposed to gate, which
 * would be fabricated, not translated. `tool`/`router`/`loop`/`parallel`/
 * etc. have no generator: this adapter targets ADK's `sub_agents`-based
 * delegation, not the newer graph-based `Workflow` API (`google.adk.workflow`)
 * that could represent them — a deliberately narrower scope, matching
 * every other adapter's precedent of a well-scoped "basic" translation
 * rather than attempting full graph fidelity in one pass.
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
 * ADK enforces a single-parent tree for `sub_agents` — verified directly:
 * assigning the same agent instance as a sub-agent of two different
 * parents raises a real `pydantic.ValidationError` at construction. Since
 * `agent.delegation.allowedAgents` is declared independently per agent,
 * two different agents could both name the same target, which would
 * generate code that fails the moment it's imported. Detected here so it's
 * reported as a diagnostic rather than discovered as a runtime crash.
 */
function findSharedDelegationTargets(ir: AgentformIR): ReadonlyMap<string, readonly string[]> {
  const sourcesByTarget = new Map<string, string[]>();
  for (const [agentId, agent] of ir.agents) {
    for (const target of agent.delegation?.allowedAgents ?? []) {
      const sources = sourcesByTarget.get(target) ?? [];
      sources.push(agentId);
      sourcesByTarget.set(target, sources);
    }
  }
  const shared = new Map<string, readonly string[]>();
  for (const [target, sources] of sourcesByTarget) {
    if (sources.length > 1) {
      shared.set(target, sources);
    }
  }
  return shared;
}

export function validateGoogleAdkCompatibility(ir: AgentformIR): CompatibilityReport {
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
        detail: `tool type "${tool.type}" has no ADK function-tool equivalent yet`,
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
            ? 'ADK has a real tool-level confirmation mechanism (FunctionTool require_confirmation=True), but no workflow-node-level equivalent this adapter can faithfully target'
            : `"${node.type}" nodes have no generator in this adapter yet — targets ADK's sub_agents delegation, not its graph-based Workflow API`;
        entries.push({
          feature: `workflow node (${node.type})`,
          level: 'unsupported',
          detail,
          resourceAddress: address,
        });
      }
    }
  }

  for (const [target, sources] of findSharedDelegationTargets(ir)) {
    entries.push({
      feature: 'agent delegation',
      level: 'unsupported',
      detail: `agent "${target}" is named as an allowed delegate by more than one agent (${sources.join(', ')}) — ADK requires a single-parent sub_agents tree; sharing one target across multiple parents raises a real ValidationError at construction`,
      resourceAddress: resourceAddress('agent', target),
    });
  }

  return {
    target: 'google-adk',
    entries,
    generatedDependencies: { 'google-adk': GOOGLE_ADK_VERSION },
    frameworkVersion: GOOGLE_ADK_VERSION,
    runtimeRequirements: [`python ${PYTHON_VERSION_REQUIREMENT}`],
    securityWarnings: [
      'Generated code never embeds API keys — set them via environment variables; see .env.example.',
    ],
    hasBlockingIncompatibility: entries.some((entry) => entry.level === 'unsupported'),
  };
}
