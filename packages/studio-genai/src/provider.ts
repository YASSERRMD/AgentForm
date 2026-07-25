import type { z } from 'zod';

export interface GenAIRequest<T> {
  readonly systemPrompt: string;
  readonly userPrompt: string;
  /** The real Zod schema the response must conform to — handed directly to the provider's own structured-output mechanism, never a hand-parsed freeform completion. */
  readonly schema: z.ZodType<T>;
}

/**
 * Provider-neutral generation, per §34.3: "adding a provider must not
 * require frontend changes." The frontend never sees this interface at
 * all — it only ever calls `studio-server`'s own `/api/genai/*` routes,
 * which select and call a provider server-side.
 */
export interface GenAIProvider {
  readonly name: string;
  generate<T>(request: GenAIRequest<T>): Promise<T>;
}
