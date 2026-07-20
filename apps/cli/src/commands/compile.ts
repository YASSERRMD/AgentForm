import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { langGraphAdapter } from '@agentform/adapter-langgraph';
import { openAiAdapter } from '@agentform/adapter-openai';
import { compile as compileForTarget } from '@agentform/compiler';
import type { Diagnostic } from '@agentform/diagnostics';
import type { AgentformIR } from '@agentform/ir';
import type { FrameworkAdapter, GeneratedManifest } from '@agentform/plugin-sdk';
import { diagnosticToJson, formatDiagnosticsForHumans } from '../lib/diagnostics-output.js';
import { EXIT_CODES, exitCodeForDiagnostics } from '../lib/exit-codes.js';
import { loadAndBuildIR } from '../lib/pipeline.js';
import { CLI_VERSION, getGlobalOptions } from '../program.js';

/** Every framework `@agentform/schema`'s `runtime.target` enum allows — only the first two have a registered adapter as of Phase 8; the rest land in Phase 9. */
const ALL_FRAMEWORK_TARGETS = [
  'openai',
  'langgraph',
  'microsoft',
  'google-adk',
  'autogen',
  'crewai',
] as const;

const ADAPTER_REGISTRY: Readonly<Record<string, FrameworkAdapter>> = {
  openai: openAiAdapter,
  langgraph: langGraphAdapter,
};

interface CompileCommandOptions {
  readonly target?: string;
  readonly all?: boolean;
  readonly output: string;
  readonly clean?: boolean;
  readonly environment?: string;
}

interface TargetOutcome {
  readonly target: string;
  readonly outputDir: string;
  readonly filesWritten: number;
  readonly manifest?: GeneratedManifest;
  readonly diagnostics: readonly Diagnostic[];
}

async function compileOneTarget(
  target: string,
  adapter: FrameworkAdapter,
  ir: AgentformIR,
  outputRoot: string,
  clean: boolean,
): Promise<TargetOutcome> {
  const outputDir = path.resolve(outputRoot, target);
  if (clean && existsSync(outputDir)) {
    rmSync(outputDir, { recursive: true, force: true });
  }

  const result = await compileForTarget(ir, adapter, {
    outputDir,
    agentformVersion: CLI_VERSION,
  });

  if (!result.project) {
    return { target, outputDir, filesWritten: 0, diagnostics: result.diagnostics };
  }

  for (const file of result.project.files) {
    const filePath = path.join(outputDir, file.path);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, file.content, 'utf-8');
  }
  // §22 "Include a manifest" — not part of any adapter's own documented
  // source layout (it's metadata about the generation, not the generated
  // application), so it's written once here rather than by every adapter.
  writeFileSync(
    path.join(outputDir, 'manifest.json'),
    `${JSON.stringify(result.project.manifest, null, 2)}\n`,
    'utf-8',
  );

  return {
    target,
    outputDir,
    filesWritten: result.project.files.length,
    manifest: result.project.manifest,
    diagnostics: result.diagnostics,
  };
}

