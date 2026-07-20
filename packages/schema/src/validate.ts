import type { z } from 'zod';
import type { Diagnostic } from '@agentform/diagnostics';
import { agenticApplicationSchema, type AgenticApplication } from './application.js';
import { SCHEMA_DIAGNOSTIC_CODES } from './codes.js';

export type SchemaIssue = z.ZodError['issues'][number];

export interface SchemaValidationResult {
  readonly success: boolean;
  readonly data?: AgenticApplication;
  readonly diagnostics: readonly Diagnostic[];
}

function isMissingValue(issue: SchemaIssue): boolean {
  return issue.code === 'invalid_type' && issue.input === undefined;
}

function issueToCode(issue: SchemaIssue): string {
  if (isMissingValue(issue)) {
    return SCHEMA_DIAGNOSTIC_CODES.MISSING_FIELD.code;
  }

  switch (issue.code) {
    case 'invalid_type':
      return SCHEMA_DIAGNOSTIC_CODES.INVALID_TYPE.code;
    case 'too_small':
    case 'too_big':
      return SCHEMA_DIAGNOSTIC_CODES.OUT_OF_RANGE.code;
    case 'invalid_format':
      return SCHEMA_DIAGNOSTIC_CODES.INVALID_FORMAT.code;
    case 'unrecognized_keys':
      return SCHEMA_DIAGNOSTIC_CODES.UNRECOGNIZED_KEY.code;
    case 'invalid_union':
      return SCHEMA_DIAGNOSTIC_CODES.INVALID_UNION.code;
    case 'invalid_value':
      return SCHEMA_DIAGNOSTIC_CODES.INVALID_VALUE.code;
    case 'custom':
      return typeof issue.message === 'string' && issue.message.startsWith('Duplicate entry')
        ? SCHEMA_DIAGNOSTIC_CODES.DUPLICATE_ENTRY.code
        : SCHEMA_DIAGNOSTIC_CODES.UNKNOWN.code;
    default:
      return SCHEMA_DIAGNOSTIC_CODES.UNKNOWN.code;
  }
}

/**
 * Validates a parsed JS value (already loaded from YAML/JSON — parsing
 * itself is `@agentform/parser`, Phase 3) against the `v1alpha1`
 * AgenticApplication schema, returning every diagnostic rather than
 * throwing on the first one.
 */
export function validateAgenticApplication(input: unknown): SchemaValidationResult {
  const result = agenticApplicationSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data, diagnostics: [] };
  }

  const diagnostics: Diagnostic[] = result.error.issues.map((issue) => ({
    code: issueToCode(issue),
    severity: 'error',
    message: issue.message,
    path: issue.path as (string | number)[],
  }));

  return { success: false, diagnostics };
}
