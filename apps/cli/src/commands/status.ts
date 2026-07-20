import type { Command } from 'commander';
import { BUILTIN_POLICIES, evaluatePolicies, hasPolicyFailures } from '@agentform/policy';
import { diagnosticToJson, formatDiagnosticsForHumans } from '../lib/diagnostics-output.js';
import { EXIT_CODES, exitCodeForDiagnostics } from '../lib/exit-codes.js';
import { loadAndBuildIR } from '../lib/pipeline.js';
import { loadPolicyConfig } from '../lib/policy-config.js';
import { openStateBackend } from '../lib/state.js';
import { getGlobalOptions } from '../program.js';

interface StatusCommandOptions {
  readonly environment?: string;
}

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show the application, deployed state, and policy status')
    .option('--environment <name>', 'apply the named environment overlay before checking status')
    .action(async (options: StatusCommandOptions) => {
      const globalOptions = getGlobalOptions(program);
      const result = loadAndBuildIR({
        rootDir: globalOptions.cwd,
        environment: options.environment,
      });

      if (!result.ir || !result.application) {
        const exitCode = exitCodeForDiagnostics(result.diagnostics);
        if (globalOptions.json) {
          process.stdout.write(
            `${JSON.stringify({ success: false, diagnostics: result.diagnostics.map(diagnosticToJson) }, null, 2)}\n`,
          );
        } else if (!globalOptions.quiet) {
          process.stdout.write(
            `${formatDiagnosticsForHumans(result.diagnostics, { color: globalOptions.color })}\n`,
          );
        }
        process.exitCode = exitCode;
        return;
      }

      const backend = await openStateBackend(globalOptions.cwd);
      let applicationState;
      let resourceStates;
      let lastApply;
      try {
        applicationState = await backend.getApplicationState();
        resourceStates = await backend.listResourceStates();
        [lastApply] = await backend.listApplyHistory(1);
      } finally {
        await backend.close();
      }

      const policyConfig = loadPolicyConfig(globalOptions.cwd);
      const policyEvaluation = policyConfig.diagnostics.some((d) => d.severity === 'error')
        ? undefined
        : evaluatePolicies(
            BUILTIN_POLICIES,
            { application: result.application },
            policyConfig.config,
          );
      const policyStatus = !policyEvaluation
        ? 'unknown (policy configuration is invalid)'
        : hasPolicyFailures(policyEvaluation.results)
          ? 'FAILED'
          : policyEvaluation.results.some((r) => r.status === 'warn')
            ? 'PASSED (with warnings)'
            : 'PASSED';

      const status = {
        application: result.ir.application.name,
        environment: result.ir.application.runtime.environment,
        target: result.ir.application.runtime.target,
        lastApply: lastApply ? `${lastApply.status} at ${lastApply.startedAt}` : 'never applied',
        resourceCount: resourceStates.length,
        adapterVersions: applicationState?.adapterVersions ?? {},
        stateBackend: backend.kind,
        driftStatus: 'unknown (drift detection is not implemented until a later phase)',
        evaluationStatus: 'unknown (the evaluation engine is not implemented until a later phase)',
        policyStatus,
      };

      if (globalOptions.json) {
        process.stdout.write(`${JSON.stringify({ success: true, status }, null, 2)}\n`);
      } else if (!globalOptions.quiet) {
        const lines = [
          `Application:   ${status.application}`,
          `Environment:   ${status.environment}`,
          `Target:        ${status.target}`,
          `Last apply:    ${status.lastApply}`,
          `Resources:     ${status.resourceCount} tracked`,
          `Adapters:      ${
            Object.keys(status.adapterVersions).length > 0
              ? Object.entries(status.adapterVersions)
                  .map(([k, v]) => `${k}@${v}`)
                  .join(', ')
              : 'none recorded'
          }`,
          `State backend: ${status.stateBackend}`,
          `Drift:         ${status.driftStatus}`,
          `Evaluation:    ${status.evaluationStatus}`,
          `Policy:        ${status.policyStatus}`,
        ];
        process.stdout.write(`${lines.join('\n')}\n`);
      }

      process.exitCode = EXIT_CODES.SUCCESS;
    });
}
