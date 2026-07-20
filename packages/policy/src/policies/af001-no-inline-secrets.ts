import { redactSecretValue } from '../redact.js';
import { detectSecret } from '../secret-patterns.js';
import type { PolicyDefinition, PolicyFinding } from '../types.js';
import { pathToAddress, walkStrings } from '../walk.js';

/**
 * Flags anything in the document that looks like a real credential
 * (AWS/GitHub/Slack/OpenAI-shaped tokens, PEM private key blocks, inline
 * bearer tokens) rather than a reference to one. Scans every string in the
 * document, not just `authRef`-style fields, since a pasted secret can end
 * up anywhere (an agent's inline instructions, a tool's plugin config, a
 * model endpoint URL with embedded credentials).
 */
export const af001NoInlineSecrets: PolicyDefinition = {
  id: 'AF001',
  name: 'no-inline-secrets',
  description: 'Reject documents containing what looks like a real inline credential.',
  defaultSeverity: 'error',
  mandatory: true,
  check: (context) => {
    const findings: PolicyFinding[] = [];
    for (const { value, path } of walkStrings(context.application)) {
      const match = detectSecret(value);
      if (!match) {
        continue;
      }
      findings.push({
        message: `Value at "${pathToAddress(path)}" looks like an inline ${match.name}: ${redactSecretValue(value)}`,
        resourceAddress: pathToAddress(path),
        remediation:
          'Replace the inline credential with a reference (e.g. an environment variable or secrets manager reference) instead of a literal value.',
      });
    }
    return findings;
  },
};
