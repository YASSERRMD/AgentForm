export interface SecretPattern {
  readonly name: string;
  readonly pattern: RegExp;
}

/**
 * Well-known, high-signal credential shapes worth flagging when found
 * inline in an Agentform document. Deliberately narrow (named vendor
 * prefixes, PEM headers) rather than generic entropy detection — a
 * structural policy check needs to be deterministic and low-noise, not a
 * best-effort secret scanner. Extend this list as new vendor formats come
 * up; each entry should be specific enough that a real match is very
 * unlikely to be an ordinary identifier or URL.
 */
export const SECRET_PATTERNS: readonly SecretPattern[] = [
  { name: 'AWS access key ID', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', pattern: /\bgh[oprsu]_[A-Za-z0-9]{36,}\b/ },
  { name: 'Slack token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'OpenAI-style secret key', pattern: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: 'PEM private key block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/ },
  { name: 'generic bearer token assignment', pattern: /\b[Aa]uthorization["']?\s*[:=]\s*["']?Bearer\s+[A-Za-z0-9._-]{16,}/ },
];

/** Returns the first pattern that matches `value`, or `undefined` if none does. */
export function detectSecret(value: string): SecretPattern | undefined {
  return SECRET_PATTERNS.find(({ pattern }) => pattern.test(value));
}
