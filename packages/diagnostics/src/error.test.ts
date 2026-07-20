import { describe, expect, it } from 'vitest';
import { DiagnosticError, formatDiagnostic } from './error.js';
import type { Diagnostic } from './types.js';

const missingField: Diagnostic = {
  code: 'AGF2001',
  severity: 'error',
  message: 'Required field "name" is missing.',
  path: ['metadata', 'name'],
};

const withLocation: Diagnostic = {
  code: 'AGF2002',
  severity: 'warning',
  message: 'Field is deprecated.',
  location: { file: 'agentform.yaml', line: 12, column: 5 },
};

describe('formatDiagnostic', () => {
  it('renders a field path when no source location is present', () => {
    expect(formatDiagnostic(missingField)).toBe(
      '[AGF2001] error: Required field "name" is missing. (at metadata.name)',
    );
  });

  it('prefers the source location over the field path when both are present', () => {
    expect(formatDiagnostic(withLocation)).toBe(
      '[AGF2002] warning: Field is deprecated. (agentform.yaml:12:5)',
    );
  });
});

describe('DiagnosticError', () => {
  it('aggregates every diagnostic into its message', () => {
    const error = new DiagnosticError([missingField, withLocation]);
    expect(error.name).toBe('DiagnosticError');
    expect(error.diagnostics).toHaveLength(2);
    expect(error.message).toContain('AGF2001');
    expect(error.message).toContain('AGF2002');
  });

  it('still constructs cleanly with zero diagnostics', () => {
    const error = new DiagnosticError([]);
    expect(error.diagnostics).toHaveLength(0);
    expect(error.message).toBe('Diagnostic error with no diagnostics');
  });
});
