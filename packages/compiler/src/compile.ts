import type { Diagnostic } from '@agentform/diagnostics';
import type { AgentformIR } from '@agentform/ir';
import type { FrameworkAdapter, GeneratedProject } from '@agentform/plugin-sdk';
import { compatibilityReportToDiagnostics } from './compatibility-diagnostics.js';
import { COMPILER_DIAGNOSTIC_CODES } from './codes.js';
import { scanForSecretLeaks } from './secret-scan.js';

export interface CompileOptions {
  readonly outputDir: string;
  readonly agentformVersion: string;
}

export interface CompileResult {
  readonly project?: GeneratedProject;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Runs one adapter's full compile pipeline: compatibility check first
 * (§12 "do not silently ignore unsupported specification fields" — a
 * blocking incompatibility stops generation entirely, no `project` in the
 * result), then `generate()`, then a secret-leak scan over every
 * generated file (§22 "avoid secret values") as the final gate before a
 * `project` is returned at all. Never writes to disk — that stays the
 * CLI's job (`agentform compile`), matching every other package's
 * fs-free-by-default convention in this codebase.
 */
export async function compile(
  ir: AgentformIR,
  adapter: FrameworkAdapter,
  options: CompileOptions,
): Promise<CompileResult> {
  const compatibilityReport = await adapter.validateCompatibility(ir, {
    outputDir: options.outputDir,
  });
  const diagnostics = compatibilityReportToDiagnostics(compatibilityReport);

  if (compatibilityReport.hasBlockingIncompatibility) {
    return { diagnostics };
  }

  const project = await adapter.generate(ir, {
    outputDir: options.outputDir,
    agentformVersion: options.agentformVersion,
  });

  const leaks = scanForSecretLeaks(project.files);
  if (leaks.length > 0) {
    return {
      diagnostics: [
        ...diagnostics,
        ...leaks.map(
          (leak): Diagnostic => ({
            code: COMPILER_DIAGNOSTIC_CODES.SECRET_LEAK_BLOCKED.code,
            severity: 'error',
            message: `Generated file "${leak.path}" would contain what looks like a ${leak.patternName}: ${leak.redactedValue}`,
          }),
        ),
      ],
    };
  }

  return { project, diagnostics };
}
