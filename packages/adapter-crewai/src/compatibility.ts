import { resourceAddress, type AgentformIR } from '@agentform/ir';
import type {
  CompatibilityReport,
  FeatureSupportEntry,
  FeatureSupportLevel,
} from '@agentform/plugin-sdk';
import { CREWAI_VERSION, PYTHON_VERSION_REQUIREMENT } from './versions.js';

/**
 * Workflow node types this adapter can generate. `agent` maps to a real
 * `Task` bound to a real `Agent`, chained sequentially via CrewAI's own
 * `context=[...]` mechanism (verified end-to-end: a real multi-task
 * `Crew.kickoff()` ran both tasks in order with the first task's output
 * available to the second). `terminate` needs no construct of its own —
 * `Process.sequential` finishes naturally once every declared task has
 * run. `humanApproval` is `unsupported`: CrewAI's real native
 * human-in-the-loop primitive, `Task(human_input=True)` (verified directly
 * against the installed package's own `SyncHumanInputProvider` source), is
 * a *review-and-refine* loop — "hit Enter to accept, or give feedback to
 * have the agent try again" — not a binary accept/reject gate, and it is a
 * property of one specific task rather than a node in a graph. Faithfully
 * deciding *which* task an Agentform `humanApproval` node's review should
 * attach to would mean inferring a binding from workflow edges the IR
 * doesn't guarantee point at a meaningful agent task — fabrication, not
 * translation, the same reasoning `@agentform/adapter-google-adk` applies
 * to its own tool-level (not node-level) confirmation mechanism.
 * `tool`/`router`/`loop`/`parallel`/etc. have no generator: this adapter
 * targets CrewAI's `Process.sequential`, not an explicit node graph,
 * matching every other adapter's precedent of a well-scoped "basic"
 * translation rather than full graph fidelity in one pass.
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

export function validateCrewAiCompatibility(ir: AgentformIR): CompatibilityReport {
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
        detail: `tool type "${tool.type}" has no CrewAI @tool-function equivalent yet`,
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
            ? "CrewAI's real human-in-the-loop mechanism (Task(human_input=True), verified against the installed package) is a review-and-refine loop scoped to one specific task, not a graph-level approval gate this adapter can faithfully bind to a node"
            : `"${node.type}" nodes have no generator in this adapter yet — targets CrewAI's Process.sequential, not an explicit node graph`;
        entries.push({
          feature: `workflow node (${node.type})`,
          level: 'unsupported',
          detail,
          resourceAddress: address,
        });
      }
    }
  }

  for (const [agentId, agent] of ir.agents) {
    const targets = agent.delegation?.allowedAgents ?? [];
    if (targets.length > 0) {
      entries.push({
        feature: 'agent delegation',
        level: 'partial',
        detail: `CrewAI's allow_delegation is crew-wide, not scoped to specific coworkers (verified directly against the installed package's DelegateWorkTool, which offers every crew member as a delegation target) — "${agentId}" will be able to delegate to every other agent in its crew, not only its declared allowedAgents (${targets.join(', ')})`,
        resourceAddress: resourceAddress('agent', agentId),
      });
    }
  }

  return {
    target: 'crewai',
    entries,
    generatedDependencies: { crewai: CREWAI_VERSION },
    frameworkVersion: CREWAI_VERSION,
    runtimeRequirements: [`python ${PYTHON_VERSION_REQUIREMENT}`],
    securityWarnings: [
      'Generated code never embeds API keys — set them via environment variables; see .env.example.',
      'Every agent explicitly sets llm= — CrewAI silently defaults an omitted llm= to an OpenAI model (verified directly), a default this adapter never relies on.',
    ],
    hasBlockingIncompatibility: entries.some((entry) => entry.level === 'unsupported'),
  };
}
