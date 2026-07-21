import { generatedFileHeader, pythonStringLiteral, toIdentifier } from '@agentform/compiler';
import { resourceAddress, type IRModel } from '@agentform/ir';

/**
 * One model resource becomes one model-client builder function — deliberately
 * NOT a bare model-name string. Real-world verification found that
 * `AssistantAgent(model_client="gpt-4o")` (a bare string) constructs without
 * error, then fails much later with a confusing
 * `AttributeError: 'str' object has no attribute 'model_info'` the first
 * time the agent actually runs. Agentform's `model.provider` is a free-form
 * string (`@agentform/schema`), so there's no way to derive which
 * `autogen_ext.models.*` client class a given provider needs without
 * guessing — the honest alternative is a stub that fails immediately and
 * clearly, at the exact point of construction, with a pointer to AutoGen's
 * own model-client docs, rather than reproducing AutoGen's own confusing
 * failure mode.
 */
export function generateModelFile(modelId: string, model: IRModel): string {
  const functionName = `build_${toIdentifier(modelId)}_client`;
  const header = generatedFileHeader({
    commentPrefix: '#',
    sourceResourceAddresses: [resourceAddress('model', modelId)],
  });

  return (
    `${header}\n\n` +
    `from autogen_core.models import ChatCompletionClient\n\n\n` +
    `def ${functionName}() -> ChatCompletionClient:\n` +
    `    """Model client for "${modelId}" (provider: ${model.provider}, model: ${model.model}).\n\n` +
    `    TODO: construct a real ChatCompletionClient for this provider — e.g.\n` +
    `    autogen_ext.models.openai.OpenAIChatCompletionClient for an\n` +
    `    OpenAI-compatible endpoint. See\n` +
    `    https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/models.html\n` +
    `    for the full list of provider-specific client packages\n` +
    `    (autogen_ext.models.openai/anthropic/azure/ollama/...).\n` +
    `    """\n` +
    `    raise NotImplementedError(\n` +
    `        ${pythonStringLiteral(`TODO: construct a real model client for model "${modelId}" (provider: ${model.provider}).`)}\n` +
    `    )\n`
  );
}
