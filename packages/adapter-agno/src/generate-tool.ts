import {
  generatedFileHeader,
  jsonSchemaToPythonParams,
  pythonStringLiteral,
  toIdentifier,
} from '@agentform/compiler';
import { resourceAddress, type IRTool } from '@agentform/ir';

/**
 * One tool becomes one `@tool(...)`-decorated Python function — Agno's own
 * convention for turning a plain function into a callable tool (verified
 * against the installed `agno` package: `agno.tools.tool` accepts a bare
 * `@tool` or `@tool(name=..., requires_confirmation=..., ...)`, both
 * constructed successfully). `requires_confirmation=True` is set whenever
 * the tool is `sideEffect: destructive` or is itself a `humanApproval`-type
 * tool — Agno's own real blocking human-in-the-loop gate at the tool
 * level, the same mechanism `@agentform/policy`'s `AF004` exists to push
 * every destructive action behind. The body is always a throwing stub:
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

  const requiresConfirmation = tool.type === 'humanApproval' || tool.sideEffect === 'destructive';
  const decoratorArgs = [`name=${JSON.stringify(functionName)}`];
  if (requiresConfirmation) {
    decoratorArgs.push('requires_confirmation=True');
  }

  return (
    `${header}\n\n` +
    `from typing import ${typingImports.join(', ')}\n\n` +
    `from agno.tools import tool\n\n\n` +
    `@tool(${decoratorArgs.join(', ')})\n` +
    `def ${functionName}(${params}) -> Any:\n` +
    `    """Agentform tool "${toolId}" (type: ${tool.type}).\n\n` +
    `    TODO: implement "${toolId}". Agentform declares this tool's interface\n` +
    `    only — the real implementation is application code.\n` +
    `    """\n` +
    `    raise NotImplementedError(${pythonStringLiteral(`Tool "${toolId}" is not yet implemented.`)})\n`
  );
}
