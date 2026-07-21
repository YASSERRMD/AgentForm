import { existsSync, readFileSync } from 'node:fs';
import type { Command } from 'commander';
import { checkEvaluationGateStatus, parseTestResultsRecord } from '@agentform/evaluator';
import type { AgentformIR } from '@agentform/ir';
import { BUILTIN_POLICIES, evaluatePolicies, hasPolicyFailures } from '@agentform/policy';
import type { ApplicationState } from '@agentform/state';
import { testResultsPathFor } from './test.js';
import { diagnosticToJson, formatDiagnosticsForHumans } from '../lib/diagnostics-output.js';
import { EXIT_CODES, exitCodeForDiagnostics } from '../lib/exit-codes.js';
import { loadAndBuildIR } from '../lib/pipeline.js';
import { loadPolicyConfig } from '../lib/policy-config.js';
import { openStateBackend } from '../lib/state.js';
import { getGlobalOptions } from '../program.js';

/**
 * Reads back the drift status `agentform drift` last computed and cached
 * on `ApplicationState` — never recomputed here, since a real drift check
 * needs the full pipeline, state, and a policy run (the same cost as
 * `agentform drift` itself), which would make a "quick overview" command
 * as expensive as the command it's supposed to summarize.
 */
function describeDriftStatus(applicationState: ApplicationState | undefined): string {
  if (!applicationState) {
    return 'unknown (nothing has been applied yet)';
  }
  switch (applicationState.driftStatus) {
    case 'unknown':
      return 'never checked (run "agentform drift")';
    case 'in_sync':
      return `in sync (checked at ${applicationState.driftCheckedAt})`;
    case 'drifted':
      return `DRIFTED (checked at ${applicationState.driftCheckedAt}) — run "agentform drift" for details`;
  }
}

function describeEvaluationStatus(ir: AgentformIR, rootDir: string): string {
  const evaluations = ir.evaluations;
  const hasEvaluationsDeclared =
    (evaluations?.datasets?.length ?? 0) > 0 ||
    Object.keys(evaluations?.thresholds ?? {}).length > 0;
  if (!hasEvaluationsDeclared) {
    return 'not applicable (spec.evaluations declares no datasets or thresholds)';
  }

  const resultsPath = testResultsPathFor(rootDir);
  const resultsFile = existsSync(resultsPath)
    ? parseTestResultsRecord(readFileSync(resultsPath, 'utf-8'))
    : undefined;
  const gateStatus = checkEvaluationGateStatus(ir.contentHash, resultsFile);
  switch (gateStatus.kind) {
    case 'never-run':
      return 'never run (run "agentform test")';
    case 'stale':
      return 'stale (specification changed since agentform test last ran)';
    case 'failed':
      return `FAILED (${gateStatus.record.passedTests}/${gateStatus.record.totalTests} passed at ${gateStatus.record.ranAt})`;
    case 'passed':
      return `PASSED (${gateStatus.record.passedTests}/${gateStatus.record.totalTests} at ${gateStatus.record.ranAt})`;
  }
}

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
        driftStatus: describeDriftStatus(applicationState),
        evaluationStatus: describeEvaluationStatus(result.ir, globalOptions.cwd),
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
