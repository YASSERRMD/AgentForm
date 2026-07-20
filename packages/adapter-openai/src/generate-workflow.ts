import { generatedFileHeader, toIdentifier } from '@agentform/compiler';
import { resourceAddress, type IRWorkflow } from '@agentform/ir';

/**
 * One workflow becomes one `runWorkflow()` function that starts the
 * entrypoint agent via `@openai/agents`'s real `run()` function. Handoffs
 * between agents (§13.1 "basic multi-agent workflow") are wired at the
 * agent level (`generate-agent.ts`'s `handoffs` from `delegation.allowedAgents`)
 * — the workflow file's job is only "which agent do we start with," not
 * reproducing the full node/edge graph, which the compatibility checker
 * has already confirmed contains nothing beyond `agent`/`tool`/`terminate`
 * nodes before this file is ever generated.
 */
export function generateWorkflowFile(workflowId: string, workflow: IRWorkflow): string {
  const header = generatedFileHeader({
    commentPrefix: '//',
    sourceResourceAddresses: [resourceAddress('workflow', workflowId)],
  });
  const entrypointNode = workflow.nodes.get(workflow.entrypoint);
  const entrypointAgentId =
    entrypointNode && entrypointNode.type === 'agent' ? entrypointNode.agent : undefined;
  const fnName = toIdentifier(`run_${workflowId}`);

  if (!entrypointAgentId) {
    return (
      `${header}\n` +
      `// This workflow's entrypoint node ("${workflow.entrypoint}") is not an agent node,\n` +
      `// so there is no agent to start a run from. Wire this up by hand.\n` +
      `export async function ${fnName}(_input: string): Promise<never> {\n` +
      `  throw new Error(${JSON.stringify(`Workflow "${workflowId}" has no agent entrypoint to run.`)});\n` +
      `}\n`
    );
  }

  const agentVar = toIdentifier(entrypointAgentId);
  return (
    `${header}\n` +
    `import { run } from '@openai/agents';\n` +
    `import { ${agentVar} } from '../agents/${toIdentifier(entrypointAgentId)}.js';\n\n` +
    `export async function ${fnName}(input: string) {\n` +
    `  return run(${agentVar}, input);\n` +
    `}\n`
  );
}
