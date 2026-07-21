import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import type { Diagnostic } from '@agentform/diagnostics';
import {
  createTestResultsRecord,
  loadDatasets,
  runDataset,
  serializeTestResultsRecord,
  type TestCaseResult,
} from '@agentform/evaluator';
import { computeContentHash } from '@agentform/ir';
import { nodeFileSystem } from '@agentform/parser';
import {
  collectDesiredResources,
  comparePlan,
  verifyPlanFile,
  type PlanItem,
} from '@agentform/planner';
import { BUILTIN_POLICIES, evaluatePolicies } from '@agentform/policy';
import { StateLockError } from '@agentform/state';
import { confirmCriticalChanges } from '../lib/confirm-prompt.js';
import { diagnosticToJson, formatDiagnosticsForHumans } from '../lib/diagnostics-output.js';
import { EXIT_CODES, exitCodeForDiagnostics } from '../lib/exit-codes.js';
import { ADAPTER_REGISTRY, generateArtifacts } from '../lib/generate-artifacts.js';
import { loadAndBuildIR } from '../lib/pipeline.js';
import { formatPlanForHumans, formatPlanSummary } from '../lib/plan-output.js';
import { loadPolicyConfig } from '../lib/policy-config.js';
import { policyResultsToDiagnostics } from '../lib/policy-output.js';
import { redactSecretsFromReport } from '../lib/report-redaction.js';
import { openStateBackend } from '../lib/state.js';
import { CLI_VERSION, getGlobalOptions } from '../program.js';
import { testResultsPathFor } from './test.js';

interface ApplyCommandOptions {
  readonly autoApprove?: boolean;
  readonly target?: string;
  readonly environment?: string;
}

/** The subset of a `PlanItem` that determines whether a saved plan is still valid to apply — comparing full items (including `after`, the desired resource's raw value) would also work, but `operation`/`risk` already fully capture "did anything about this decision change" since `comparePlan` derives both from a resource's content/identity hash. */
function planFingerprint(items: readonly PlanItem[]): string {
  return JSON.stringify(
    [...items]
      .map((item) => ({
        resourceAddress: item.resourceAddress,
        operation: item.operation,
        risk: item.risk,
      }))
      .sort((a, b) => a.resourceAddress.localeCompare(b.resourceAddress)),
  );
}

