import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { GenAIProvider } from '../provider.js';

export interface AnthropicProviderOptions {
  /** Falls back to `ANTHROPIC_API_KEY` (the SDK's own default) when omitted — never read or logged by this package itself. */
  readonly apiKey?: string;
  readonly model?: string;
  readonly maxTokens?: number;
}

const DEFAULT_MODEL = 'claude-sonnet-5';
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Real provider using the SDK's own first-class structured-output helper
 * (`client.messages.parse` + `zodOutputFormat`, verified against the
 * installed `.d.ts` before writing this — not assumed or reverse
 * engineered from training data). Hands the real Zod schema straight to
 * the SDK; `parsed_output` comes back already schema-conformant, so there
 * is no hand-rolled JSON parsing or freeform-text extraction anywhere in
 * this file.
 *
 * Not live-tested with a real key during this phase's build, by design —
 * this package never handles a real API key itself (the standing
 * credential-handling rule this whole project follows), so live
 * verification is an explicit, separate, user-initiated step, the same
 * hand-off already used for the framework adapters' real-provider testing
 * earlier in this project's history.
 */
export function createAnthropicProvider(options: AnthropicProviderOptions = {}): GenAIProvider {
  const client = new Anthropic({ apiKey: options.apiKey });
  return {
    name: 'anthropic',
    async generate(request) {
      const message = await client.messages.parse({
        model: options.model ?? DEFAULT_MODEL,
        max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: request.systemPrompt,
        messages: [
          ...(request.history ?? []).map((turn) => ({ role: turn.role, content: turn.content })),
          { role: 'user' as const, content: request.userPrompt },
        ],
        output_config: { format: zodOutputFormat(request.schema) },
      });
      if (message.parsed_output === null) {
        throw new Error('AnthropicProvider: the model did not return parseable structured output');
      }
      return message.parsed_output;
    },
  };
}
