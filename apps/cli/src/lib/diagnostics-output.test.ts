import { describe, expect, it } from 'vitest';
import { diagnosticToJson, formatDiagnosticsForHumans } from './diagnostics-output.js';
import type { Diagnostic } from '@agentform/diagnostics';

const withLocation: Diagnostic = {
  code: 'AGF2001',
  severity: 'error',
  message: 'Required field "name" is missing.',
  location: { file: 'agentform.yaml', line: 3, column: 3 },
};

const withPath: Diagnostic = {
  code: 'AGF3001',
  severity: 'warning',
  message: 'Agent references unknown model.',
  path: ['spec', 'agents', 'intake', 'model'],
};

describe('formatDiagnosticsForHumans', () => {
  it('returns an empty string for no diagnostics', () => {
    expect(formatDiagnosticsForHumans([])).toBe('');
  });

  it('renders a location-based diagnostic on one line', () => {
    const output = formatDiagnosticsForHumans([withLocation]);
    expect(output).toBe('Error [AGF2001] Required field "name" is missing. (agentform.yaml:3:3)');
  });

  it('renders a path-based diagnostic when no location is present', () => {
    const output = formatDiagnosticsForHumans([withPath]);
    expect(output).toBe(
      'Warning [AGF3001] Agent references unknown model. (at spec.agents.intake.model)',
    );
  });

  it('joins multiple diagnostics with newlines', () => {
    const output = formatDiagnosticsForHumans([withLocation, withPath]);
    expect(output.split('\n')).toHaveLength(2);
  });

  it('includes a suggested fix on its own indented line when present', () => {
    const diagnostic: Diagnostic = { ...withLocation, suggestedFix: 'Add a "name" field.' };
    expect(formatDiagnosticsForHumans([diagnostic])).toContain(
      '\n  Suggested fix: Add a "name" field.',
    );
  });

  it('does not include ANSI color codes by default', () => {
    expect(formatDiagnosticsForHumans([withLocation])).not.toContain('\x1b[');
  });

  it('includes ANSI color codes when color is requested', () => {
    expect(formatDiagnosticsForHumans([withLocation], { color: true })).toContain('[31m');
  });
});

describe('diagnosticToJson', () => {
  it('includes every field with null defaults for absent ones', () => {
    expect(diagnosticToJson(withLocation)).toEqual({
      code: 'AGF2001',
      severity: 'error',
      message: 'Required field "name" is missing.',
      path: null,
      location: { file: 'agentform.yaml', line: 3, column: 3 },
      relatedLocation: null,
      suggestedFix: null,
    });
  });

  it('is JSON-serializable round-trip stable', () => {
    const json = diagnosticToJson(withPath);
    expect(JSON.parse(JSON.stringify(json))).toEqual(json);
  });
});
