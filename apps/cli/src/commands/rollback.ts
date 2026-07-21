import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import type { Diagnostic } from '@agentform/diagnostics';
import { BUILTIN_POLICIES, evaluatePolicies } from '@agentform/policy';
import { StateLockError, type ApplyHistoryEntry } from '@agentform/state';
import { confirmAction } from '../lib/confirm-prompt.js';
import { diagnosticToJson, formatDiagnosticsForHumans } from '../lib/diagnostics-output.js';
import { EXIT_CODES, exitCodeForDiagnostics } from '../lib/exit-codes.js';
import { ADAPTER_REGISTRY, generateArtifacts } from '../lib/generate-artifacts.js';
import { loadAndBuildIR } from '../lib/pipeline.js';
import { loadPolicyConfig } from '../lib/policy-config.js';
import { policyResultsToDiagnostics } from '../lib/policy-output.js';
import { openStateBackend } from '../lib/state.js';
import { CLI_VERSION, getGlobalOptions } from '../program.js';
import { testResultsPathFor } from './test.js';

interface RollbackCommandOptions {
  readonly to?: string;
  readonly snapshot?: string;
  readonly autoApprove?: boolean;
  readonly target?: string;
  readonly environment?: string;
}

interface RollbackTarget {
  readonly backupId: string;
  readonly description: string;
}

/** Resolves which backup to restore, per §15.13's three selectable targets. Never touches the live database — just picks an id and describes it for the confirmation prompt. */
function resolveRollbackTarget(
  options: RollbackCommandOptions,
  history: readonly ApplyHistoryEntry[],
): { readonly target?: RollbackTarget; readonly error?: string } {
  if (options.snapshot) {
    return {
      target: { backupId: options.snapshot, description: `snapshot "${options.snapshot}"` },
    };
  }
  if (options.to) {
    const entry = history.find((h) => h.id === options.to);
    if (!entry) {
      return { error: `No apply history entry with id "${options.to}".` };
    }
    if (!entry.backupId) {
      return {
        error: `Apply history entry "${options.to}" has no associated backup to roll back to.`,
      };
    }
    return {
      target: { backupId: entry.backupId, description: `apply "${options.to}" (${entry.status})` },
    };
  }
  // Default: undo the most recent apply, landing back at whatever was
  // true right before it ran — which, assuming no other apply has run
  // since, is exactly the state as of the previous successful apply.
  const [mostRecent] = history;
  if (!mostRecent?.backupId) {
    return { error: 'No apply history with a backup exists yet — nothing to roll back to.' };
  }
  return {
    target: {
      backupId: mostRecent.backupId,
      description: `apply "${mostRecent.id}" (${mostRecent.status})`,
    },
  };
}

