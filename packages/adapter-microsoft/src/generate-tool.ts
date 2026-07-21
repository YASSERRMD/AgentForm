import { generatedFileHeader, toIdentifier, toPascalCase } from '@agentform/compiler';
import { resourceAddress, type IRTool } from '@agentform/ir';
import { jsonSchemaToCSharpParams } from './json-schema-to-csharp.js';

/**
 * One tool becomes one static class exposing an `AsAIFunction()` factory —
 * verified against the installed `Microsoft.Agents.AI`/`Microsoft.Extensions.AI`
 * packages: `AIFunctionFactory.Create(method, name:, description:)` accepts
 * a plain static method *group* directly (no attribute-based description
 * needed — passing `name`/`description` as explicit arguments is
 * sufficient and was confirmed to produce the correct JSON schema from the
 * method's own parameter types alone). The exposed tool `name:` uses the
 * same `toIdentifier` (snake_case) convention as every Python-targeting
 * adapter, so the same logical tool presents the same callable name to a
 * model across every Agentform target. The method itself is always a
 * throwing stub: Agentform declares a tool's interface, never its
 * implementation.
 */
export function generateToolFile(toolId: string, tool: IRTool): string {
  const className = `${toPascalCase(toolId)}Tool`;
  const header = generatedFileHeader({
    commentPrefix: '//',
    sourceResourceAddresses: [resourceAddress('tool', toolId)],
  });
  const params = jsonSchemaToCSharpParams(tool.inputSchema);
  const description = `Agentform tool "${toolId}" (type: ${tool.type}). TODO: implement "${toolId}" — Agentform declares this tool's interface only, the real implementation is application code.`;

  return (
    `${header}\n\n` +
    `using Microsoft.Extensions.AI;\n\n` +
    `namespace GeneratedApp.Tools;\n\n` +
    `public static class ${className}\n` +
    `{\n` +
    `    public static AIFunction AsAIFunction() =>\n` +
    `        AIFunctionFactory.Create(Run, name: ${JSON.stringify(toIdentifier(toolId))}, description: ${JSON.stringify(description)});\n\n` +
    `    public static object Run(${params})\n` +
    `    {\n` +
    `        throw new NotImplementedException(${JSON.stringify(`Tool "${toolId}" is not yet implemented.`)});\n` +
    `    }\n` +
    `}\n`
  );
}
