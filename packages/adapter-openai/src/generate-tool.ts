import { generatedFileHeader, toIdentifier } from '@agentform/compiler';
import { resourceAddress, type IRTool } from '@agentform/ir';
import { durationToMs } from './duration.js';
import { jsonSchemaToZodExpression } from './json-schema-to-zod.js';

/**
 * One tool becomes one `tool()` call (`@openai/agents`'s real `tool()`
 * helper — verified against the installed SDK, not guessed). Agentform's
 * `Tool` type has no `description` field (only `Agent` does), which the
 * SDK requires — a synthesized fallback description names the tool's id
 * and type, honestly signaling it's auto-generated rather than authored.
 * `execute` is always a throwing stub: Agentform declares a tool's
 * *interface*, never its implementation, so there is nothing real to
 * generate there — a human fills it in.
 */
export function generateToolFile(toolId: string, tool: IRTool): string {
  const varName = toIdentifier(toolId);
  const header = generatedFileHeader({
    commentPrefix: '//',
    sourceResourceAddresses: [resourceAddress('tool', toolId)],
  });
  const parametersExpression = jsonSchemaToZodExpression(tool.inputSchema);
  const needsApproval = tool.sideEffect === 'destructive' || tool.type === 'humanApproval';
  const timeoutMs = tool.timeout ? durationToMs(tool.timeout) : undefined;

  const optionLines = [
    `  name: ${JSON.stringify(varName)}`,
    `  description: ${JSON.stringify(`Agentform tool "${toolId}" (type: ${tool.type})`)}`,
    `  parameters: ${parametersExpression}`,
  ];
  if (needsApproval) {
    optionLines.push('  needsApproval: true');
  }
  if (timeoutMs !== undefined) {
    optionLines.push(`  timeoutMs: ${timeoutMs}`);
  }
  optionLines.push(
    `  execute: async (input: unknown) => {\n` +
      `    // TODO: implement "${toolId}" (${tool.type}). Agentform declares this\n` +
      `    // tool's interface only — the real implementation is application code.\n` +
      `    throw new Error(${JSON.stringify(`Tool "${toolId}" is not yet implemented.`)});\n` +
      `  }`,
  );

  return (
    `${header}\n` +
    `import { tool } from '@openai/agents';\n` +
    `import { z } from 'zod';\n\n` +
    `export const ${varName} = tool({\n${optionLines.join(',\n')},\n});\n`
  );
}
