import { generatedFileHeader, toIdentifier } from '@agentform/compiler';
import { resourceAddress, type AgentformIR, type IRAgent, type IRModel } from '@agentform/ir';

/** `{file: ...}` instruction references are always pre-resolved to `{text: ...}` by IR time (see `@agentform/adapter-openai`'s equivalent helper). */
function instructionsText(agent: IRAgent): string {
  return 'text' in agent.instructions ? agent.instructions.text : '';
}

/**
 * `agno.models.<provider>` classes verified to construct against the real
 * installed `agno` package (`Agno(id=...)`, reading its own well-known API
 * key env var automatically — `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/
 * `GOOGLE_API_KEY` respectively, verified directly against each class's
 * source). `agno` ships model classes for 50+ providers (`agno/models/`),
 * but only these three map to Agentform's own most common `model.provider`
 * values without guessing at an import path this adapter hasn't verified.
 */
const KNOWN_PROVIDER_MODELS: Readonly<
  Record<string, { readonly module: string; readonly className: string }>
> = {
  openai: { module: 'agno.models.openai', className: 'OpenAIChat' },
  anthropic: { module: 'agno.models.anthropic', className: 'Claude' },
  google: { module: 'agno.models.google', className: 'Gemini' },
};

function modelConstructorLine(model: IRModel | undefined): {
  readonly line: string;
  readonly importLine?: string;
} {
  if (!model) {
    return { line: 'None  # TODO: no model resolved for this agent' };
  }
  const known = KNOWN_PROVIDER_MODELS[model.provider.toLowerCase()];
  if (known) {
    return {
      line: `${known.className}(id=${JSON.stringify(model.model)})`,
      importLine: `from ${known.module} import ${known.className}`,
    };
  }
  return {
    line:
      `None  # TODO: provider "${model.provider}" has no verified agno.models class wired\n` +
      `        #       here yet — see https://docs.agno.com/models for the full provider list\n` +
      `        #       and pick the matching agno.models.<provider> class`,
  };
}

/**
 * One agent becomes one `build_<id>_agent() -> Agent` factory function, a
 * real `agno.agent.Agent` (verified directly against the installed
 * package — construction, not just signature inspection). Deliberately a
 * function rather than a module-level constant, matching every sibling
 * Python adapter's precedent: a provider Agno has no verified model class
 * for yet resolves to `model=None` with a TODO rather than crashing the
 * whole module on import.
 *
 * Field mapping: `instructions` maps directly to Agno's own `instructions`
 * (both are system-prompt-shaping behavioral direction). Agentform's
 * `role` (required) and optional `description` both map into Agno's
 * `description` — Agno's own `role` field means something different
 * (verified against the installed package's source: it's "the role of
 * this agent *in a Team*", `agno/agent/agent.py`'s own comment, populated
 * only when the agent is a Team member) and this adapter doesn't generate
 * Team objects, so using it for Agentform's general-purpose `role` would
 * be a category error, not a translation. `retry.maxAttempts`/
 * `retry.backoff === 'exponential'` map directly to Agno's own
 * `retries`/`exponential_backoff` agent-level fields; `limits`
 * (maxSteps/timeout/maxCostUsd) has no matching Agno `Agent` constructor
 * field to translate to, so it's left untranslated rather than
 * approximated.
 */
export function generateAgentFile(agentId: string, agent: IRAgent, ir: AgentformIR): string {
  const varName = toIdentifier(agentId);
  const model = ir.models.get(agent.model);
  const header = generatedFileHeader({
    commentPrefix: '#',
    sourceResourceAddresses: [resourceAddress('agent', agentId)],
  });

  const imports = ['from agno.agent import Agent'];
  const { line: modelLine, importLine: modelImportLine } = modelConstructorLine(model);
  if (modelImportLine) {
    imports.push(modelImportLine);
  }

  const toolVars = (agent.tools ?? []).map(toIdentifier);
  for (const [index, toolId] of (agent.tools ?? []).entries()) {
    imports.push(`from ..tools.${toIdentifier(toolId)} import ${toolVars[index]}`);
  }

  const description = agent.description ? `${agent.role} — ${agent.description}` : agent.role;

  const optionLines = [
    `        name=${JSON.stringify(agentId)}`,
    `        model=${modelLine}`,
    `        description=${JSON.stringify(description)}`,
    `        instructions=${JSON.stringify(instructionsText(agent))}`,
  ];

  if (toolVars.length > 0) {
    optionLines.push(`        tools=[${toolVars.join(', ')}]`);
  }

  if (agent.retry?.maxAttempts !== undefined) {
    optionLines.push(`        retries=${JSON.stringify(agent.retry.maxAttempts)}`);
    if (agent.retry.backoff === 'exponential') {
      optionLines.push(`        exponential_backoff=True`);
    }
  }

  const delegationTargets = agent.delegation?.allowedAgents ?? [];
  if (delegationTargets.length > 0) {
    optionLines.push(
      `        # NOTE: this agent declares delegation to ${JSON.stringify(delegationTargets)},\n` +
        `        # but this adapter generates a plain Agent, not an agno.team.Team —\n` +
        `        # Team(members=[...], mode=TeamMode.coordinate) is Agno's real\n` +
        `        # delegation construct. See the compatibility report for details.`,
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
