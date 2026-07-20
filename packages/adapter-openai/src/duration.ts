const UNIT_TO_MS: Readonly<Record<string, number>> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

const DURATION_PATTERN = /^(\d+)(ms|s|m|h|d)$/;

/** Converts an `@agentform/schema` duration string (`durationSchema`'s `/^\d+(ms|s|m|h|d)$/`, e.g. `"30s"`) to milliseconds. Returns `undefined` for a malformed value rather than throwing — schema validation already guarantees well-formed input by the time a document reaches the IR, so this is defense in depth, not the primary check. */
export function durationToMs(duration: string): number | undefined {
  const match = DURATION_PATTERN.exec(duration);
  if (!match) {
    return undefined;
  }
  const [, amount, unit] = match as unknown as [string, string, string];
  const msPerUnit = UNIT_TO_MS[unit];
  return msPerUnit === undefined ? undefined : Number(amount) * msPerUnit;
}
