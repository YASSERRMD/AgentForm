import { generatedFileHeader, toIdentifier } from '@agentform/compiler';
import { resourceAddress, type AgentformIR, type IRAgent } from '@agentform/ir';

/** `{file: ...}` instruction references are always pre-resolved to `{text: ...}` by IR time (see `@agentform/adapter-openai`'s equivalent helper). */
function instructionsText(agent: IRAgent): string {
  return 'text' in agent.instructions ? agent.instructions.text : '';
}

/**
 * One agent becomes one `build_<id>_agent() -> AssistantAgent` factory
 * function — deliberately a function, not a module-level constant.
 * `AssistantAgent`'s own construction is fully real (verified against the
 * installed `autogen-agentchat` package), but it needs a real
 * `model_client` object, which — since Agentform's `model.provider` is
 * free-form — is a stub that raises (`generate-model.ts`). A module-level
 * `agent = AssistantAgent(model_client=build_x_client(), ...)` would call
 * that raising stub the instant this module is *imported*, crashing the
 * whole generated project on load rather than only when the agent is
 * actually used. Wrapping construction in a function defers that until
 * something actually calls it, matching every other adapter's discipline
 * of never running fabricated logic as an import-time side effect.
 *
 * `name` must be a valid Python identifier — verified directly against the
 * installed package (a hyphenated name raises `ValueError` at
 * construction) — so both this agent's own name and every handoff target
 * use `toIdentifier`, unlike LangGraph's plain-string node names.
 */
export function generateAgentFile(agentId: string, agent: IRAgent, ir: AgentformIR): string {
  const varName = toIdentifier(agentId);
  const model = ir.models.get(agent.model);
  const header = generatedFileHeader({
    commentPrefix: '#',
    sourceResourceAddresses: [resourceAddress('agent', agentId)],
  });

  const imports = ['from autogen_agentchat.agents import AssistantAgent'];
  const toolVars = (agent.tools ?? []).map(toIdentifier);
  for (const [index, toolId] of (agent.tools ?? []).entries()) {
    imports.push(`from ..tools.${toIdentifier(toolId)} import ${toolVars[index]}`);
  }
  const modelBuilderName = model ? `build_${toIdentifier(agent.model)}_client` : undefined;
  if (model && modelBuilderName) {
    imports.push(`from ..models.${toIdentifier(agent.model)} import ${modelBuilderName}`);
  }

  const optionLines = [`        name=${JSON.stringify(varName)}`];
  if (modelBuilderName) {
    optionLines.push(`        model_client=${modelBuilderName}()`);
  }
  if (agent.description) {
    optionLines.push(`        description=${JSON.stringify(agent.description)}`);
  }
  optionLines.push(`        system_message=${JSON.stringify(instructionsText(agent))}`);
  if (toolVars.length > 0) {
    optionLines.push(`        tools=[${toolVars.join(', ')}]`);
  }
  const handoffVars = (agent.delegation?.allowedAgents ?? []).map((id) =>
    JSON.stringify(toIdentifier(id)),
  );
  if (handoffVars.length > 0) {
    optionLines.push(`        handoffs=[${handoffVars.join(', ')}]`);
  }

  return (
    `${header}\n\n` +
    `${imports.join('\n')}\n\n\n` +
    `def build_${varName}_agent() -> AssistantAgent:\n` +
    `    """Builds the "${agentId}" agent."""\n` +
    `    return AssistantAgent(\n${optionLines.join(',\n')},\n    )\n`
  );
}
