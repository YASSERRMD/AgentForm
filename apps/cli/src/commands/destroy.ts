import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { planDestroy, type PlanItem } from '@agentform/planner';
import { StateLockError, type ApplicationState } from '@agentform/state';
import { confirmAction } from '../lib/confirm-prompt.js';
import { EXIT_CODES } from '../lib/exit-codes.js';
import { ADAPTER_REGISTRY } from '../lib/generate-artifacts.js';
import { formatPlanForHumans } from '../lib/plan-output.js';
import { openStateBackend } from '../lib/state.js';
import { getGlobalOptions } from '../program.js';

interface DestroyCommandOptions {
  readonly plan?: boolean;
  readonly autoApprove?: boolean;
}

/**
 * Generated artifact directories that a destroy would remove from disk —
 * the one thing destroy deletes that has no built-in undo. Resource
 * *state* is deliberately not listed here: it's backed up before every
 * mutation (same as apply/rollback), so it can always be restored with
 * `agentform rollback --snapshot <backupId>`.
 */
function unrecoverableArtifacts(targets: readonly string[], rootDir: string): readonly string[] {
  return targets
    .map((target) => path.join('generated', target))
    .filter((relativePath) => existsSync(path.join(rootDir, relativePath)));
}

function printPlan(items: readonly PlanItem[]): void {
  process.stdout.write(formatPlanForHumans(items));
}

