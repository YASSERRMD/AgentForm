import { describe, expect, it } from 'vitest';
import type { CompatibilityReport } from '@agentform/plugin-sdk';
import { compatibilityReportToDiagnostics } from './compatibility-diagnostics.js';

function report(overrides: Partial<CompatibilityReport> = {}): CompatibilityReport {
  return {
    target: 'openai',
    entries: [],
    generatedDependencies: {},
    frameworkVersion: '0.1.0',
    runtimeRequirements: [],
    securityWarnings: [],
    hasBlockingIncompatibility: false,
    ...overrides,
  };
}

describe('compatibilityReportToDiagnostics', () => {
  it('produces no diagnostics for a fully supported report', () => {
    const diagnostics = compatibilityReportToDiagnostics(
      report({ entries: [{ feature: 'agent', level: 'supported' }] }),
    );
    expect(diagnostics).toEqual([]);
  });

  it('produces an error diagnostic for an unsupported feature', () => {
    const diagnostics = compatibilityReportToDiagnostics(
      report({
        entries: [{ feature: 'loop node', level: 'unsupported', detail: 'not yet supported' }],
      }),
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.severity).toBe('error');
    expect(diagnostics[0]?.code).toBe('AGF5001');
    expect(diagnostics[0]?.message).toContain('loop node');
  });

  it('produces a warning diagnostic for a partial or emulated feature', () => {
    const diagnostics = compatibilityReportToDiagnostics(
      report({
        entries: [
          { feature: 'sessions', level: 'partial' },
          { feature: 'guardrails', level: 'emulated' },
        ],
      }),
    );
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics.every((d) => d.severity === 'warning')).toBe(true);
  });

  it('includes the resource address as a path when given', () => {
    const diagnostics = compatibilityReportToDiagnostics(
      report({
        entries: [{ feature: 'x', level: 'unsupported', resourceAddress: 'workflow.main' }],
      }),
    );
    expect(diagnostics[0]?.path).toEqual(['workflow', 'main']);
  });
});
