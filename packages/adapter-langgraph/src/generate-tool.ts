import {
  generatedFileHeader,
  jsonSchemaToPythonParams,
  pythonStringLiteral,
  toIdentifier,
} from '@agentform/compiler';
import { resourceAddress, type IRTool } from '@agentform/ir';

/**
 * One tool becomes one `@tool`-decorated function (`langchain_core.tools`'s
 * real `tool` decorator, re-exported by `langgraph`'s own dependency
 * closure — verified against the installed package, not guessed). Agentform's
 * `Tool` type has no `description` field, so a synthesized fallback names
 * the tool's id and type, honestly signaling it's auto-generated. The
 * function body is always a throwing stub: Agentform declares a tool's
 * *interface*, never its implementation.
 */
export function generateToolFile(toolId: string, tool: IRTool): string {
  const functionName = toIdentifier(toolId);
  const header = generatedFileHeader({
    commentPrefix: '#',
    sourceResourceAddresses: [resourceAddress('tool', toolId)],
  });
  const params = jsonSchemaToPythonParams(tool.inputSchema);
  // The `-> Any` return annotation always needs `Any`; params may pull in more.
  const typingImports = ['Any', ...['Optional', 'Literal'].filter((name) => params.includes(name))];

  const importLines = [
    `from typing import ${typingImports.join(', ')}`,
    '',
    'from langchain_core.tools import tool',
  ];

  return (
    `${header}\n\n` +
    `${importLines.join('\n')}\n\n\n` +
    `@tool\n` +
    `def ${functionName}(${params}) -> Any:\n` +
    `    """Agentform tool "${toolId}" (type: ${tool.type}).\n\n` +
    `    TODO: implement "${toolId}". Agentform declares this tool's interface\n` +
    `    only — the real implementation is application code.\n` +
    `    """\n` +
    `    raise NotImplementedError(${pythonStringLiteral(`Tool "${toolId}" is not yet implemented.`)})\n`
  );
}