export function registerDestroyCommand(program: Command): void {
  program
    .command('destroy')
    .description('Destroy every resource currently tracked in deployed state')
    .option('--plan', 'show what would be destroyed without destroying anything', false)
    .option('--auto-approve', 'skip interactive confirmation', false)
    .action(async (options: DestroyCommandOptions) => {
      const globalOptions = getGlobalOptions(program);

      // `--plan` is a pure read, the same as `agentform plan` — no lock
      // needed since nothing is mutated.
      if (options.plan) {
        const backend = await openStateBackend(globalOptions.cwd);
        let items: readonly PlanItem[];
        try {
          items = planDestroy(await backend.listResourceStates());
        } finally {
          await backend.close();
        }
        if (globalOptions.json) {
          process.stdout.write(`${JSON.stringify({ success: true, items }, null, 2)}\n`);
        } else if (!globalOptions.quiet) {
          if (items.length === 0) {
            process.stdout.write('Nothing to destroy — no resources are currently tracked.\n');
          } else {
            printPlan(items);
          }
        }
        process.exitCode = EXIT_CODES.SUCCESS;
        return;
      }

      const backend = await openStateBackend(globalOptions.cwd);
      try {
        await backend.acquireLock({ reason: 'agentform destroy' });
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
        const items = planDestroy(await backend.listResourceStates());

        if (items.length === 0) {
          if (globalOptions.json) {
            process.stdout.write(
              `${JSON.stringify({ success: true, destroyed: false, items: [] }, null, 2)}\n`,
            );
          } else if (!globalOptions.quiet) {
            process.stdout.write('Nothing to destroy — no resources are currently tracked.\n');
          }
          process.exitCode = EXIT_CODES.SUCCESS;
          return;
        }

        const applicationState = await backend.getApplicationState();
        const targets = Object.keys(applicationState?.adapterVersions ?? {});
        const irreversible = unrecoverableArtifacts(targets, globalOptions.cwd);

        // Destroy always requires explicit confirmation (§15.14) —
        // unlike apply, this is unconditional, not gated on any item
        // being CRITICAL risk: every destroy removes tracked resources
        // wholesale, so it can never run silently.
        if (!options.autoApprove) {
          const interactive =
            Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY) && !globalOptions.quiet;
          const message = [
            '',
            formatPlanForHumans(items),
            irreversible.length > 0
              ? [
                  'The following cannot be recovered by Agentform once destroyed:',
                  ...irreversible.map((p) => `  - ${p}`),
                  '',
                ].join('\n')
              : '',
            'Resource state is backed up first and can be restored with "agentform rollback --snapshot <backupId>".',
          ].join('\n');
          if (!interactive) {
            if (!globalOptions.quiet) {
              process.stderr.write(
                `${message}\nRe-run with --auto-approve, or from an interactive terminal to confirm.\n`,
              );
            }
            process.exitCode = EXIT_CODES.APPLY_FAILURE;
            return;
          }
          const approved = await confirmAction(message, {
            input: process.stdin,
            output: process.stdout,
          });
          if (!approved) {
            process.stdout.write('Not approved — no changes were made.\n');
            process.exitCode = EXIT_CODES.APPLY_FAILURE;
            return;
          }
        }

        const backupId = await backend.createBackup();
        const destroyId = crypto.randomUUID();
        const startedAt = new Date().toISOString();
        await backend.recordApplyStart({
          id: destroyId,
          startedAt,
          backupId,
          summary: `destroy of ${items.length} resource(s)`,
        });

        try {
          // Deployment cleanup where implemented — no adapter implements
          // `destroy` yet (the same forward-looking hook `agentform
          // apply` wires for `adapter.deploy`), but any target with a
          // recorded deployment identifier gets the chance to tear itself
          // down before local artifacts/state are removed.
          for (const target of targets) {
            const deploymentId = applicationState?.deploymentIdentifiers?.[target];
            const adapter = ADAPTER_REGISTRY[target];
            if (!deploymentId || !adapter?.destroy) {
              continue;
            }
            const destroyResult = await adapter.destroy(
              { deploymentId },
              { environment: (applicationState as ApplicationState).environment },
            );
            if (!destroyResult.succeeded) {
              throw new Error(`Deployment cleanup for target "${target}" failed.`);
            }
          }

          // Artifact-only cleanup: remove the generated project directory
          // for every target this application was ever applied for.
          for (const relativePath of irreversible) {
            rmSync(path.join(globalOptions.cwd, relativePath), { recursive: true, force: true });
          }

          // State restoration is atomic — every resource is removed and
          // application state is reset together, or (on throw) none of
          // it is (§10 "atomic transactions" / "apply cannot partially
          // corrupt state", equally true of destroy).
          await backend.withTransaction(async () => {
            for (const item of items) {
              await backend.deleteResourceState(item.resourceAddress);
            }
            if (applicationState) {
              await backend.putApplicationState({
                ...applicationState,
                deploymentIdentifiers: {},
                driftStatus: 'unknown',
              });
            }
          });

          await backend.recordApplyFinish(
            destroyId,
            'succeeded',
            `destroyed ${items.length} resource(s)`,
          );

          if (globalOptions.json) {
            process.stdout.write(
              `${JSON.stringify(
                {
                  success: true,
                  destroyed: true,
                  destroyId,
                  items,
                  removedArtifacts: irreversible,
                },
                null,
                2,
              )}\n`,
            );
          } else if (!globalOptions.quiet) {
            process.stdout.write(`Destroyed ${items.length} resource(s).\n`);
            for (const item of items) {
              process.stdout.write(`  - ${item.resourceAddress} destroyed\n`);
            }
            for (const relativePath of irreversible) {
              process.stdout.write(`  - removed ${relativePath}\n`);
            }
          }
          process.exitCode = EXIT_CODES.SUCCESS;
        } catch (destroyError) {
          await backend.recordApplyFinish(destroyId, 'failed', (destroyError as Error).message);
          throw destroyError;
        }
      } catch (error) {
        if (!globalOptions.quiet) {
          process.stderr.write(`${(error as Error).message}\n`);
        }
        // No exit code is reserved specifically for "destroy failure" —
        // §14's table stops at 15 (rollback failure) despite discussing
        // destroy in the same phase, so destroy shares APPLY_FAILURE with
        // every other "a state-mutating operation failed" case.
        process.exitCode = EXIT_CODES.APPLY_FAILURE;
      } finally {
        await backend.releaseLock();
        await backend.close();
      }
    });
}
