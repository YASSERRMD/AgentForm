import { generatedFileHeader, toIdentifier } from '@agentform/compiler';
import { resourceAddress, type IRAgent } from '@agentform/ir';
import { pythonStringLiteral } from './python-repr.js';

/** `{file: ...}` instruction references are always pre-resolved to `{text: ...}` by IR time (see `@agentform/adapter-openai`'s equivalent helper). */
function instructionsText(agent: IRAgent): string {
  return 'text' in agent.instructions ? agent.instructions.text : '';
}

/**
 * One agent becomes one LangGraph node FUNCTION — `(state: State) -> dict`,
 * the real node contract `StateGraph.add_node` expects (verified against
 * the installed `langgraph` package). Unlike the OpenAI adapter's `Agent`
 * object (fully realized by the SDK once configured), LangGraph has no
 * batteries-included "call this model with this prompt" node primitive that
 * doesn't also pull in a specific model-provider integration package —
 * Agentform's `model.provider` is a free-form string (`@agentform/schema`),
 * so guessing a LangChain integration package per provider would be
 * fabricated, unverified logic. The node body is therefore an honest
 * stub, matching `generate-tool.ts`'s `execute` stub.
 */
export function generateAgentFile(agentId: string, agent: IRAgent): string {
  const functionName = `${toIdentifier(agentId)}_node`;
  const header = generatedFileHeader({
    commentPrefix: '#',
    sourceResourceAddresses: [resourceAddress('agent', agentId)],
  });

  const docLines = [
    `Agent node for "${agentId}".`,
    '',
    `Role: ${agent.role}`,
    `Model: ${agent.model}`,
  ];
  if (agent.tools && agent.tools.length > 0) {
    docLines.push(`Tools: ${agent.tools.join(', ')}`);
  }
  if (agent.delegation?.allowedAgents && agent.delegation.allowedAgents.length > 0) {
    docLines.push(`May hand off to: ${agent.delegation.allowedAgents.join(', ')}`);
  }
  docLines.push(`Instructions: ${instructionsText(agent)}`);
  docLines.push(
    '',
    'TODO: call your model of choice with the instructions above and return a',
    'partial state update (e.g. {"messages": [...]}). Agentform declares this',
    "agent's interface only — the real implementation is application code.",
  );

  const docstring = docLines.map((line) => (line.length > 0 ? `    ${line}` : '')).join('\n');

  return (
    `${header}\n\n` +
    `from typing import Any\n\n` +
    `from ..state import State\n\n\n` +
    `def ${functionName}(state: State) -> dict[str, Any]:\n` +
    `    """\n${docstring}\n    """\n` +
    `    raise NotImplementedError(${pythonStringLiteral(`Agent "${agentId}" is not yet implemented.`)})\n`
  );
}
