import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import type { Diagnostic } from '@agentform/diagnostics';
import {
  createTestResultsRecord,
  evaluateThresholds,
  loadDatasets,
  runDataset,
  serializeTestResultsRecord,
  type RunSummary,
  type TestCaseResult,
} from '@agentform/evaluator';
import { nodeFileSystem } from '@agentform/parser';
import { BUILTIN_POLICIES, evaluatePolicies } from '@agentform/policy';
import { diagnosticToJson, formatDiagnosticsForHumans } from '../lib/diagnostics-output.js';
import { EXIT_CODES, exitCodeForDiagnostics } from '../lib/exit-codes.js';
import { formatJUnitXml } from '../lib/junit-output.js';
import { loadAndBuildIR } from '../lib/pipeline.js';
import { loadPolicyConfig } from '../lib/policy-config.js';
import { policyResultsToDiagnostics } from '../lib/policy-output.js';
import { stateDirFor } from '../lib/state.js';
import { formatTestResultsForHumans } from '../lib/test-output.js';
import { getGlobalOptions } from '../program.js';

/** `.agentform/test-results.json` — a tamper-evident record `agentform plan` reads to warn when a production environment's evaluation gates haven't actually been run (or passed) for the specification as it exists right now, not just declared (§10's `.agentform/` layout convention, extended the same way `state.db`/`lock` already live there). */
export function testResultsPathFor(rootDir: string): string {
  return path.join(stateDirFor(rootDir), 'test-results.json');
}

interface TestCommandOptions {
  readonly environment?: string;
  readonly junit?: string;
  readonly live?: boolean;
}

export function registerTestCommand(program: Command): void {
  program
    .command('test')
    .description(
      'Run the specification’s evaluation datasets against the deterministic mock runtime',
    )
    .option('--environment <name>', 'apply the named environment overlay before testing')
    .option('--junit <file>', 'also write a JUnit XML report to this file')
    .option(
      '--live',
      'run against real model/tool providers instead of mocks (not yet implemented)',
      false,
    )
    .action(async (options: TestCommandOptions) => {
      const globalOptions = getGlobalOptions(program);

      if (options.live) {
        if (!globalOptions.quiet) {
          process.stderr.write(
            'agentform test --live is not yet implemented — every run is offline/mocked today. ' +
              'Remove --live to run the deterministic mock suite.\n',
          );
        }
        process.exitCode = EXIT_CODES.INVALID_USAGE;
        return;
      }

      const result = loadAndBuildIR({
        rootDir: globalOptions.cwd,
        environment: options.environment,
      });

      if (!result.ir || !result.application) {
        const exitCode = exitCodeForDiagnostics(result.diagnostics);
        emitFailure(result.diagnostics, exitCode, globalOptions);
        return;
      }

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
      const policyPassed = !policyEvaluation.results.some((r) => r.status === 'fail');
      const policyViolationCount = policyEvaluation.results.filter(
        (r) => r.status === 'fail',
      ).length;

      const datasetPaths = result.ir.evaluations?.datasets ?? [];
      let results: readonly TestCaseResult[];
      try {
        const testCases = loadDatasets(nodeFileSystem, globalOptions.cwd, datasetPaths);
        results = runDataset(result.ir, testCases, { policyPassed });
      } catch (error) {
        if (!globalOptions.quiet) {
          process.stderr.write(`${(error as Error).message}\n`);
        }
        process.exitCode = EXIT_CODES.TEST_FAILURE;
        return;
      }

      const summary: RunSummary = {
        totalTests: results.length,
        passedTests: results.filter((r) => r.passed).length,
        totalCostUsd: results.reduce((sum, r) => sum + r.trace.costUsd, 0),
        policyViolationCount,
      };
      const thresholdResults = evaluateThresholds(result.ir.evaluations?.thresholds ?? {}, summary);

      const allTestsPassed = results.every((r) => r.passed);
      const allThresholdsPassed = thresholdResults
        .filter((gate) => gate.recognized)
        .every((gate) => gate.passed);
      const success = allTestsPassed && allThresholdsPassed;

      const resultsRecord = createTestResultsRecord({
        ranAt: new Date().toISOString(),
        irHash: result.ir.contentHash,
        success,
        totalTests: summary.totalTests,
        passedTests: summary.passedTests,
      });
      const resultsPath = testResultsPathFor(globalOptions.cwd);
      mkdirSync(path.dirname(resultsPath), { recursive: true });
      writeFileSync(resultsPath, serializeTestResultsRecord(resultsRecord), 'utf-8');

      if (options.junit) {
        writeFileSync(options.junit, formatJUnitXml(results), 'utf-8');
      }

      if (globalOptions.json) {
        process.stdout.write(
          `${JSON.stringify(
            {
              success,
              results,
              thresholds: thresholdResults,
              policyDiagnostics: policyDiagnostics.map(diagnosticToJson),
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
        process.stdout.write(formatTestResultsForHumans(results, thresholdResults));
        if (options.junit) {
          process.stdout.write(`Wrote JUnit report to ${options.junit}\n`);
        }
      }

      process.exitCode = success ? EXIT_CODES.SUCCESS : EXIT_CODES.TEST_FAILURE;
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
