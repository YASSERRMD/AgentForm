import { redactSecretValue, SECRET_PATTERNS } from '@agentform/policy';

/**
 * Redacts anything matching a known secret-credential shape out of
 * already-rendered `agentform test` report text (console, `--json`,
 * `--junit` XML) before it's written anywhere. Unlike the specification
 * document itself, a dataset's mocked tool `return`/`args` values and
 * assertion messages are author-controlled test-fixture content
 * `@agentform/policy`'s `AF001` never sees (it only walks the parsed
 * `AgentformApplication`, not files loaded separately by `agentform test`)
 * — a real credential pasted into a fixture (e.g. captured from a real API
 * response while writing the mock) would otherwise flow straight into a
 * report a CI dashboard renders and archives (§18 "do not log secrets").
 */
export function redactSecretsFromReport(text: string): string {
  let redacted = text;
  for (const { pattern } of SECRET_PATTERNS) {
    const globalPattern = new RegExp(pattern.source, `${pattern.flags}g`);
    redacted = redacted.replace(globalPattern, (match) => redactSecretValue(match));
  }
  return redacted;
}
