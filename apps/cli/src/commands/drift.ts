import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import type { ApplicationState } from '@agentform/state';
import type { AgentformIR } from '@agentform/ir';
import { comparePlan, type PlanItem } from '@agentform/planner';
import { BUILTIN_POLICIES, evaluatePolicies } from '@agentform/policy';
import type { GeneratedManifest } from '@agentform/plugin-sdk';
import { diagnosticToJson, formatDiagnosticsForHumans } from '../lib/diagnostics-output.js';
import { EXIT_CODES, exitCodeForDiagnostics } from '../lib/exit-codes.js';
import { ADAPTER_REGISTRY } from '../lib/generate-artifacts.js';
import { loadAndBuildIR } from '../lib/pipeline.js';
import { loadPolicyConfig } from '../lib/policy-config.js';
import { policyResultsToDiagnostics } from '../lib/policy-output.js';
import { openStateBackend } from '../lib/state.js';
import { getGlobalOptions } from '../program.js';

interface EnvironmentDrift {
  readonly recorded: string;
  readonly current: string;
}

interface AdapterVersionDrift {
  readonly target: string;
  readonly recorded: string;
  readonly current: string;
}

interface ArtifactDrift {
  readonly target: string;
  readonly reason: string;
}

export interface DriftReport {
  readonly resourceDrift: readonly PlanItem[];
  readonly environmentDrift?: EnvironmentDrift;
  readonly adapterVersionDrift?: AdapterVersionDrift;
  readonly artifactDrift?: ArtifactDrift;
  readonly policyStatus: 'PASSED' | 'PASSED (with warnings)' | 'FAILED';
  readonly hasDrift: boolean;
}

function checkEnvironmentDrift(
  ir: AgentformIR,
  applicationState: ApplicationState | undefined,
): EnvironmentDrift | undefined {
  if (!applicationState || applicationState.environment === ir.application.runtime.environment) {
    return undefined;
  }
  return { recorded: applicationState.environment, current: ir.application.runtime.environment };
}

function checkAdapterVersionDrift(
  target: string,
  applicationState: ApplicationState | undefined,
): AdapterVersionDrift | undefined {
  const recorded = applicationState?.adapterVersions[target];
  const adapter = ADAPTER_REGISTRY[target];
  if (!recorded || !adapter || recorded === adapter.manifest.version) {
    return undefined;
  }
  return { target, recorded, current: adapter.manifest.version };
}

/**
 * Compares the current specification's IR content hash against the
 * `irHash` recorded in `generated/<target>/manifest.json`, if that file
 * exists — the same signal ADR-0009's manifest hashing was built for
 * ("detectable by recompiling and diffing against the manifest's recorded
 * hashes", `docs/security/threat-model.md`). Only checks the one target
 * `agentform apply`/`agentform compile` would use by default; a project
 * with generated output for multiple targets on disk only has its
 * *current* target's freshness checked.
 */
function checkArtifactDrift(
  rootDir: string,
  ir: AgentformIR,
  target: string,
): ArtifactDrift | undefined {
  const manifestPath = path.join(rootDir, 'generated', target, 'manifest.json');
  if (!existsSync(manifestPath)) {
    return undefined;
  }
  let manifest: GeneratedManifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as GeneratedManifest;
  } catch {
    return { target, reason: 'existing manifest.json could not be read' };
  }
  if (manifest.irHash !== ir.contentHash) {
    return {
      target,
      reason: 'generated artifacts were produced from an earlier version of the specification',
    };
  }
  return undefined;
}

