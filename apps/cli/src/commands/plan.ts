import { writeFileSync } from 'node:fs';
import type { Command } from 'commander';
import type { Diagnostic } from '@agentform/diagnostics';
import { comparePlan, createPlanFile, serializePlanFile, type PlanItem } from '@agentform/planner';
import { BUILTIN_POLICIES, evaluatePolicies, type PolicyResult } from '@agentform/policy';
import { diagnosticToJson, formatDiagnosticsForHumans } from '../lib/diagnostics-output.js';
import { EXIT_CODES, exitCodeForDiagnostics } from '../lib/exit-codes.js';
import { formatPlanForHumans } from '../lib/plan-output.js';
import { loadAndBuildIR } from '../lib/pipeline.js';
import { loadPolicyConfig } from '../lib/policy-config.js';
import { policyResultsToDiagnostics } from '../lib/policy-output.js';
import { openStateBackend } from '../lib/state.js';
import { getGlobalOptions } from '../program.js';

interface PlanCommandOptions {
  readonly environment?: string;
  readonly out?: string;
}

export function registerPlanCommand(program: Command): void {
  program
    .command('plan')
    .description('Compare the desired specification against deployed state without changing it')
    .option('--environment <name>', 'apply the named environment overlay before planning')
    .option('--out <file>', 'save the plan to a tamper-evident .afplan file')
    .action(async (options: PlanCommandOptions) => {
      const globalOptions = getGlobalOptions(program);
      const result = loadAndBuildIR({
        rootDir: globalOptions.cwd,
        environment: options.environment,
      });

      if (!result.ir || !result.application) {
        const exitCode = exitCodeForDiagnostics(result.diagnostics);
        emitFailure(result.diagnostics, exitCode, globalOptions);
        return;
      }

      const backend = await openStateBackend(globalOptions.cwd);
      let items: readonly PlanItem[];
      let policyResults: readonly PolicyResult[] = [];
      let diagnostics: readonly Diagnostic[];
      try {
        const currentResourceStates = await backend.listResourceStates();
        items = comparePlan({ ir: result.ir, currentResourceStates });

        const policyConfig = loadPolicyConfig(globalOptions.cwd);
        if (policyConfig.diagnostics.some((d) => d.severity === 'error')) {
          diagnostics = policyConfig.diagnostics;
        } else {
          const evaluation = evaluatePolicies(
            BUILTIN_POLICIES,
            { application: result.application },
            policyConfig.config,
          );
          policyResults = evaluation.results;
          diagnostics = [
            ...evaluation.diagnostics,
            ...policyResultsToDiagnostics(evaluation.results),
          ];
        }
      } finally {
        await backend.close();
      }

      const policyFailed = exitCodeForDiagnostics(diagnostics) === EXIT_CODES.POLICY_FAILURE;
      const hasUnapprovedCritical = items.some((item) => item.requiresApproval);
      const exitCode = policyFailed
        ? EXIT_CODES.POLICY_FAILURE
        : hasUnapprovedCritical
          ? EXIT_CODES.UNAPPROVED_CRITICAL_CHANGE
          : EXIT_CODES.SUCCESS;

      if (options.out) {
        const planFile = createPlanFile(items, new Date().toISOString());
        writeFileSync(options.out, serializePlanFile(planFile), 'utf-8');
      }

      if (globalOptions.json) {
        process.stdout.write(
          `${JSON.stringify(
            {
              success: exitCode === EXIT_CODES.SUCCESS,
              items,
              policyResults,
              diagnostics: diagnostics.map(diagnosticToJson),
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
        process.stdout.write(`${formatPlanForHumans(items)}\n`);
        process.stdout.write(policyFailed ? 'Policy result: FAILED\n' : 'Policy result: PASSED\n');
        if (hasUnapprovedCritical) {
          process.stdout.write('Critical changes require explicit approval.\n');
        }
        if (options.out) {
          process.stdout.write(`Saved plan to ${options.out}\n`);
        }
      }

      process.exitCode = exitCode;
    });
}

function emitFailure(
  diagnostics: readonly Diagnostic[],
  exitCode: number,
  globalOptions: ReturnType<typeof getGlobalOptions>,
): void {
  if (globalOptions.json) {
    process.stdout.write(
      `${JSON.stringify({ success: false, diagnostics: diagnostics.map(diagnosticToJson) }, null, 2)}\n`,
    );
  } else if (!globalOptions.quiet) {
    process.stdout.write(
      `${formatDiagnosticsForHumans(diagnostics, { color: globalOptions.color })}\n`,
    );
  }
  process.exitCode = exitCode;
}
