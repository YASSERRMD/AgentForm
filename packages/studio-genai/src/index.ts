/**
 * Entirely server-side by design (§34.3: "The frontend never talks to
 * model providers directly. All GenAI goes through studio-server →
 * packages/studio-genai") — unlike studio-core/studio-design, this
 * package has no browser-safe/Node-only split to worry about, because
 * `apps/studio-web` never imports it at all, not even for types.
 */
export type { GenAIHistoryMessage, GenAIProvider, GenAIRequest } from './provider.js';

export {
  createFakeProvider,
  type FakeProvider,
  type FakeProviderOptions,
} from './providers/fake-provider.js';
export {
  createAnthropicProvider,
  type AnthropicProviderOptions,
} from './providers/anthropic-provider.js';

export {
  generatedSpecProposalSchema,
  promptToSpec,
  type GeneratedSpecProposal,
  type PromptToSpecOptions,
  type PromptToSpecResult,
  type SkippedResource,
} from './prompt-to-spec.js';

export {
  promptToDesign,
  type PromptToDesignOptions,
  type PromptToDesignResult,
} from './prompt-to-design.js';

export {
  chatEditSpec,
  chatSpecResponseSchema,
  type ChatSpecOptions,
  type ChatSpecResponse,
  type ChatSpecResult,
} from './chat-spec.js';

export {
  chatEditDesign,
  chatDesignResponseSchema,
  type ChatDesignOptions,
  type ChatDesignResponse,
  type ChatDesignResult,
} from './chat-design.js';
