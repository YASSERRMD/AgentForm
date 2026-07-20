import { z } from 'zod';
import type { Diagnostic } from '@agentform/diagnostics';
import { POLICY_ENGINE_DIAGNOSTIC_CODES } from './codes.js';
import type { PolicyEngineConfig } from './types.js';

const policyOverrideSchema = z
  .object({
    severity: z.enum(['error', 'warning', 'skip']).optional(),
    justification: z.string().min(1).optional(),
  })
  .strict();

export const policyEngineConfigSchema = z
  .object({
    overrides: z.record(z.string(), policyOverrideSchema).optional(),
  })
  .strict();

export interface PolicyConfigValidationResult {
  readonly success: boolean;
  readonly data?: PolicyEngineConfig;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Validates a parsed JS value (already loaded from YAML/JSON — file
 * loading is the CLI's job, not this package's) against the
 * `PolicyEngineConfig` shape. Kept independent of `@agentform/schema`'s
 * `validateAgenticApplication`: this shape is far smaller and flatter, so
 * one generic diagnostic code plus the real Zod issue message/path is
 * enough — it doesn't need that function's full issue-code taxonomy.
 */
export function validatePolicyEngineConfig(input: unknown): PolicyConfigValidationResult {
  const result = policyEngineConfigSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data, diagnostics: [] };
  }

  const diagnostics: Diagnostic[] = result.error.issues.map((issue) => ({
    code: POLICY_ENGINE_DIAGNOSTIC_CODES.INVALID_POLICY_CONFIG.code,
    severity: 'error',
    message: issue.message,
    path: issue.path as (string | number)[],
  }));

  return { success: false, diagnostics };
}
