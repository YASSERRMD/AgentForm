/** Stable process exit codes (§14) — every command that terminates the process must use one of these, never a bare number inline. */
export const EXIT_CODES = {
  SUCCESS: 0,
  GENERAL_FAILURE: 1,
  INVALID_USAGE: 2,
  SOURCE_PARSING_FAILURE: 3,
  SCHEMA_VALIDATION_FAILURE: 4,
  SEMANTIC_VALIDATION_FAILURE: 5,
  POLICY_FAILURE: 6,
  UNAPPROVED_CRITICAL_CHANGE: 7,
  COMPILATION_FAILURE: 8,
  TEST_FAILURE: 9,
  APPLY_FAILURE: 10,
  STATE_LOCK_FAILURE: 11,
  DRIFT_DETECTED: 12,
  UNSUPPORTED_TARGET_FEATURE: 13,
  IMPORT_FAILURE: 14,
  ROLLBACK_FAILURE: 15,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

/**
 * Picks the exit code matching the *earliest* pipeline stage that
 * produced an error diagnostic — parsing (`AGF1xxx`) before schema
 * (`AGF2xxx`) before semantic (`AGF3xxx`) — since that's the stage whose
 * fix actually unblocks the rest. Returns `SUCCESS` if there are no error
 * diagnostics at all.
 */
export function exitCodeForDiagnostics(
  diagnostics: readonly { code: string; severity: string }[],
): ExitCode {
  const errorCodes = diagnostics.filter((d) => d.severity === 'error').map((d) => d.code);
  if (errorCodes.length === 0) {
    return EXIT_CODES.SUCCESS;
  }
  if (errorCodes.some((code) => code.startsWith('AGF1'))) {
    return EXIT_CODES.SOURCE_PARSING_FAILURE;
  }
  if (errorCodes.some((code) => code.startsWith('AGF2'))) {
    return EXIT_CODES.SCHEMA_VALIDATION_FAILURE;
  }
  return EXIT_CODES.SEMANTIC_VALIDATION_FAILURE;
}

/**
 * Commander's own usage-error codes (unknown option, missing argument,
 * unknown subcommand, ...) all default to exit code 1 internally — there
 * is no way to configure this per-error inside Commander itself. Agentform's
 * exit-code contract (§14) reserves `1` for "general failure" and `2`
 * specifically for "invalid command usage", so those Commander error codes
 * are remapped here. `commander.help`/`commander.helpDisplayed`/
 * `commander.version` already exit `0` and pass through unchanged.
 */
const COMMANDER_USAGE_ERROR_CODES = new Set([
  'commander.missingArgument',
  'commander.optionMissingArgument',
  'commander.missingMandatoryOptionValue',
  'commander.conflictingOption',
  'commander.unknownOption',
  'commander.excessArguments',
  'commander.unknownCommand',
  'commander.invalidArgument',
]);

export function resolveCommanderExitCode(error: { code?: string; exitCode: number }): number {
  if (error.code && COMMANDER_USAGE_ERROR_CODES.has(error.code)) {
    return EXIT_CODES.INVALID_USAGE;
  }
  return error.exitCode;
}
