import {
  generatedFileHeader,
  jsonSchemaToPythonParams,
  pythonStringLiteral,
  toIdentifier,
} from '@agentform/compiler';
import { resourceAddress, type IRTool } from '@agentform/ir';

/**
 * One tool becomes one `@tool(...)`-decorated Python function — CrewAI's
 * own convention for turning a plain function into a `BaseTool` (verified
 * against the installed `crewai` package: `crewai.tools.tool` wraps a
 * typed function directly, deriving its parameter schema from the
 * function's own type hints, the same bare-function-first spirit as
 * AutoGen/ADK's tool convention — except CrewAI *requires* the decorator,
 * and *requires* a non-empty docstring, raising a real `ValueError` at
 * decoration time otherwise). The generated docstring is always non-empty
 * — Agentform's `Tool` type has no free-text description field to draw
 * from, so it's synthesized from the tool's id and type, same as every
 * other adapter's tool docstring. The body is always a throwing stub:
 * Agentform declares a tool's interface, never its implementation.
 */
export function generateToolFile(toolId: string, tool: IRTool): string {
  const functionName = toIdentifier(toolId);
  const header = generatedFileHeader({
    commentPrefix: '#',
    sourceResourceAddresses: [resourceAddress('tool', toolId)],
  });
  const params = jsonSchemaToPythonParams(tool.inputSchema);
  const typingImports = ['Any', ...['Optional', 'Literal'].filter((name) => params.includes(name))];

  return (
    `${header}\n\n` +
    `from typing import ${typingImports.join(', ')}\n\n` +
    `from crewai.tools import tool\n\n\n` +
    `@tool(${JSON.stringify(functionName)})\n` +
    `def ${functionName}(${params}) -> Any:\n` +
    `    """Agentform tool "${toolId}" (type: ${tool.type}).\n\n` +
    `    TODO: implement "${toolId}". Agentform declares this tool's interface\n` +
    `    only — the real implementation is application code.\n` +
    `    """\n` +
    `    raise NotImplementedError(${pythonStringLiteral(`Tool "${toolId}" is not yet implemented.`)})\n`
  );
}
