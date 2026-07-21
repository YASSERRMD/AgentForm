import { generatedFileHeader, toIdentifier } from '@agentform/compiler';
import { resourceAddress, type AgentformIR, type IRAgent } from '@agentform/ir';

/** `{file: ...}` instruction references are always pre-resolved to `{text: ...}` by IR time (see `@agentform/adapter-openai`'s equivalent helper). */
function instructionsText(agent: IRAgent): string {
  return 'text' in agent.instructions ? agent.instructions.text : '';
}

/** ADK natively resolves a plain model-name string for its own Gemini models (the SDK's own quickstart uses `model="gemini-flash-latest"` directly, verified) — a case-insensitive match on `provider` names it a real, working value rather than a stub. */
function isGoogleProvider(provider: string): boolean {
  return ['google', 'gemini', 'google-genai', 'vertex', 'vertexai'].includes(
    provider.toLowerCase(),
  );
}

/**
 * One agent becomes one `build_<id>_agent() -> LlmAgent` factory function.
 * Unlike AutoGen, nothing in ADK's `LlmAgent` construction *raises* by
 * default — its `model` field accepts a plain string directly, so a
 * factory function isn't needed to defer a stub failure. It's still a
 * factory, defensively: an agent's own delegation targets are *other*
 * agent-file factory functions, and verified directly — a real
 * `ImportError: cannot import name ... from partially initialized module`
 * — that two agent files importing a module-level constant from each other
 * (mutual delegation) is a real circular-import failure in Python, unlike
 * OpenAI's ES modules. Deferring construction into a function sidesteps
 * this: only the function *reference* needs to exist at import time, not
 * its body's result.
 *
 * `name` must be a valid Python identifier — verified directly (a
 * hyphenated name raises a real `pydantic.ValidationError` at
 * construction).
 */
export function generateAgentFile(agentId: string, agent: IRAgent, ir: AgentformIR): string {
  const varName = toIdentifier(agentId);
  const model = ir.models.get(agent.model);
  const header = generatedFileHeader({
    commentPrefix: '#',
    sourceResourceAddresses: [resourceAddress('agent', agentId)],
  });

  const imports = ['from google.adk.agents import LlmAgent'];
  const toolVars = (agent.tools ?? []).map(toIdentifier);
  for (const [index, toolId] of (agent.tools ?? []).entries()) {
    imports.push(`from ..tools.${toIdentifier(toolId)} import ${toolVars[index]}`);
  }
  const delegationTargets = agent.delegation?.allowedAgents ?? [];
  for (const targetId of delegationTargets) {
    imports.push(
      `from ..agents.${toIdentifier(targetId)} import build_${toIdentifier(targetId)}_agent`,
    );
  }

  const optionLines = [`        name=${JSON.stringify(varName)}`];
  if (model && !isGoogleProvider(model.provider)) {
    optionLines.push(
      `        # TODO: verify this model identifier is valid for provider "${model.provider}" —\n` +
        `        # ADK natively resolves Gemini model names as plain strings; other\n` +
        `        # providers typically need a real BaseLlm instance instead (see ADK's\n` +
        `        # model configuration docs).\n` +
        `        model=${JSON.stringify(model.model)}`,
    );
  } else if (model) {
    optionLines.push(`        model=${JSON.stringify(model.model)}`);
  }
  if (agent.description) {
    optionLines.push(`        description=${JSON.stringify(agent.description)}`);
  }
  optionLines.push(`        instruction=${JSON.stringify(instructionsText(agent))}`);
  if (toolVars.length > 0) {
    optionLines.push(`        tools=[${toolVars.join(', ')}]`);
  }
  if (delegationTargets.length > 0) {
    const subAgentCalls = delegationTargets
      .map((id) => `build_${toIdentifier(id)}_agent()`)
      .join(', ');
    optionLines.push(`        sub_agents=[${subAgentCalls}]`);
  }

  return (
    `${header}\n\n` +
    `${imports.join('\n')}\n\n\n` +
    `def build_${varName}_agent() -> LlmAgent:\n` +
    `    """Builds the "${agentId}" agent."""\n` +
    `    return LlmAgent(\n${optionLines.join(',\n')},\n    )\n`
  );
}
