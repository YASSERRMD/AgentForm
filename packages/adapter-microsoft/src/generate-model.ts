import { generatedFileHeader, toPascalCase } from '@agentform/compiler';
import { resourceAddress, type IRModel } from '@agentform/ir';

/**
 * One model resource becomes one chat-client builder class — deliberately
 * NOT a construction of a real provider client. Agentform's `model.provider`
 * is a free-form string (`@agentform/schema`), so there's no way to derive
 * which concrete `IChatClient` implementation a given provider needs
 * without guessing — the same reasoning `@agentform/adapter-autogen`
 * applies to its own model-client stub. The honest alternative is a stub
 * that fails immediately and clearly, at the exact point of construction,
 * with a pointer to a real, already-referenced package
 * (`Microsoft.Agents.AI.OpenAI`, pinned in the generated `.csproj` for
 * exactly this reason) the user can wire up in two lines.
 */
export function generateModelFile(modelId: string, model: IRModel): string {
  const className = `${toPascalCase(modelId)}Model`;
  const header = generatedFileHeader({
    commentPrefix: '//',
    sourceResourceAddresses: [resourceAddress('model', modelId)],
  });

  return (
    `${header}\n\n` +
    `using Microsoft.Extensions.AI;\n\n` +
    `namespace GeneratedApp.Models;\n\n` +
    `public static class ${className}\n` +
    `{\n` +
    `    // Model "${modelId}" (provider: ${model.provider}, model: ${model.model}).\n` +
    `    //\n` +
    `    // TODO: construct a real IChatClient for this provider — e.g. for OpenAI\n` +
    `    // (already referenced in this project's .csproj):\n` +
    `    //   using OpenAI;\n` +
    `    //   var apiKey = Environment.GetEnvironmentVariable("OPENAI_API_KEY")\n` +
    `    //       ?? throw new InvalidOperationException("OPENAI_API_KEY is not set.");\n` +
    `    //   return new OpenAIClient(apiKey).GetChatClient(${JSON.stringify(model.model)}).AsIChatClient();\n` +
    `    // For other providers see Microsoft Agent Framework's model integration docs.\n` +
    `    public static IChatClient BuildChatClient()\n` +
    `    {\n` +
    `        throw new NotImplementedException(\n` +
    `            ${JSON.stringify(`TODO: construct a real IChatClient for model "${modelId}" (provider: ${model.provider}).`)});\n` +
    `    }\n` +
    `}\n`
  );
}
