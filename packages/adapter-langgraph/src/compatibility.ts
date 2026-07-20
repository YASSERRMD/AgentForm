import { resourceAddress, type AgentformIR } from '@agentform/ir';
import type { CompatibilityReport, FeatureSupportEntry } from '@agentform/plugin-sdk';
import { LANGGRAPH_VERSION, PYTHON_VERSION_REQUIREMENT } from './versions.js';

/**
 * Workflow node types this adapter can generate, per Phase 8's own
 * "Required LangGraph features" list (State graph, Agent node, Tool node,
 * Conditional edge, Human approval, Loop limit, Typed state) — a broader
 * set than the OpenAI adapter's "basic" scope, since LangGraph's own
 * feature list explicitly names human approval and loop limits.
 * `router` maps to a pass-through node whose only job is a conditional
 * edge. Every other node type (`parallel`, `join`, `delay`, `event`,
 * `subworkflow`, `transform`, `condition`) has no generator yet.
 */
const SUPPORTED_NODE_TYPES = new Set(['agent', 'tool', 'humanApproval', 'loop', 'router', 'terminate']);

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

export function validateLangGraphCompatibility(ir: AgentformIR): CompatibilityReport {
  const entries: FeatureSupportEntry[] = [];

  for (const id of ir.agents.keys()) {
    entries.push({ feature: 'agent', level: 'supported', resourceAddress: resourceAddress('agent', id) });
  }

  for (const [id, tool] of ir.tools) {
    const address = resourceAddress('tool', id);
    if (SUPPORTED_TOOL_TYPES.has(tool.type)) {
      entries.push({ feature: `tool (${tool.type})`, level: 'supported', resourceAddress: address });
    } else {
      entries.push({
        feature: `tool (${tool.type})`,
        level: 'unsupported',
        detail: `tool type "${tool.type}" has no LangGraph tool-node equivalent yet`,
        resourceAddress: address,
      });
    }
  }

  for (const [workflowId, workflow] of ir.workflows) {
    for (const [nodeId, node] of workflow.nodes) {
      const address = `${resourceAddress('workflow', workflowId)}.nodes.${nodeId}`;
      if (SUPPORTED_NODE_TYPES.has(node.type)) {
        entries.push({ feature: `workflow node (${node.type})`, level: 'supported', resourceAddress: address });
      } else {
        entries.push({
          feature: `workflow node (${node.type})`,
          level: 'unsupported',
          detail: `"${node.type}" nodes have no generator in this adapter yet`,
          resourceAddress: address,
        });
      }
    }
  }

  entries.push({
    feature: 'checkpointing',
    level: 'emulated',
    detail: 'generated with an in-memory MemorySaver; swap in a persistent checkpointer for production use',
  });

  return {
    target: 'langgraph',
    entries,
    generatedDependencies: { langgraph: LANGGRAPH_VERSION },
    frameworkVersion: LANGGRAPH_VERSION,
    runtimeRequirements: [`python ${PYTHON_VERSION_REQUIREMENT}`],
    securityWarnings: [
      'Generated code never embeds API keys — set them via environment variables; see .env.example.',
    ],
    hasBlockingIncompatibility: entries.some((entry) => entry.level === 'unsupported'),
  };
}
