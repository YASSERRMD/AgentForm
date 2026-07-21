import {
  generatedFileHeader,
  jsonSchemaToPythonParams,
  pythonStringLiteral,
  toIdentifier,
} from '@agentform/compiler';
import { resourceAddress, type IRTool } from '@agentform/ir';

/**
 * One tool becomes one plain, type-hinted Python function — verified as the
 * real, current ADK convention: `LlmAgent(tools=[...])` accepts plain
 * functions directly (no decorator needed), building a `FunctionDeclaration`
 * from the function's own name, docstring, and type hints (real ADK
 * orchestration code, confirmed by driving a real tool call through a fake
 * model and asserting the plain Python function actually executed). The
 * body is always a throwing stub, matching every other adapter's tool
 * generator: Agentform declares a tool's interface, never its implementation.
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
    `from typing import ${typingImports.join(', ')}\n\n\n` +
    `def ${functionName}(${params}) -> Any:\n` +
    `    """Agentform tool "${toolId}" (type: ${tool.type}).\n\n` +
    `    TODO: implement "${toolId}". Agentform declares this tool's interface\n` +
    `    only — the real implementation is application code.\n` +
    `    """\n` +
    `    raise NotImplementedError(${pythonStringLiteral(`Tool "${toolId}" is not yet implemented.`)})\n`
  );
}
