import { redactSecretValue } from '../redact.js';
import { detectSecret } from '../secret-patterns.js';
import type { PolicyDefinition, PolicyFinding } from '../types.js';
import { pathToAddress, walkStrings } from '../walk.js';

/**
 * Scans the deployed state a command read from its state backend for
 * anything credential-shaped, using the same `SECRET_PATTERNS` AF001
 * applies to the source document.
 *
 * Most of `@agentform/state`'s shape cannot hold a secret by
 * construction — `ResourceState` stores content/identity hashes rather
 * than resource values (§10 "never store raw secret values"). This check
 * covers the parts that are genuinely free-form and therefore not
 * protected by that design: `ApplicationState.deploymentIdentifiers`
 * (arbitrary adapter-supplied strings) and `ApplyHistoryEntry.summary`.
 * It is defense in depth against a backend or adapter writing a token
 * where an identifier belongs, not a restatement of the type-level
 * guarantee.
 *
 * `context.state` is absent for commands that run before any state is
 * read (`validate`, `plan`), and the policy passes cleanly there: there is
 * nothing deployed to inspect, not a violation to report.
 */
export const af014StateMustNotContainSecrets: PolicyDefinition = {
  id: 'AF014',
  name: 'state-must-not-contain-secrets',
  description: 'Reject persisted state that contains an inline secret.',
  defaultSeverity: 'error',
  mandatory: true,
  check: (context) => {
    if (!context.state) {
      return [];
    }
    const findings: PolicyFinding[] = [];
    for (const { value, path } of walkStrings(context.state, ['state'])) {
      const match = detectSecret(value);
      if (!match) {
        continue;
      }
      findings.push({
        message: `Persisted state at "${pathToAddress(path)}" looks like an inline ${match.name}: ${redactSecretValue(value)}`,
        resourceAddress: pathToAddress(path),
        remediation:
          'Remove the credential from state and store a reference to it instead. Treat the value as compromised and rotate it.',
      });
    }
    return findings;
  },
};
