import type { Command } from 'commander';
import type { Diagnostic } from '@agentform/diagnostics';
import { BUILTIN_POLICIES, evaluatePolicies, type PolicyResult } from '@agentform/policy';
import { diagnosticToJson, formatDiagnosticsForHumans } from '../lib/diagnostics-output.js';
import { EXIT_CODES, exitCodeForDiagnostics } from '../lib/exit-codes.js';
import { loadAndBuildIR } from '../lib/pipeline.js';
import { loadPolicyConfig } from '../lib/policy-config.js';
import { formatPolicySummary, policyResultsToDiagnostics, summarizePolicyResults } from '../lib/policy-output.js';
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
    .description('Validate an Agentform project: parsing, schema, semantic, and policy checks')
    .option('--strict', 'treat warnings as validation failures', false)
    .option('--environment <name>', 'apply the named environment overlay before validating')
    .action((options: ValidateCommandOptions) => {
      const globalOptions = getGlobalOptions(program);
      const result = loadAndBuildIR({
        rootDir: globalOptions.cwd,
        environment: options.environment,
      });

      // Policy checks run against the schema-validated application, and
      // only once parsing/schema/semantic validation all actually
      // succeeded (result.ir defined) — evaluating policy against a
      // document already known to be broken in a more fundamental way
      // would just add confusing secondary output.
      let policyResults: readonly PolicyResult[] = [];
      let diagnostics = result.diagnostics;

      if (result.ir && result.application) {
        const policyConfig = loadPolicyConfig(globalOptions.cwd);
        if (policyConfig.diagnostics.some((d) => d.severity === 'error')) {
          diagnostics = [...diagnostics, ...policyConfig.diagnostics];
        } else {
          const evaluation = evaluatePolicies(
            BUILTIN_POLICIES,
            { application: result.application },
            policyConfig.config,
          );
          policyResults = evaluation.results;
          diagnostics = [
            ...diagnostics,
            ...evaluation.diagnostics,
            ...policyResultsToDiagnostics(evaluation.results),
          ];
        }
      }

      const effectiveDiagnostics = options.strict ? escalateWarnings(diagnostics) : diagnostics;
      const exitCode = exitCodeForDiagnostics(effectiveDiagnostics);
      const success = exitCode === EXIT_CODES.SUCCESS;

      if (globalOptions.json) {
        process.stdout.write(
          `${JSON.stringify(
            {
              success,
              diagnostics: diagnostics.map(diagnosticToJson),
              policyResults,
            },
            null,
            2,
          )}\n`,
        );
      } else if (!globalOptions.quiet) {
        if (diagnostics.length > 0) {
          process.stdout.write(
            `${formatDiagnosticsForHumans(diagnostics, { color: globalOptions.color })}\n`,
          );
        }
        if (policyResults.length > 0) {
          process.stdout.write(`${formatPolicySummary(summarizePolicyResults(policyResults))}\n`);
        }
        process.stdout.write(success ? 'Validation succeeded.\n' : 'Validation failed.\n');
      }

      process.exitCode = exitCode;
    });
}
