import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import {
  buildLockfile,
  parseLockfile,
  serializeLockfile,
  type Lockfile,
} from '@agentform/registry';
import { diagnosticToJson, formatDiagnosticsForHumans } from '../lib/diagnostics-output.js';
import { EXIT_CODES, exitCodeForDiagnostics } from '../lib/exit-codes.js';
import { loadAndBuildIR } from '../lib/pipeline.js';
import { getGlobalOptions } from '../program.js';

interface LockfileCommandOptions {
  readonly environment?: string;
  readonly check?: boolean;
}

const LOCKFILE_NAME = 'agentform.lock';

function lockfilesEqual(a: Lockfile, b: Lockfile): boolean {
  if (a.modules.length !== b.modules.length) {
    return false;
  }
  const byId = new Map(b.modules.map((module) => [module.id, module]));
  return a.modules.every((module) => {
    const other = byId.get(module.id);
    return (
      other &&
      other.source === module.source &&
      other.version === module.version &&
      other.contentHash === module.contentHash
    );
  });
}

/**
 * Resolves every `spec.modules` entry (§Phase 12 "add lockfile command")
 * and writes exactly which `source`+`version` each resolved to, pinned
 * by content hash — `agentform.lock` is what lets a later `agentform
 * validate`/`apply` (once lockfile-awareness lands there) detect that a
 * registry now serves a different `module.yaml` for the same declared
 * version than what was locked, the same drift/tamper signal a `.afplan`
 * or `.agentform/test-results.json`'s own content hash already provides
 * for its own concern.
 */
export function registerLockfileCommand(program: Command): void {
  program
    .command('lockfile')
    .description('Resolve declared modules and write agentform.lock')
    .option('--environment <name>', 'apply the named environment overlay before resolving')
    .option('--check', 'verify agentform.lock matches current resolution, without writing', false)
    .action(async (options: LockfileCommandOptions) => {
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

      const moduleDiagnostics = result.diagnostics.filter((d) => d.code.startsWith('AGF7'));
      if (moduleDiagnostics.some((d) => d.severity === 'error')) {
        if (globalOptions.json) {
          process.stdout.write(
            `${JSON.stringify({ success: false, diagnostics: moduleDiagnostics.map(diagnosticToJson) }, null, 2)}\n`,
          );
        } else if (!globalOptions.quiet) {
          process.stdout.write(
            `${formatDiagnosticsForHumans(moduleDiagnostics, { color: globalOptions.color })}\n`,
          );
        }
        process.exitCode = EXIT_CODES.SEMANTIC_VALIDATION_FAILURE;
        return;
      }

      const lockfile = buildLockfile(result.resolvedModules);
      const lockfilePath = path.join(globalOptions.cwd, LOCKFILE_NAME);

      if (options.check) {
        const existing = existsSync(lockfilePath)
          ? parseLockfile(readFileSync(lockfilePath, 'utf-8'))
          : undefined;
        const upToDate = Boolean(existing && lockfilesEqual(existing, lockfile));
        if (globalOptions.json) {
          process.stdout.write(
            `${JSON.stringify({ success: upToDate, upToDate, lockfile }, null, 2)}\n`,
          );
        } else if (!globalOptions.quiet) {
          process.stdout.write(
            upToDate
              ? `${LOCKFILE_NAME} is up to date.\n`
              : `${LOCKFILE_NAME} is out of date — run "agentform lockfile" to update it.\n`,
          );
        }
        process.exitCode = upToDate ? EXIT_CODES.SUCCESS : EXIT_CODES.GENERAL_FAILURE;
        return;
      }

      writeFileSync(lockfilePath, serializeLockfile(lockfile), 'utf-8');

      if (globalOptions.json) {
        process.stdout.write(`${JSON.stringify({ success: true, lockfile }, null, 2)}\n`);
      } else if (!globalOptions.quiet) {
        process.stdout.write(`Wrote ${LOCKFILE_NAME} with ${lockfile.modules.length} module(s).\n`);
        for (const module of lockfile.modules) {
          process.stdout.write(`  ${module.id}: ${module.source}@${module.version}\n`);
        }
      }
      process.exitCode = EXIT_CODES.SUCCESS;
    });
}
