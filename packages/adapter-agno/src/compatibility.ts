import { resourceAddress, type AgentformIR } from '@agentform/ir';
import type { CompatibilityReport, FeatureSupportEntry } from '@agentform/plugin-sdk';
import { AGNO_VERSION, FASTAPI_VERSION, PYTHON_VERSION_REQUIREMENT } from './versions.js';

/**
 * Workflow node types this adapter can generate. Agno's own workflow
 * primitives (`Step`/`Steps`/`Loop`/`Parallel`/`Condition`/`Router`,
 * `agno.workflow`, v2.8.0) map unusually directly onto Agentform's own node
 * vocabulary — verified by actually constructing every shape below against
 * the real installed package (no network calls, construction only, the
 * same bar every other adapter's "verified against a real installed
 * package" claim uses): `humanApproval` becomes `Step(requires_confirmation
 * =True)`, a genuinely blocking approval gate (Agno's own real
 * human-in-the-loop mechanism, not an emulation); `loop`/`parallel`/
 * `router`/`condition` become their own real Agno constructs
 * (`Loop`/`Parallel`/`Router`/`Condition`); `subworkflow` becomes
 * `Step(workflow=<nested Workflow>)` (`agno.workflow.step.Step`'s own
 * "Nested workflow support"); `transform`/`delay` become
 * `Step(executor=<callable>)` with a real function body (`delay` calls
 * `time.sleep()` for real — `duration` is a concrete value, not an
 * expression; `transform`'s `expression` has no evaluator anywhere in
 * Agentform, so its executor is a TODO stub, matching every other
 * adapter's treatment of `expression`/`when` text). Two node types have no
 * generator: `join` (Agno's implicit join is a property of a `Parallel`
 * construct itself, not something a standalone downstream node can bind
 * to — the same class of gap CrewAI/LangGraph leave unsupported too) and
 * `event` (waiting on an external trigger has no synchronous-step
 * equivalent to translate to honestly).
 */
const SUPPORTED_NODE_TYPES = new Set([
  'agent',
  'tool',
  'humanApproval',
  'loop',
  'parallel',
  'router',
  'condition',
  'subworkflow',
  'transform',
  'delay',
  'terminate',
]);

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

export function validateAgnoCompatibility(ir: AgentformIR): CompatibilityReport {
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
        detail: `tool type "${tool.type}" has no Agno @tool-function equivalent yet`,
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
        const detail =
          node.type === 'join'
            ? 'Agno\'s join semantics belong to the Parallel construct that fans out, not to a standalone downstream node — there is no construct a "join" node on its own can faithfully bind to'
            : node.type === 'event'
              ? 'waiting on an external event trigger has no synchronous Agno Step equivalent to translate to honestly'
              : `"${node.type}" nodes have no generator in this adapter yet`;
        entries.push({
          feature: `workflow node (${node.type})`,
          level: 'unsupported',
          detail,
          resourceAddress: address,
        });
      }
    }
  }

  entries.push({
    feature: 'human approval',
    level: 'supported',
    detail:
      "Step(requires_confirmation=True) is a real, blocking Agno human-in-the-loop gate (agno.workflow, verified against the installed package) — not an emulation the way LangGraph's interrupt()-based stub or CrewAI's task-level human_input review are.",
  });

  const delegationEntries: FeatureSupportEntry[] = [];
  for (const [agentId, agent] of ir.agents) {
    const targets = agent.delegation?.allowedAgents ?? [];
    if (targets.length > 0) {
      delegationEntries.push({
        feature: 'agent delegation',
        level: 'partial',
        detail:
          "This adapter generates individual Agno Agent objects wired into Workflow Steps, not an agno.team.Team — Team is Agno's real multi-agent-delegation construct (verified against the installed package: Team(members=[...], mode=TeamMode.coordinate) lets a leader delegate to specific members), but binding Agentform's per-agent allowedAgents list to a Team's member set is future adapter work, not attempted here.",
        resourceAddress: resourceAddress('agent', agentId),
      });
    }
  }
  entries.push(...delegationEntries);

  return {
    target: 'agno',
    entries,
    generatedDependencies: { agno: AGNO_VERSION, fastapi: FASTAPI_VERSION },
    frameworkVersion: AGNO_VERSION,
    runtimeRequirements: [`python ${PYTHON_VERSION_REQUIREMENT}`],
    securityWarnings: [
      'Generated code never embeds API keys — set them via environment variables; see .env.example.',
      "fastapi is pinned explicitly: agno.workflow unconditionally imports agno.workflow.remote.RemoteWorkflow, which requires fastapi, even though agno's own package metadata marks fastapi as an optional extra (verified directly against the installed package).",
    ],
    hasBlockingIncompatibility: entries.some((entry) => entry.level === 'unsupported'),
  };
}