export function registerCompileCommand(program: Command): void {
  program
    .command('compile')
    .description('Generate a target-framework project from the Agentform specification')
    .option(
      '--target <name>',
      "openai or langgraph (default: the project's declared runtime.target)",
    )
    .option('--all', 'compile for every framework this build of Agentform supports', false)
    .option('--output <dir>', 'directory to write generated projects into', './generated')
    .option('--clean', "remove each target's existing output directory before writing", false)
    .option('--environment <name>', 'apply the named environment overlay before compiling')
    .action(async (options: CompileCommandOptions) => {
      const globalOptions = getGlobalOptions(program);

      if (options.target && options.all) {
        if (!globalOptions.quiet) {
          process.stderr.write('--target and --all cannot be used together.\n');
        }
        process.exitCode = EXIT_CODES.INVALID_USAGE;
        return;
      }

      if (
        options.target &&
        !(ALL_FRAMEWORK_TARGETS as readonly string[]).includes(options.target)
      ) {
        if (!globalOptions.quiet) {
          process.stderr.write(
            `Unknown --target "${options.target}" (expected one of: ${ALL_FRAMEWORK_TARGETS.join(', ')}).\n`,
          );
        }
        process.exitCode = EXIT_CODES.INVALID_USAGE;
        return;
      }

      const result = loadAndBuildIR({
        rootDir: globalOptions.cwd,
        environment: options.environment,
      });

      if (!result.ir) {
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

      const requestedTargets = options.all
        ? Object.keys(ADAPTER_REGISTRY)
        : [options.target ?? result.ir.application.runtime.target];
      const skippedTargets = options.all
        ? ALL_FRAMEWORK_TARGETS.filter((target) => !(target in ADAPTER_REGISTRY))
        : [];

      // `--all` only ever requests ADAPTER_REGISTRY's own keys, so this can
      // only fire for a single explicit (or defaulted) --target.
      const [requestedTarget] = requestedTargets;
      if (requestedTarget !== undefined && !(requestedTarget in ADAPTER_REGISTRY)) {
        if (!globalOptions.quiet) {
          process.stderr.write(
            `Target "${requestedTarget}" is not yet supported by this build of Agentform ` +
              `(available: ${Object.keys(ADAPTER_REGISTRY).join(', ')}). ` +
              'Microsoft/Google ADK/AutoGen/CrewAI adapters land in a later phase.\n',
          );
        }
        process.exitCode = EXIT_CODES.INVALID_USAGE;
        return;
      }

      // Unlike `graph`'s/`plan`'s `--output`/`--out` (arbitrary user-chosen
      // file paths, resolved against the real process cwd since they have
      // no default), `--output` here defaults to `./generated` — meant as
      // "relative to the project being compiled" (matching every
      // `generated/<target>/` layout in the spec), so it resolves against
      // `--cwd`, not the real process cwd.
      const outputRoot = path.resolve(globalOptions.cwd, options.output);
      const outcomes: TargetOutcome[] = [];
      for (const target of requestedTargets) {
        const adapter = ADAPTER_REGISTRY[target];
        if (!adapter) {
          continue;
        }
        // Sequential, not parallel: adapters aren't guaranteed side-effect-free
        // with respect to shared output-directory cleanup (--clean rmSync).
        outcomes.push(
          await compileOneTarget(target, adapter, result.ir, outputRoot, Boolean(options.clean)),
        );
      }

      const allDiagnostics = outcomes.flatMap((outcome) => outcome.diagnostics);
      const exitCode = exitCodeForDiagnostics(allDiagnostics);

      if (globalOptions.json) {
        process.stdout.write(
          `${JSON.stringify(
            {
              success: exitCode === EXIT_CODES.SUCCESS,
              targets: outcomes.map((outcome) => ({
                target: outcome.target,
                outputDir: outcome.outputDir,
                filesWritten: outcome.filesWritten,
                manifest: outcome.manifest ?? null,
                diagnostics: outcome.diagnostics.map(diagnosticToJson),
              })),
              skippedTargets,
            },
            null,
            2,
          )}\n`,
        );
      } else if (!globalOptions.quiet) {
        for (const outcome of outcomes) {
          process.stdout.write(`Target: ${outcome.target}\n`);
          if (outcome.filesWritten > 0) {
            process.stdout.write(`  Wrote ${outcome.filesWritten} files to ${outcome.outputDir}\n`);
          } else {
            process.stdout.write('  Compilation blocked — no files written.\n');
          }
          if (outcome.diagnostics.length > 0) {
            const rendered = formatDiagnosticsForHumans(outcome.diagnostics, {
              color: globalOptions.color,
            });
            process.stdout.write(
              `${rendered
                .split('\n')
                .map((line) => `  ${line}`)
                .join('\n')}\n`,
            );
          }
        }
        if (skippedTargets.length > 0) {
          process.stdout.write(`Skipped (not yet supported): ${skippedTargets.join(', ')}\n`);
        }
      }

      process.exitCode = exitCode;
    });
}
