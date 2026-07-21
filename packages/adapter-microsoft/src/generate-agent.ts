import { generatedFileHeader, toPascalCase } from '@agentform/compiler';
import { resourceAddress, type AgentformIR, type IRAgent } from '@agentform/ir';
import { toCamelCase } from './csharp-identifiers.js';

/** `{file: ...}` instruction references are always pre-resolved to `{text: ...}` by IR time. */
function instructionsText(agent: IRAgent): string {
  return 'text' in agent.instructions ? agent.instructions.text : '';
}

/**
 * One agent becomes one static class exposing a `Build()` factory —
 * mirroring every other adapter's factory-function discipline, so the
 * (always-throwing) model-client stub's exception only surfaces when
 * something actually calls `Build()`, not as a static-initializer side
 * effect of merely referencing the class. `instructions`/`description`/
 * `tools` map directly onto `IChatClient.AsAIAgent(...)`'s own named
 * parameters (verified against the installed package: `instructions:`,
 * `name:`, `description:`, `tools:` are all real, optional parameters) —
 * unlike CrewAI's `goal`/`backstory` split, Agentform's `description` has
 * a direct, single-purpose home here, so no fallback text is needed.
 * `name:` accepts an unmodified hyphenated id with no error (verified
 * directly) — unlike AutoGen/ADK's Python identifier constraint, so
 * `agent.id` is used as-is rather than through `toIdentifier`.
 */
export function generateAgentFile(agentId: string, agent: IRAgent, ir: AgentformIR): string {
  const className = `${toPascalCase(agentId)}Agent`;
  const model = ir.models.get(agent.model);
  const header = generatedFileHeader({
    commentPrefix: '//',
    sourceResourceAddresses: [resourceAddress('agent', agentId)],
  });

  const imports = ['using Microsoft.Agents.AI;', 'using Microsoft.Extensions.AI;'];
  if (model) {
    imports.push('using GeneratedApp.Models;');
  }
  const toolIds = agent.tools ?? [];
  if (toolIds.length > 0) {
    imports.push('using GeneratedApp.Tools;');
  }

  const optionLines = [`            instructions: ${JSON.stringify(instructionsText(agent))}`];
  optionLines.push(`            name: ${JSON.stringify(agentId)}`);
  if (agent.description) {
    optionLines.push(`            description: ${JSON.stringify(agent.description)}`);
  }
  if (toolIds.length > 0) {
    const toolExprs = toolIds.map((toolId) => `${toPascalCase(toolId)}Tool.AsAIFunction()`);
    optionLines.push(`            tools: [${toolExprs.join(', ')}]`);
  }

  const modelClassName = model ? `${toPascalCase(agent.model)}Model` : undefined;
  const body = modelClassName
    ? `        IChatClient chatClient = ${modelClassName}.BuildChatClient();\n` +
      `        return chatClient.AsAIAgent(\n${optionLines.join(',\n')}\n        );\n`
    : `        throw new NotImplementedException(${JSON.stringify(`Agent "${agentId}" references an undeclared model "${agent.model}".`)});\n`;

  return (
    `${header}\n\n` +
    `${imports.join('\n')}\n\n` +
    `namespace GeneratedApp.Agents;\n\n` +
    `public static class ${className}\n` +
    `{\n` +
    `    public static AIAgent Build()\n` +
    `    {\n` +
    `${body}` +
    `    }\n` +
    `}\n`
  );
}

/** Exported for `generate-workflow.ts`, which needs each participating agent's C# class name without re-deriving the same convention. */
export function agentClassName(agentId: string): string {
  return `${toPascalCase(agentId)}Agent`;
}

/** A safe C# local-variable name for an agent instance — unlike `name:` (a runtime string with no constraint), this one *is* a real C# identifier. */
export function agentLocalName(agentId: string): string {
  return toCamelCase(agentId);
}
