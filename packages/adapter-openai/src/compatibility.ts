import { resourceAddress, type AgentformIR } from '@agentform/ir';
import type { CompatibilityReport, FeatureSupportEntry } from '@agentform/plugin-sdk';
import {
  NODE_ENGINE_RANGE,
  OPENAI_AGENTS_SDK_VERSION,
  TYPES_NODE_VERSION,
  TYPESCRIPT_VERSION,
  ZOD_VERSION,
} from './versions.js';

/**
 * Workflow node types this adapter can generate, per Phase 8's own
 * "Required OpenAI features" list (Agent, Tool, Handoff, Structured
 * output, Guardrails, *Basic* multi-agent workflow) — not §13.1's fuller
 * list (Sessions, Tracing hooks, Tool restrictions are `partial`/absent,
 * not silently claimed as supported). `agent`/`tool` nodes become
 * agents/tools with handoffs between them; `terminate` just ends the run.
 * Every other node type (`router`, `parallel`, `join`, `loop`,
 * `humanApproval`, `delay`, `event`, `subworkflow`, `transform`,
 * `condition`) has no faithful representation in this "basic" scope and
 * is reported `unsupported`.
 */
const SUPPORTED_NODE_TYPES = new Set(['agent', 'tool', 'terminate']);

/** Tool types this adapter can generate a `function` tool wrapper for. `humanApproval`-type tools map onto the SDK's own `needsApproval` option rather than being a distinct construct. */
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

export function validateOpenAiCompatibility(ir: AgentformIR): CompatibilityReport {
  const entries: FeatureSupportEntry[] = [];

  for (const id of ir.agents.keys()) {
    entries.push({
      feature: 'agent',
      level: 'supported',
      resourceAddress: resourceAddress('agent', id),
    });
  }

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
        detail: `tool type "${tool.type}" has no OpenAI Agents SDK equivalent yet`,
        resourceAddress: address,
      });
    }
  }

  for (const [workflowId, workflow] of ir.workflows) {
    for (const [nodeId, node] of workflow.nodes) {
      const address = `${resourceAddress('workflow', workflowId)}.nodes.${nodeId}`;
      if (SUPPORTED_NODE_TYPES.has(node.type)) {
        entries.push({
          feature: `workflow node (${node.type})`,
          level: 'supported',
          resourceAddress: address,
        });
      } else {
        entries.push({
          feature: `workflow node (${node.type})`,
          level: 'unsupported',
          detail: `"${node.type}" nodes are beyond this adapter's basic multi-agent workflow support`,
          resourceAddress: address,
        });
      }
    }
  }

  // §13.1 features this adapter does not yet implement, reported as
  // partial rather than silently absent, matching every generated
  // project regardless of what the specification uses.
  entries.push(
    { feature: 'sessions', level: 'partial', detail: 'not yet generated; add manually if needed' },
    {
      feature: 'tracing hooks',
      level: 'partial',
      detail: 'SDK default tracing only, not configured per-agent',
    },
    {
      feature: 'tool restrictions',
      level: 'partial',
      detail: 'per-run tool allowlisting is not yet generated',
    },
  );

  return {
    target: 'openai',
    entries,
    generatedDependencies: {
      '@openai/agents': OPENAI_AGENTS_SDK_VERSION,
      zod: ZOD_VERSION,
      typescript: TYPESCRIPT_VERSION,
      '@types/node': TYPES_NODE_VERSION,
    },
    frameworkVersion: OPENAI_AGENTS_SDK_VERSION,
    runtimeRequirements: [`node ${NODE_ENGINE_RANGE}`],
    securityWarnings: [
      'Generated code never embeds API keys — the OpenAI SDK reads OPENAI_API_KEY from the environment by default; see .env.example.',
    ],
    hasBlockingIncompatibility: entries.some((entry) => entry.level === 'unsupported'),
  };
}
