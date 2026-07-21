import { generatedFileHeader, toIdentifier } from '@agentform/compiler';
import { resourceAddress, type AgentformIR, type IRAgent, type IRModel } from '@agentform/ir';

/** `{file: ...}` instruction references are always pre-resolved to `{text: ...}` by IR time (see `@agentform/adapter-openai`'s equivalent helper). */
function instructionsText(agent: IRAgent): string {
  return 'text' in agent.instructions ? agent.instructions.text : '';
}

/**
 * Providers verified to resolve without any extra install beyond the base
 * `crewai` package (real construction tested against the installed
 * package): `openai` (CrewAI's own hard-coded default when a bare,
 * unprefixed model string is given), `gemini`/`google` (CrewAI normalizes
 * either provider name to the same native Gemini integration), and
 * `ollama`. CrewAI recognizes a much longer list of "native" provider
 * prefixes (anthropic, azure, bedrock, ...) plus a generic LiteLLM
 * fallback for anything else, but several of those raise a real
 * `ImportError` at *construction* time unless the matching
 * `crewai[<extra>]` (or `crewai[litellm]`) package is installed — verified
 * directly (`llm="anthropic/claude-..."` fails with
 * `Anthropic native provider not available, to install: uv add "crewai[anthropic]"`)
 * — which this adapter cannot know in advance for a free-form
 * `model.provider`.
 */
const NATIVE_NO_EXTRA_PROVIDERS = new Set(['openai', 'gemini', 'google', 'ollama']);

/**
 * CrewAI's own LiteLLM-style `"<provider>/<model>"` string format —
 * verified this is required, not cosmetic: a bare model string with no
 * provider prefix is *always* interpreted as an OpenAI model regardless of
 * the model name's actual origin (confirmed directly: even a nonsense
 * model name resolves to `provider='openai'` when unprefixed). Always
 * emitting the prefix avoids generated code silently calling the wrong
 * provider's API.
 */
function formatLlmString(model: IRModel): string {
  return `${model.provider}/${model.model}`;
}

/**
 * One agent becomes one `build_<id>_agent() -> Agent` factory function —
 * deliberately a function, not a module-level constant. Verified directly:
 * CrewAI resolves the `llm=` string into a real client class *eagerly*,
 * inside `Agent.__init__`'s pydantic post-init step, not lazily on first
 * use — so a module-level `agent = Agent(llm="anthropic/...", ...)` would
 * raise `ImportError` the instant this module is *imported* if the
 * matching extra isn't installed, crashing the whole generated project on
 * load rather than only when the agent is actually used (the same
 * import-time-side-effect hazard `@agentform/adapter-autogen` avoids for a
 * different reason).
 *
 * `role` maps directly to Agentform's own `role` field — both are
 * free-form strings; unlike AutoGen/ADK, CrewAI's `role` has no
 * Python-identifier constraint (verified: punctuation and spaces are
 * accepted as-is). CrewAI's required `goal`/`backstory` pair has no exact
 * Agentform equivalent, so: `goal` carries the agent's `instructions.text`
 * (the primary behavioral directive — closest in spirit to "what this
 * agent must accomplish"), and `backstory` carries the optional
 * `description`, or a neutral generated fallback when absent (CrewAI
 * requires a non-empty string there too).
 */
export function generateAgentFile(agentId: string, agent: IRAgent, ir: AgentformIR): string {
  const varName = toIdentifier(agentId);
  const model = ir.models.get(agent.model);
  const header = generatedFileHeader({
    commentPrefix: '#',
    sourceResourceAddresses: [resourceAddress('agent', agentId)],
  });

  const imports = ['from crewai import Agent'];
  const toolVars = (agent.tools ?? []).map(toIdentifier);
  for (const [index, toolId] of (agent.tools ?? []).entries()) {
    imports.push(`from ..tools.${toIdentifier(toolId)} import ${toolVars[index]}`);
  }

  const optionLines = [`        role=${JSON.stringify(agent.role)}`];
  optionLines.push(`        goal=${JSON.stringify(instructionsText(agent))}`);
  const backstory =
    agent.description ?? `An AI agent generated from the Agentform specification for "${agentId}".`;
  optionLines.push(`        backstory=${JSON.stringify(backstory)}`);

  if (model) {
    const llmLine = `        llm=${JSON.stringify(formatLlmString(model))}`;
    if (NATIVE_NO_EXTRA_PROVIDERS.has(model.provider.toLowerCase())) {
      optionLines.push(llmLine);
    } else {
      optionLines.push(
        `        # TODO: provider "${model.provider}" may need a matching CrewAI extra\n` +
          `        # (e.g. crewai[anthropic], crewai[azure-ai-inference]) or the generic\n` +
          `        # crewai[litellm] fallback — see\n` +
          `        # https://docs.crewai.com/en/learn/llm-connections.\n` +
          llmLine,
      );
    }
  }

  if (toolVars.length > 0) {
    optionLines.push(`        tools=[${toolVars.join(', ')}]`);
  }

  const delegationTargets = agent.delegation?.allowedAgents ?? [];
  if (delegationTargets.length > 0) {
    optionLines.push(
      `        # NOTE: CrewAI's delegation is crew-wide, not scoped to specific\n` +
        `        # coworkers — this agent will be able to delegate to *any* other\n` +
        `        # agent in the same crew, not only ${JSON.stringify(delegationTargets)}.\n` +
        `        # See the compatibility report for details.\n` +
        `        allow_delegation=True`,
    );
  }

  return (
    `${header}\n\n` +
    `${imports.join('\n')}\n\n\n` +
    `def build_${varName}_agent() -> Agent:\n` +
    `    """Builds the "${agentId}" agent."""\n` +
    `    return Agent(\n${optionLines.join(',\n')},\n    )\n`
  );
}
