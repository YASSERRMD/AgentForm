const DURATION_UNIT_MS: Readonly<Record<string, number>> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

const DURATION_PATTERN = /^(\d+)(ms|s|m|h|d)$/;

/**
 * Parses a duration string matching `@agentform/schema`'s `durationSchema`
 * format ("30s", "5m", "24h", "1d") into milliseconds. Schema validation
 * already guarantees the *shape* is well-formed wherever a spec document
 * is the source — this exists for callers (starting with
 * `@agentform/evaluator`'s maximum-latency assertion) that need the
 * numeric value to compare against a measured duration, not just
 * confirmation the string is valid.
 */
export function parseDurationMs(value: string): number {
  const match = DURATION_PATTERN.exec(value);
  if (!match) {
    throw new Error(
      `Invalid duration "${value}" — expected a number followed by ms/s/m/h/d (e.g. "30s").`,
    );
  }
  const [, amount, unit] = match;
  return Number(amount) * DURATION_UNIT_MS[unit as string]!;
}
