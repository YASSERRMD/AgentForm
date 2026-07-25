import type { GenAIProvider } from '@agentform/studio-genai';

const NOTHING_GENERATED_MESSAGE =
  'GenAI is running in local demo mode (no ANTHROPIC_API_KEY configured) — nothing was generated. Set ANTHROPIC_API_KEY and AGENTFORM_STUDIO_GENAI_PROVIDER=anthropic to enable real generation.';

/**
 * The zero-key-required half of `AGENTFORM_STUDIO_GENAI_PROVIDER`
 * (see config.ts): a real, honest stand-in, not a mock — it never
 * pretends to have generated anything. For any schema it's asked to
 * satisfy, it returns the first of a few generically "nothing to
 * propose" shapes that happens to validate, so `promptToSpec` /
 * `promptToDesign` (Phase 17's add-only shape) and `chatEditSpec` /
 * `chatEditDesign` (Phase 18's `{type:'message'|'proposal', ...}`
 * discriminated union) all complete normally, and the caller's own real
 * validation pipeline still runs end to end. This is what a fresh
 * `agentform studio` install runs with by default — real generation
 * requires an explicit `ANTHROPIC_API_KEY`, the same "no key, no real
 * provider call" discipline this project has followed since the
 * framework adapters' own real-provider testing.
 */
export function createLocalDemoProvider(): GenAIProvider {
  const candidates: readonly unknown[] = [
    {},
    { summary: NOTHING_GENERATED_MESSAGE, resources: {} },
    { type: 'message', message: NOTHING_GENERATED_MESSAGE },
  ];

  return {
    name: 'local-demo',
    async generate(request) {
      for (const candidate of candidates) {
        const parsed = request.schema.safeParse(candidate);
        if (parsed.success) {
          return parsed.data;
        }
      }
      throw new Error(
        'local-demo GenAI provider has no fallback response satisfying the requested schema — set AGENTFORM_STUDIO_GENAI_PROVIDER=anthropic and a real ANTHROPIC_API_KEY instead.',
      );
    },
  };
}