export function registerDriftCommand(program: Command): void {
  program
    .command('drift')
    .description('Detect differences between the specification and deployed state')
    .option(
      '--exit-code',
      'exit 12 when drift is detected (otherwise drift is reported but not an error)',
      false,
    )
    .option('--environment <name>', 'apply the named environment overlay before checking drift')
    .option('--target <name>', "override the project's declared runtime.target for this check")
    .action(async (options: { exitCode?: boolean; environment?: string; target?: string }) => {
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

      const result = loadAndBuildIR({
        rootDir: globalOptions.cwd,
        environment: options.environment,
      });
      if (!result.ir || !result.application) {
        if (globalOptions.json) {
          process.stdout.write(
            `${JSON.stringify({ success: false, diagnostics: result.diagnostics.map(diagnosticToJson) }, null, 2)}\n`,
          );
        } else if (!globalOptions.quiet) {
          process.stdout.write(
            `${formatDiagnosticsForHumans(result.diagnostics, { color: globalOptions.color })}\n`,
          );
        }
        process.exitCode = exitCodeForDiagnostics(result.diagnostics);
        return;
      }

      const target = options.target ?? result.ir.application.runtime.target;
      const backend = await openStateBackend(globalOptions.cwd);
      let applicationState: ApplicationState | undefined;
      let resourceDrift: readonly PlanItem[];
      try {
        applicationState = await backend.getApplicationState();
        const currentResourceStates = await backend.listResourceStates();
        resourceDrift = comparePlan({ ir: result.ir, currentResourceStates }).filter(
          (item) => item.operation !== 'NO_OP',
        );

        const environmentDrift = checkEnvironmentDrift(result.ir, applicationState);
        const adapterVersionDrift = checkAdapterVersionDrift(target, applicationState);
        const artifactDrift = checkArtifactDrift(globalOptions.cwd, result.ir, target);

        const policyConfig = loadPolicyConfig(globalOptions.cwd);
        const policyEvaluation = policyConfig.diagnostics.some((d) => d.severity === 'error')
          ? undefined
          : evaluatePolicies(
              BUILTIN_POLICIES,
              { application: result.application },
              policyConfig.config,
            );
        const policyStatus: DriftReport['policyStatus'] = !policyEvaluation
          ? 'FAILED'
          : policyEvaluation.results.some((r) => r.status === 'fail')
            ? 'FAILED'
            : policyEvaluation.results.some((r) => r.status === 'warn')
              ? 'PASSED (with warnings)'
              : 'PASSED';

        const hasDrift =
          resourceDrift.length > 0 ||
          Boolean(environmentDrift) ||
          Boolean(adapterVersionDrift) ||
          Boolean(artifactDrift);

        const report: DriftReport = {
          resourceDrift,
          environmentDrift,
          adapterVersionDrift,
          artifactDrift,
          policyStatus,
          hasDrift,
        };

        // Cache the result — `agentform status` reads this back rather
        // than recomputing drift on every invocation (recomputing needs
        // the full pipeline, state, and policy, the same cost as this
        // command itself). Only meaningful once something has been
        // applied; before that there's no baseline to compare against.
        if (applicationState) {
          await backend.recordDriftStatus(
            hasDrift ? 'drifted' : 'in_sync',
            new Date().toISOString(),
          );
        }

        if (globalOptions.json) {
          process.stdout.write(
            `${JSON.stringify(
              {
                success: true,
                ...report,
                policyDiagnostics: policyEvaluation
                  ? policyResultsToDiagnostics(policyEvaluation.results).map(diagnosticToJson)
                  : [],
              },
              null,
              2,
            )}\n`,
          );
        } else if (!globalOptions.quiet) {
          process.stdout.write(formatDriftReport(report));
        }

        process.exitCode =
          options.exitCode && hasDrift ? EXIT_CODES.DRIFT_DETECTED : EXIT_CODES.SUCCESS;
      } finally {
        await backend.close();
      }
    });
}

function formatDriftReport(report: DriftReport): string {
  if (!report.hasDrift) {
    return `No drift detected. Policy: ${report.policyStatus}.\n`;
  }

  const lines: string[] = ['Drift detected:', ''];

  for (const item of report.resourceDrift) {
    lines.push(`  ~ ${item.resourceAddress}: ${item.operation.toLowerCase()}`);
    for (const reason of item.reasons) {
      lines.push(`      ${reason}`);
    }
  }

  if (report.environmentDrift) {
    lines.push(
      `  ~ environment: "${report.environmentDrift.recorded}" -> "${report.environmentDrift.current}"`,
    );
  }

  if (report.adapterVersionDrift) {
    lines.push(
      `  ~ adapter "${report.adapterVersionDrift.target}": ${report.adapterVersionDrift.recorded} -> ${report.adapterVersionDrift.current}`,
    );
  }

  if (report.artifactDrift) {
    lines.push(
      `  ~ generated artifacts (${report.artifactDrift.target}): ${report.artifactDrift.reason}`,
    );
  }

  lines.push('', `Policy: ${report.policyStatus}.`);
  return `${lines.join('\n')}\n`;
}
