export interface GenAIRateLimitConfig {
  readonly max: number;
  readonly timeWindow: string;
}

/**
 * Applied per-route to each of the 4 GenAI/chat endpoints (never the
 * whole app — see app.ts's `global: false` registration), each with its
 * own independent bucket. 20/min is comfortably above realistic
 * interactive use (read a proposal, tweak, resubmit — roughly one
 * request per 3s sustained) while bounding a runaway client from placing
 * unbounded real-dollar load on whatever provider is configured.
 */
export const GENAI_RATE_LIMIT: GenAIRateLimitConfig = { max: 20, timeWindow: '1 minute' };
