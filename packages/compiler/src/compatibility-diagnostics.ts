import type { Diagnostic } from '@agentform/diagnostics';
import type { CompatibilityReport } from '@agentform/plugin-sdk';
import { COMPILER_DIAGNOSTIC_CODES } from './codes.js';

/** Converts every `unsupported` entry into an error diagnostic (blocking) and every `partial`/`emulated` entry into a warning (informational) — `supported` entries produce nothing, matching how every other pipeline stage's diagnostics only report problems. */
export function compatibilityReportToDiagnostics(report: CompatibilityReport): Diagnostic[] {
  return report.entries
    .filter((entry) => entry.level !== 'supported')
    .map((entry) => ({
      code: COMPILER_DIAGNOSTIC_CODES.UNSUPPORTED_FEATURE.code,
      severity: entry.level === 'unsupported' ? ('error' as const) : ('warning' as const),
      message: `[${report.target}] ${entry.feature} is ${entry.level}${entry.detail ? `: ${entry.detail}` : ''}`,
      path: entry.resourceAddress ? entry.resourceAddress.split('.') : undefined,
    }));
}
