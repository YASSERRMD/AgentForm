/**
 * Masks a detected-secret-looking value for use in a policy message —
 * never the raw value, so a "found a secret" diagnostic can never itself
 * become a place a secret leaks into logs, snapshots, or CI output (§18,
 * §30 "Do not log secrets"). Keeps just enough (length, first/last
 * character) to let a human confirm *which* value was flagged without
 * reconstructing it.
 */
export function redactSecretValue(value: string): string {
  if (value.length <= 4) {
    return '*'.repeat(value.length);
  }
  const first = value.slice(0, 2);
  const last = value.slice(-2);
  return `${first}${'*'.repeat(Math.min(value.length - 4, 8))}${last}`;
}
