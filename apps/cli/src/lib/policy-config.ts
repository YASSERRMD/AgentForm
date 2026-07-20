import path from 'node:path';
import type { Diagnostic } from '@agentform/diagnostics';
import { loadDocument, nodeFileSystem } from '@agentform/parser';
import { validatePolicyEngineConfig, type PolicyEngineConfig } from '@agentform/policy';

/** Mirrors the `environments/<name>.yaml` overlay convention: a fixed, conventional filename found by presence, not by a CLI flag. There is deliberately no way to point at a different file — see the module doc below for why. */
export const POLICY_CONFIG_FILENAME = 'agentform.policy.yaml';

export interface LoadPolicyConfigResult {
  readonly config: PolicyEngineConfig;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Loads the optional policy override configuration file from the project
 * root. Absent entirely means "no overrides" — every policy runs at its
 * built-in default severity, exactly like a project with no environment
 * overlay just doesn't apply one. A file that *exists* but is malformed
 * YAML/JSON or doesn't match `PolicyEngineConfig`'s shape is a diagnostic
 * error, not a silent fallback — a config author who made a typo deserves
 * to know their overrides never applied, not have them silently ignored.
 *
 * Deliberately not configurable via a CLI flag to a different path: §16's
 * "mandatory policies cannot be bypassed with CLI flags" is easiest to
 * keep true when there is exactly one place overrides can come from.
 */
export function loadPolicyConfig(rootDir: string): LoadPolicyConfigResult {
  const absolutePath = path.join(rootDir, POLICY_CONFIG_FILENAME);
  if (!nodeFileSystem.exists(absolutePath)) {
    return { config: {}, diagnostics: [] };
  }

  const doc = loadDocument(nodeFileSystem.readFile(absolutePath), POLICY_CONFIG_FILENAME);
  if (doc.diagnostics.some((d) => d.severity === 'error')) {
    return { config: {}, diagnostics: doc.diagnostics };
  }

  const result = validatePolicyEngineConfig(doc.value);
  if (!result.success || !result.data) {
    return { config: {}, diagnostics: result.diagnostics };
  }
  return { config: result.data, diagnostics: [] };
}
