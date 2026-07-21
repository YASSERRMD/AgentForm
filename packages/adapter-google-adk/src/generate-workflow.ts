import { generatedFileHeader, pythonStringLiteral, toIdentifier } from '@agentform/compiler';
import { resourceAddress, type IRWorkflow } from '@agentform/ir';

/**
 * A workflow's job here is just "which agent do we start with" — delegation
 * between agents is already fully encoded at the agent level (`sub_agents`,
 * `generate-agent.ts`), mirroring `@agentform/adapter-openai`'s equivalent
 * file (handoffs are also agent-level there). This adapter's compatibility
 * checker only accepts `agent`/`terminate` workflow nodes, so the
 * entrypoint is always an `agent` node in practice — the fallback below is
 * kept for the same reason OpenAI's is: an honest, explicit failure rather
 * than a crash if that assumption is ever wrong.
 */
export function generateWorkflowFile(workflowId: string, workflow: IRWorkflow): string {
  const header = generatedFileHeader({
    commentPrefix: '#',
    sourceResourceAddresses: [resourceAddress('workflow', workflowId)],
  });

  const entrypointNode = workflow.nodes.get(workflow.entrypoint);
  const entrypointAgentId =
    entrypointNode && entrypointNode.type === 'agent' ? entrypointNode.agent : undefined;

  if (!entrypointAgentId) {
    return (
      `${header}\n\n` +
      `def build_root_agent():\n` +
      `    """This workflow's entrypoint node ("${workflow.entrypoint}") is not an agent node, so there is no agent to start a run from. Wire this up by hand."""\n` +
      `    raise NotImplementedError(${pythonStringLiteral(`Workflow "${workflowId}" has no agent entrypoint to run.`)})\n`
    );
  }

  const varName = toIdentifier(entrypointAgentId);
  return (
    `${header}\n\n` +
    `from ..agents.${varName} import build_${varName}_agent\n\n\n` +
    `def build_root_agent():\n` +
    `    """Builds the "${workflowId}" workflow's root agent — delegation to other agents happens via their own sub_agents wiring."""\n` +
    `    return build_${varName}_agent()\n`
  );
}