export function registerRollbackCommand(program: Command): void {
  program
    .command('rollback')
    .description('Restore deployed state to a previous apply or snapshot')
    .option('--to <applyId>', 'roll back to the state right before this specific apply ran')
    .option('--snapshot <backupId>', 'roll back directly to a specific state snapshot')
    .option('--auto-approve', 'skip interactive confirmation', false)
    .option('--target <name>', "override the project's declared runtime.target for regeneration")
    .option('--environment <name>', 'apply the named environment overlay before regenerating')
    .action(async (options: RollbackCommandOptions) => {
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
      if (options.to && options.snapshot) {
        if (!globalOptions.quiet) {
          process.stderr.write('--to and --snapshot cannot be used together.\n');
        }
        process.exitCode = EXIT_CODES.INVALID_USAGE;
        return;
      }

      // Regeneration (§15.13) needs a valid, buildable current
      // specification — the same "revalidate source" discipline apply
      // itself follows.
      const result = loadAndBuildIR({
        rootDir: globalOptions.cwd,
        environment: options.environment,
      });
      if (!result.ir || !result.application) {
        emitFailure(result.diagnostics, exitCodeForDiagnostics(result.diagnostics), globalOptions);
        return;
      }
      const target = options.target ?? result.ir.application.runtime.target;
      const adapter = ADAPTER_REGISTRY[target]!;

      const backend = await openStateBackend(globalOptions.cwd);
      try {
        await backend.acquireLock({ reason: 'agentform rollback' });
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
        const history = await backend.listApplyHistory();
        const { target: rollbackTarget, error } = resolveRollbackTarget(options, history);
        if (!rollbackTarget) {
          if (!globalOptions.quiet) {
            process.stderr.write(`${error}\n`);
          }
          process.exitCode = EXIT_CODES.ROLLBACK_FAILURE;
          return;
        }

        const snapshot = await backend.readBackupSnapshot(rollbackTarget.backupId).catch((err) => {
          throw new Error(
            `Cannot read backup "${rollbackTarget.backupId}": ${(err as Error).message}`,
          );
        });

        const currentResourceStates = await backend.listResourceStates();
        const currentByAddress = new Map(currentResourceStates.map((r) => [r.address, r]));
        const snapshotByAddress = new Map(snapshot.resourceStates.map((r) => [r.address, r]));
        const toRemove = currentResourceStates.filter((r) => !snapshotByAddress.has(r.address));
        const toRestore = snapshot.resourceStates.filter(
          (r) => currentByAddress.get(r.address)?.contentHash !== r.contentHash,
        );

        if (toRemove.length === 0 && toRestore.length === 0) {
          if (globalOptions.json) {
            process.stdout.write(
              `${JSON.stringify({ success: true, rolledBack: false, target: rollbackTarget }, null, 2)}\n`,
            );
          } else if (!globalOptions.quiet) {
            process.stdout.write(
              `Already at the state of ${rollbackTarget.description} — nothing to roll back.\n`,
            );
          }
          process.exitCode = EXIT_CODES.SUCCESS;
          return;
        }

        // Re-run policy against the *current* specification — the same
        // "never skip, not even with --auto-approve" discipline apply
        // uses, since rollback also regenerates artifacts from it.
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
        if (policyEvaluation.results.some((r) => r.status === 'fail')) {
          emitFailure(
            [
              ...policyEvaluation.diagnostics,
              ...policyResultsToDiagnostics(policyEvaluation.results),
            ],
            EXIT_CODES.POLICY_FAILURE,
            globalOptions,
          );
          return;
        }

        if (!options.autoApprove) {
          const interactive =
            Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY) && !globalOptions.quiet;
          const message = [
            `\nThis will roll back to ${rollbackTarget.description}:`,
            ...toRestore.map((r) => `  ~ ${r.address} will be restored`),
            ...toRemove.map(
              (r) => `  - ${r.address} will be removed (not present in the snapshot)`,
            ),
            '',
          ].join('\n');
          if (!interactive) {
            if (!globalOptions.quiet) {
              process.stderr.write(
                `${message}\nRe-run with --auto-approve, or from an interactive terminal to confirm.\n`,
              );
            }
            process.exitCode = EXIT_CODES.ROLLBACK_FAILURE;
            return;
          }
          const approved = await confirmAction(message, {
            input: process.stdin,
            output: process.stdout,
          });
          if (!approved) {
            process.stdout.write('Not approved — no changes were made.\n');
            process.exitCode = EXIT_CODES.ROLLBACK_FAILURE;
            return;
          }
        }

        // Back up the *current* (pre-rollback) state before mutating —
        // the same safety-first ordering apply uses, so a rollback can
        // itself be rolled back.
        const preRollbackBackupId = await backend.createBackup();
        const rollbackId = crypto.randomUUID();
        const startedAt = new Date().toISOString();
        await backend.recordApplyStart({
          id: rollbackId,
          startedAt,
          backupId: preRollbackBackupId,
          summary: `rollback to ${rollbackTarget.description}`,
        });

        try {
          // State restoration — apply just the resource/application-state
          // diff, inside one transaction. Apply history is never touched
          // here (§15.13 "must never delete audit history"): every row
          // written before this point, including entries for applies more
          // recent than the snapshot being restored to, stays exactly as
          // it was.
          await backend.withTransaction(async () => {
            for (const removed of toRemove) {
              await backend.deleteResourceState(removed.address);
            }
            for (const restored of toRestore) {
              await backend.putResourceState(restored);
            }
            if (snapshot.applicationState) {
              await backend.putApplicationState({
                ...snapshot.applicationState,
                driftStatus: 'unknown',
              });
            }
          });

          // Regeneration — always re-generated from the *current*
          // on-disk specification, since Agentform never stores a raw
          // historical specification to regenerate from exactly (only
          // content hashes — see docs/state-reference.md). If the current
          // spec has moved on since the snapshot was taken, this is
          // surfaced honestly rather than silently producing artifacts
          // that don't actually match the restored state.
          const outputRoot = path.resolve(globalOptions.cwd, './generated');
          const generation = await generateArtifacts(
            target,
            adapter,
            result.ir,
            outputRoot,
            CLI_VERSION,
            false,
          );
          const regenerationStale = snapshot.applicationState
            ? snapshot.applicationState.irHash !== result.ir.contentHash
            : false;

          // The last recorded test-results.json (if any) was for whatever
          // specification was live before this rollback — deleting it
          // makes agentform plan/status honestly report "never run"
          // rather than keep showing a stale PASSED/FAILED verdict that
          // no longer describes what's actually deployed now.
          const resultsPath = testResultsPathFor(globalOptions.cwd);
          if (existsSync(resultsPath)) {
            unlinkSync(resultsPath);
          }

          await backend.recordApplyFinish(
            rollbackId,
            'succeeded',
            `restored ${toRestore.length} resource(s), removed ${toRemove.length}`,
          );

          if (globalOptions.json) {
            process.stdout.write(
              `${JSON.stringify(
                {
                  success: true,
                  rolledBack: true,
                  rollbackId,
                  target: rollbackTarget,
                  restored: toRestore.map((r) => r.address),
                  removed: toRemove.map((r) => r.address),
                  regenerationStale,
                  filesWritten: generation.filesWritten,
                },
                null,
                2,
              )}\n`,
            );
          } else if (!globalOptions.quiet) {
            process.stdout.write(`Rolled back to ${rollbackTarget.description}.\n`);
            for (const r of toRestore) {
              process.stdout.write(`  ~ ${r.address} restored\n`);
            }
            for (const r of toRemove) {
              process.stdout.write(`  - ${r.address} removed\n`);
            }
            if (regenerationStale) {
              process.stdout.write(
                '\nNote: the current specification has changed since this snapshot — regenerated artifacts reflect the CURRENT specification, not necessarily the one active at that point.\n',
              );
            }
            process.stdout.write(
              `Regenerated ${generation.filesWritten} files at ${generation.outputDir}.\n`,
            );
          }
          process.exitCode = EXIT_CODES.SUCCESS;
        } catch (rollbackError) {
          await backend.recordApplyFinish(rollbackId, 'failed', (rollbackError as Error).message);
          throw rollbackError;
        }
      } catch (error) {
        if (!globalOptions.quiet) {
          process.stderr.write(`${(error as Error).message}\n`);
        }
        process.exitCode = EXIT_CODES.ROLLBACK_FAILURE;
      } finally {
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

// Exported only for direct unit testing of the pure target-resolution
// logic without spinning up a real CLI process.
export { resolveRollbackTarget };