export function registerApplyCommand(program: Command): void {
  program
    .command('apply')
    .description('Apply the specification: generate artifacts and persist deployed state')
    .argument('[planFile]', 'a saved .afplan file to apply (otherwise a fresh plan is computed)')
    .option(
      '--auto-approve',
      'skip interactive confirmation for critical changes (never bypasses policy checks)',
      false,
    )
    .option('--target <name>', "override the project's declared runtime.target for this apply")
    .option('--environment <name>', 'apply the named environment overlay before applying')
    .action(async (planFile: string | undefined, options: ApplyCommandOptions) => {
      const globalOptions = getGlobalOptions(program);

      if (options.target && !(options.target in ADAPTER_REGISTRY)) {
        if (!globalOptions.quiet) {
          process.stderr.write(
            `Unknown --target "${options.target}" (expected one of: ${Object.keys(ADAPTER_REGISTRY).join(', ')}).\n`,
          );
        }
        process.exitCode = EXIT_CODES.INVALID_USAGE;
        return;
      }

      let savedPlanItems: readonly PlanItem[] | undefined;
      let savedPlanHash: string | undefined;
      if (planFile) {
        let raw: string;
        try {
          raw = readFileSync(planFile, 'utf-8');
        } catch {
          if (!globalOptions.quiet) {
            process.stderr.write(`Cannot read plan file "${planFile}".\n`);
          }
          process.exitCode = EXIT_CODES.APPLY_FAILURE;
          return;
        }
        const verification = verifyPlanFile(raw);
        if (!verification.valid || !verification.planFile) {
          if (!globalOptions.quiet) {
            process.stderr.write(`${verification.error ?? 'invalid plan file'}\n`);
          }
          process.exitCode = EXIT_CODES.APPLY_FAILURE;
          return;
        }
        savedPlanItems = verification.planFile.items;
        savedPlanHash = verification.planFile.contentHash;
      }

      // Step 3: revalidate source — always, even with a saved plan file,
      // since the plan file only proves it was a valid plan *when made*.
      const result = loadAndBuildIR({
        rootDir: globalOptions.cwd,
        environment: options.environment,
      });
      if (!result.ir || !result.application) {
        emitFailure(result.diagnostics, exitCodeForDiagnostics(result.diagnostics), globalOptions);
        return;
      }

      const target = options.target ?? result.ir.application.runtime.target;
      // Guaranteed present: `target` is either the schema-validated
      // `runtime.target` enum value, or an explicit `--target` already
      // checked against `ADAPTER_REGISTRY` above.
      const adapter = ADAPTER_REGISTRY[target]!;

      // Step 1: acquire the state lock.
      const backend = await openStateBackend(globalOptions.cwd);
      try {
        await backend.acquireLock({ reason: 'agentform apply' });
      } catch (error) {
        await backend.close();
        if (error instanceof StateLockError) {
          if (!globalOptions.quiet) {
            process.stderr.write(
              `State is locked by ${error.holder.holder} (acquired ${error.holder.acquiredAt}${error.holder.reason ? `, reason: ${error.holder.reason}` : ''}).\n`,
            );
          }
          process.exitCode = EXIT_CODES.STATE_LOCK_FAILURE;
          return;
        }
        throw error;
      }

      try {
        // Step 2: compute the plan against the current deployed state —
        // always fresh, whether or not a saved plan file was given.
        const currentResourceStates = await backend.listResourceStates();
        const items = comparePlan({ ir: result.ir, currentResourceStates });

        if (savedPlanItems && planFingerprint(savedPlanItems) !== planFingerprint(items)) {
          if (!globalOptions.quiet) {
            process.stderr.write(
              'The saved plan is stale — the specification or deployed state has changed since it was created. Run "agentform plan" again and retry.\n',
            );
          }
          process.exitCode = EXIT_CODES.APPLY_FAILURE;
          return;
        }

        const actionable = items.filter((item) => item.operation !== 'NO_OP');
        if (actionable.length === 0) {
          if (globalOptions.json) {
            process.stdout.write(
              `${JSON.stringify({ success: true, items, applied: false }, null, 2)}\n`,
            );
          } else if (!globalOptions.quiet) {
            process.stdout.write('No changes. The deployed state matches the specification.\n');
          }
          process.exitCode = EXIT_CODES.SUCCESS;
          return;
        }

        // Step 4: re-run policy checks — never skipped, not even with
        // --auto-approve (§15.9 "--auto-approve must not bypass
        // organization policies").
        const policyConfig = loadPolicyConfig(globalOptions.cwd);
        if (policyConfig.diagnostics.some((d) => d.severity === 'error')) {
          emitFailure(policyConfig.diagnostics, EXIT_CODES.POLICY_FAILURE, globalOptions);
          return;
        }
        const policyEvaluation = evaluatePolicies(
          BUILTIN_POLICIES,
          { application: result.application },
          policyConfig.config,
        );
        const policyDiagnostics = [
          ...policyEvaluation.diagnostics,
          ...policyResultsToDiagnostics(policyEvaluation.results),
        ];
        if (policyEvaluation.results.some((r) => r.status === 'fail')) {
          emitFailure(policyDiagnostics, EXIT_CODES.POLICY_FAILURE, globalOptions);
          return;
        }

        // Step 5: confirm critical-risk actions.
        const criticalItems = actionable.filter((item) => item.requiresApproval);
        if (criticalItems.length > 0 && !options.autoApprove) {
          const interactive =
            Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY) && !globalOptions.quiet;
          if (!interactive) {
            if (!globalOptions.quiet) {
              process.stderr.write(
                `${criticalItems.length} change(s) are CRITICAL risk and require explicit approval — re-run with --auto-approve, or from an interactive terminal to confirm.\n`,
              );
            }
            process.exitCode = EXIT_CODES.UNAPPROVED_CRITICAL_CHANGE;
            return;
          }
          process.stdout.write(formatPlanForHumans(items));
          const approved = await confirmCriticalChanges(
            criticalItems.map((item) => item.resourceAddress),
            { input: process.stdin, output: process.stdout },
          );
          if (!approved) {
            process.stdout.write('Not approved — no changes were made.\n');
            process.exitCode = EXIT_CODES.UNAPPROVED_CRITICAL_CHANGE;
            return;
          }
        }

        // Step 6: back up state before any mutation.
        const backupId = await backend.createBackup();

        const applyId = crypto.randomUUID();
        const startedAt = new Date().toISOString();
        await backend.recordApplyStart({
          id: applyId,
          startedAt,
          backupId,
          planHash: savedPlanHash,
        });

        // Step 7: generate artifacts.
        const outputRoot = path.resolve(globalOptions.cwd, './generated');
        const generation = await generateArtifacts(
          target,
          adapter,
          result.ir,
          outputRoot,
          CLI_VERSION,
          false,
        );
        const generationFailed =
          generation.filesWritten === 0 ||
          generation.diagnostics.some((d) => d.severity === 'error');
        if (generationFailed) {
          await backend.recordApplyFinish(applyId, 'failed', 'artifact generation failed');
          emitFailure(generation.diagnostics, EXIT_CODES.COMPILATION_FAILURE, globalOptions);
          return;
        }

        // Step 8: deploy or materialize the target. No adapter implements
        // `deploy` yet (Phase 9's six adapters are all "generate code you
        // run yourself," not push-button deployers) — when one does, this
        // is the hook that calls it; until then, writing the generated
        // project to disk (step 7) *is* the materialization.
        let deploymentId: string | undefined;
        if (adapter.deploy && generation.project) {
          const deployment = await adapter.deploy(generation.project, {
            environment: result.ir.application.runtime.environment,
          });
          if (!deployment.succeeded) {
            await backend.recordApplyFinish(applyId, 'failed', 'deployment failed');
            if (!globalOptions.quiet) {
              process.stderr.write(`Deployment to "${target}" failed.\n`);
            }
            process.exitCode = EXIT_CODES.APPLY_FAILURE;
            return;
          }
          deploymentId = deployment.deploymentId;
        }

        // Step 9: run smoke tests — the same deterministic dataset run
        // `agentform test` performs, gating apply the same way a failed
        // evaluation gate is meant to (docs/evaluation-reference.md).
        const datasetPaths = result.ir.evaluations?.datasets ?? [];
        let testResults: readonly TestCaseResult[] = [];
        if (datasetPaths.length > 0) {
          const testCases = loadDatasets(nodeFileSystem, globalOptions.cwd, datasetPaths);
          testResults = runDataset(result.ir, testCases, { policyPassed: true });
          const testResultsRecord = createTestResultsRecord({
            ranAt: new Date().toISOString(),
            irHash: result.ir.contentHash,
            success: testResults.every((r) => r.passed),
            totalTests: testResults.length,
            passedTests: testResults.filter((r) => r.passed).length,
          });
          const resultsPath = testResultsPathFor(globalOptions.cwd);
          mkdirSync(path.dirname(resultsPath), { recursive: true });
          writeFileSync(resultsPath, serializeTestResultsRecord(testResultsRecord), 'utf-8');
          if (!testResultsRecord.success) {
            await backend.recordApplyFinish(applyId, 'failed', 'smoke tests failed');
            if (!globalOptions.quiet) {
              process.stdout.write(
                redactSecretsFromReport(
                  `Smoke tests failed: ${testResultsRecord.passedTests}/${testResultsRecord.totalTests} passed.\n`,
                ),
              );
            }
            process.exitCode = EXIT_CODES.TEST_FAILURE;
            return;
          }
        }

        // Step 10: persist state atomically.
        const desiredByAddress = new Map(
          collectDesiredResources(result.ir).map((resource) => [resource.address, resource]),
        );
        const previousApplicationState = await backend.getApplicationState();
        await backend.withTransaction(async () => {
          for (const item of actionable) {
            if (item.operation === 'DELETE') {
              await backend.deleteResourceState(item.resourceAddress);
              continue;
            }
            const desired = desiredByAddress.get(item.resourceAddress);
            if (!desired) {
              continue;
            }
            await backend.putResourceState({
              address: desired.address,
              kind: desired.kind,
              contentHash: desired.contentHash,
              identityHash: desired.identityHash,
              dependsOn: desired.dependsOn,
              lastAppliedAt: startedAt,
            });
          }

          await backend.putApplicationState({
            applicationName: result.ir!.application.name,
            environment: result.ir!.application.runtime.environment,
            specificationHash: computeContentHash(result.application),
            irHash: result.ir!.contentHash,
            schemaVersion: result.ir!.application.apiVersion,
            adapterVersions: {
              ...previousApplicationState?.adapterVersions,
              [target]: adapter.manifest.version,
            },
            deploymentIdentifiers: deploymentId
              ? { ...previousApplicationState?.deploymentIdentifiers, [target]: deploymentId }
              : (previousApplicationState?.deploymentIdentifiers ?? {}),
            lastAppliedAt: startedAt,
            driftStatus: 'unknown',
          });

          await backend.recordApplyFinish(applyId, 'succeeded', formatPlanSummary(actionable));
        });

        if (globalOptions.json) {
          process.stdout.write(
            `${JSON.stringify(
              {
                success: true,
                applyId,
                items,
                policyDiagnostics: policyDiagnostics.map(diagnosticToJson),
                filesWritten: generation.filesWritten,
                outputDir: generation.outputDir,
              },
              null,
              2,
            )}\n`,
          );
        } else if (!globalOptions.quiet) {
          if (policyDiagnostics.length > 0) {
            process.stdout.write(
              `${formatDiagnosticsForHumans(policyDiagnostics, { color: globalOptions.color })}\n`,
            );
          }
          process.stdout.write(formatPlanForHumans(items));
          process.stdout.write(
            `Apply complete. Wrote ${generation.filesWritten} files to ${generation.outputDir}.\n`,
          );
        }
        process.exitCode = EXIT_CODES.SUCCESS;
      } finally {
        // Step 11: release the lock, even on failure.
        await backend.releaseLock();
        await backend.close();
      }
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
