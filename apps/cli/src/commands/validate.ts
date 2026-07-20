import type { Command } from 'commander';
import type { Diagnostic } from '@agentform/diagnostics';
import { diagnosticToJson, formatDiagnosticsForHumans } from '../lib/diagnostics-output.js';
import { EXIT_CODES, exitCodeForDiagnostics } from '../lib/exit-codes.js';
import { loadAndBuildIR } from '../lib/pipeline.js';
import { getGlobalOptions } from '../program.js';

interface ValidateCommandOptions {
  readonly strict: boolean;
  readonly environment?: string;
}

function escalateWarnings(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return diagnostics.map((d) =>
    d.severity === 'warning' ? { ...d, severity: 'error' as const } : d,
  );
}

export function registerValidateCommand(program: Command): void {
  program
    .command('validate')
    .description('Validate an Agentform project: parsing, schema, and semantic checks')
    .option('--strict', 'treat warnings as validation failures', false)
    .option('--environment <name>', 'apply the named environment overlay before validating')
    .action((options: ValidateCommandOptions) => {
      const globalOptions = getGlobalOptions(program);
      const result = loadAndBuildIR({
        rootDir: globalOptions.cwd,
        environment: options.environment,
      });

      const effectiveDiagnostics = options.strict
        ? escalateWarnings(result.diagnostics)
        : result.diagnostics;
      const exitCode = exitCodeForDiagnostics(effectiveDiagnostics);
      const success = exitCode === EXIT_CODES.SUCCESS;

      if (globalOptions.json) {
        process.stdout.write(
          `${JSON.stringify(
            { success, diagnostics: result.diagnostics.map(diagnosticToJson) },
            null,
            2,
          )}\n`,
        );
      } else if (!globalOptions.quiet) {
        if (result.diagnostics.length > 0) {
          process.stdout.write(
            `${formatDiagnosticsForHumans(result.diagnostics, { color: globalOptions.color })}\n`,
          );
        }
        process.stdout.write(success ? 'Validation succeeded.\n' : 'Validation failed.\n');
      }

      process.exitCode = exitCode;
    });
}
