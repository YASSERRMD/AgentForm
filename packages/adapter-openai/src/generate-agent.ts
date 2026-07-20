import { generatedFileHeader, toIdentifier } from '@agentform/compiler';
import { resourceAddress, type AgentformIR, type IRAgent } from '@agentform/ir';
import { jsonSchemaToZodExpression } from './json-schema-to-zod.js';

/** By the time a document reaches the IR, `{ file: "..." }` instructions have already been resolved to `{ text: "..." }` (Phase 3's reference resolution runs before schema validation) — this only falls back to a placeholder in the structurally-impossible case that didn't happen, rather than crashing generation outright. */
function instructionsText(agent: IRAgent): string {
  return 'text' in agent.instructions ? agent.instructions.text : '';
}

/**
 * One agent becomes one `new Agent({...})` (`@openai/agents`'s real
 * `Agent` class — verified against the installed SDK). Handoffs come
 * from the agent's own `delegation.allowedAgents` (a direct, per-agent
 * schema field) rather than being inferred from workflow-node edges —
 * simpler, self-contained per agent, and matches "basic multi-agent
 * workflow" (Phase 8's scope) rather than attempting full workflow-graph
 * inference. Guardrails are referenced by name only (Agentform's schema
 * stores guardrail *references*, not logic) — see `generate-guardrail.ts`
 * for the stub each name becomes.
 */
export function generateAgentFile(agentId: string, agent: IRAgent, ir: AgentformIR): string {
  const varName = toIdentifier(agentId);
  const model = ir.models.get(agent.model);
  const header = generatedFileHeader({
    commentPrefix: '//',
    sourceResourceAddresses: [resourceAddress('agent', agentId)],
  });

  const imports = ["import { Agent } from '@openai/agents';"];
  const toolVars = (agent.tools ?? []).map(toIdentifier);
  for (const [index, toolId] of (agent.tools ?? []).entries()) {
    imports.push(`import { ${toolVars[index]} } from '../tools/${toIdentifier(toolId)}.js';`);
  }
  const handoffVars = (agent.delegation?.allowedAgents ?? []).map(toIdentifier);
  for (const [index, handoffId] of (agent.delegation?.allowedAgents ?? []).entries()) {
    imports.push(`import { ${handoffVars[index]} } from './${toIdentifier(handoffId)}.js';`);
  }
  const guardrailVars = (agent.guardrails ?? []).map(toIdentifier);
  if (guardrailVars.length > 0) {
    imports.push(`import { ${guardrailVars.join(', ')} } from '../policies/guardrails.js';`);
  }
  if (agent.outputSchema) {
    imports.push("import { z } from 'zod';");
  }

  const optionLines = [
    `  name: ${JSON.stringify(varName)}`,
    `  instructions: ${JSON.stringify(instructionsText(agent))}`,
  ];
  if (agent.description) {
    optionLines.push(`  handoffDescription: ${JSON.stringify(agent.description)}`);
  }
  if (model) {
    optionLines.push(`  model: ${JSON.stringify(model.model)}`);
    const modelSettings: string[] = [];
    if (model.temperature !== undefined) {
      modelSettings.push(`    temperature: ${model.temperature},`);
    }
    if (model.topP !== undefined) {
      modelSettings.push(`    topP: ${model.topP},`);
    }
    if (model.maxTokens !== undefined) {
      modelSettings.push(`    maxTokens: ${model.maxTokens},`);
    }
    if (modelSettings.length > 0) {
      optionLines.push(`  modelSettings: {\n${modelSettings.join('\n')}\n  }`);
    }
  }
  if (toolVars.length > 0) {
    optionLines.push(`  tools: [${toolVars.join(', ')}]`);
  }
  if (handoffVars.length > 0) {
    optionLines.push(`  handoffs: [${handoffVars.join(', ')}]`);
  }
  if (guardrailVars.length > 0) {
    optionLines.push(`  inputGuardrails: [${guardrailVars.join(', ')}]`);
  }
  if (agent.outputSchema) {
    optionLines.push(`  outputType: ${jsonSchemaToZodExpression(agent.outputSchema)}`);
  }

  return (
    `${header}\n` +
    `${imports.join('\n')}\n\n` +
    `export const ${varName} = new Agent({\n${optionLines.join(',\n')},\n});\n`
  );
}
