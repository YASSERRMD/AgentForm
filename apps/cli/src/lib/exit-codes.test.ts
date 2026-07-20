import { describe, expect, it } from 'vitest';
import { EXIT_CODES, exitCodeForDiagnostics, resolveCommanderExitCode } from './exit-codes.js';

describe('exitCodeForDiagnostics', () => {
  it('returns SUCCESS when there are no diagnostics', () => {
    expect(exitCodeForDiagnostics([])).toBe(EXIT_CODES.SUCCESS);
  });

  it('returns SUCCESS when every diagnostic is a warning', () => {
    expect(exitCodeForDiagnostics([{ code: 'AGF2001', severity: 'warning' }])).toBe(
      EXIT_CODES.SUCCESS,
    );
  });

  it('returns SOURCE_PARSING_FAILURE for an AGF1xxx error', () => {
    expect(exitCodeForDiagnostics([{ code: 'AGF1000', severity: 'error' }])).toBe(
      EXIT_CODES.SOURCE_PARSING_FAILURE,
    );
  });

  it('returns SCHEMA_VALIDATION_FAILURE for an AGF2xxx error', () => {
    expect(exitCodeForDiagnostics([{ code: 'AGF2001', severity: 'error' }])).toBe(
      EXIT_CODES.SCHEMA_VALIDATION_FAILURE,
    );
  });

  it('returns SEMANTIC_VALIDATION_FAILURE for an AGF3xxx error', () => {
    expect(exitCodeForDiagnostics([{ code: 'AGF3001', severity: 'error' }])).toBe(
      EXIT_CODES.SEMANTIC_VALIDATION_FAILURE,
    );
  });

  it('prefers the earliest pipeline stage when multiple error stages are present', () => {
    const diagnostics = [
      { code: 'AGF3001', severity: 'error' },
      { code: 'AGF1000', severity: 'error' },
      { code: 'AGF2001', severity: 'error' },
    ];
    expect(exitCodeForDiagnostics(diagnostics)).toBe(EXIT_CODES.SOURCE_PARSING_FAILURE);
  });

  it('returns POLICY_FAILURE for a built-in policy ID error (e.g. AF003)', () => {
    expect(exitCodeForDiagnostics([{ code: 'AF003', severity: 'error' }])).toBe(
      EXIT_CODES.POLICY_FAILURE,
    );
  });

  it('returns POLICY_FAILURE for an AGF4xxx (policy engine override) error', () => {
    expect(exitCodeForDiagnostics([{ code: 'AGF4001', severity: 'error' }])).toBe(
      EXIT_CODES.POLICY_FAILURE,
    );
  });

  it('prefers semantic failure over policy failure when both are present', () => {
    const diagnostics = [
      { code: 'AF003', severity: 'error' },
      { code: 'AGF3001', severity: 'error' },
    ];
    expect(exitCodeForDiagnostics(diagnostics)).toBe(EXIT_CODES.SEMANTIC_VALIDATION_FAILURE);
  });

  it('returns UNSUPPORTED_TARGET_FEATURE for an AGF5001 (unsupported compiler feature) error', () => {
    expect(exitCodeForDiagnostics([{ code: 'AGF5001', severity: 'error' }])).toBe(
      EXIT_CODES.UNSUPPORTED_TARGET_FEATURE,
    );
  });

  it('returns COMPILATION_FAILURE for other AGF5xxx (compiler) errors', () => {
    expect(exitCodeForDiagnostics([{ code: 'AGF5003', severity: 'error' }])).toBe(
      EXIT_CODES.COMPILATION_FAILURE,
    );
  });

  it('prefers policy failure over compilation failure when both are present', () => {
    const diagnostics = [
      { code: 'AGF5003', severity: 'error' },
      { code: 'AF003', severity: 'error' },
    ];
    expect(exitCodeForDiagnostics(diagnostics)).toBe(EXIT_CODES.POLICY_FAILURE);
  });
});

describe('resolveCommanderExitCode', () => {
  it.each([
    'commander.missingArgument',
    'commander.optionMissingArgument',
    'commander.missingMandatoryOptionValue',
    'commander.conflictingOption',
    'commander.unknownOption',
    'commander.excessArguments',
    'commander.unknownCommand',
    'commander.invalidArgument',
  ])('remaps %s (Commander default: exitCode 1) to INVALID_USAGE (2)', (code) => {
    expect(resolveCommanderExitCode({ code, exitCode: 1 })).toBe(EXIT_CODES.INVALID_USAGE);
  });

  it('passes through commander.help unchanged (exit 0)', () => {
    expect(resolveCommanderExitCode({ code: 'commander.help', exitCode: 0 })).toBe(0);
  });

  it('passes through commander.version unchanged (exit 0)', () => {
    expect(resolveCommanderExitCode({ code: 'commander.version', exitCode: 0 })).toBe(0);
  });

  it('passes through an unrecognized code using the error’s own exitCode', () => {
    expect(resolveCommanderExitCode({ code: 'commander.somethingNew', exitCode: 7 })).toBe(7);
  });

  it('passes through when there is no code at all', () => {
    expect(resolveCommanderExitCode({ exitCode: 3 })).toBe(3);
  });
});
