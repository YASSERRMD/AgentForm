import { redactSecretValue, SECRET_PATTERNS } from '@agentform/policy';
import type { GeneratedFile } from '@agentform/plugin-sdk';

export interface SecretLeak {
  readonly path: string;
  readonly patternName: string;
  readonly redactedValue: string;
}

/**
 * The last line of defense against a secret ending up in generated source
 * (§22 "Avoid secret values"). Adapters are designed to never *reference*
 * a credential-shaped IR field in the first place — generated code relies
 * on the target SDK's own environment-variable defaults instead (see
 * `docs/compiler-reference.md`'s Scope section for why: `${env.*}`
 * interpolation is already fully resolved by the time a document reaches
 * the IR, Phase 3, so the compiler has no way to know which resolved
 * value *came from* an env var — it can only avoid touching credential
 * fields at all). This function is the safety net for the case that
 * design doesn't cover: a user hardcoded a real secret directly in their
 * specification (not via `${env.*}`), and it flowed into a field the
 * generator does emit (e.g. free-form instructions text). Every generated
 * file's content is scanned with the exact same patterns `@agentform/policy`'s
 * `AF001` uses before `compile()` returns it.
 */
export function scanForSecretLeaks(files: readonly GeneratedFile[]): readonly SecretLeak[] {
  const leaks: SecretLeak[] = [];
  for (const file of files) {
    for (const { name, pattern } of SECRET_PATTERNS) {
      const match = pattern.exec(file.content);
      if (match) {
        leaks.push({
          path: file.path,
          patternName: name,
          redactedValue: redactSecretValue(match[0]),
        });
        break;
      }
    }
  }
  return leaks;
}
