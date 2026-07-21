import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { slugifyIdentifier } from '@agentform/core';
import { langGraphAdapter } from '@agentform/adapter-langgraph';
import { openAiAdapter } from '@agentform/adapter-openai';
import type { ImportInspection } from '@agentform/plugin-sdk';
import { EXIT_CODES } from '../lib/exit-codes.js';
import { inspectGeneratedAgentformProject } from '../lib/import-generated.js';
import { buildCandidateSpecDocument } from '../lib/import-spec.js';
import { getGlobalOptions } from '../program.js';

interface ImportCommandOptions {
  readonly out?: string;
  readonly target?: string;
}

interface Recognizer {
  readonly source: string;
  readonly defaultTarget: string;
  inspect(rootDir: string): Promise<ImportInspection> | ImportInspection;
}

/**
 * Tried in order, first actionable match wins (§15.12's "generated
 * Agentform projects" listed before the raw-SDK cases). "Actionable"
 * means `recognized` *and* at least one candidate — a recognizer that
 * detects its framework's mere presence but extracts nothing useful is
 * treated the same as not recognizing the project at all, since there'd
 * be nothing for `agentform import` to hand back either way.
 */
const RECOGNIZERS: readonly Recognizer[] = [
  {
    source: 'a generated Agentform project',
    defaultTarget: 'openai',
    inspect: (rootDir) => inspectGeneratedAgentformProject(rootDir),
  },
  {
    source: 'a raw OpenAI Agents SDK project',
    defaultTarget: 'openai',
    inspect: (rootDir) => openAiAdapter.inspectExisting!({ rootDir }),
  },
  {
    source: 'a raw LangGraph project',
    defaultTarget: 'langgraph',
    inspect: (rootDir) => langGraphAdapter.inspectExisting!({ rootDir }),
  },
];

export function registerImportCommand(program: Command): void {
  program
    .command('import')
    .description(
      'Inspect an existing project and produce a candidate Agentform specification (limited, best-effort recognition — see §15.12)',
    )
    .argument('[sourceDir]', 'directory to inspect (default: --cwd)')
    .option('--out <file>', 'where to write the candidate specification', 'agentform.import.yaml')
    .option('--target <name>', "override the candidate specification's runtime.target")
    .action(async (sourceDirArg: string | undefined, options: ImportCommandOptions) => {
      const globalOptions = getGlobalOptions(program);
      const sourceDir = sourceDirArg
        ? path.resolve(globalOptions.cwd, sourceDirArg)
        : globalOptions.cwd;

      if (!existsSync(sourceDir)) {
        if (!globalOptions.quiet) {
          process.stderr.write(`"${sourceDir}" does not exist.\n`);
        }
        process.exitCode = EXIT_CODES.IMPORT_FAILURE;
        return;
      }

      let match: { recognizer: Recognizer; inspection: ImportInspection } | undefined;
      for (const recognizer of RECOGNIZERS) {
        const inspection = await recognizer.inspect(sourceDir);
        if (inspection.recognized && inspection.candidates.length > 0) {
          match = { recognizer, inspection };
          break;
        }
      }

      if (!match) {
        if (!globalOptions.quiet) {
          process.stderr.write(
            `No supported project was recognized in "${sourceDir}". agentform import currently recognizes: ` +
              `${RECOGNIZERS.map((r) => r.source).join(', ')}.\n`,
          );
        }
        process.exitCode = EXIT_CODES.IMPORT_FAILURE;
        return;
      }

      const outPath = path.resolve(globalOptions.cwd, options.out ?? 'agentform.import.yaml');
      if (existsSync(outPath)) {
        if (!globalOptions.quiet) {
          process.stderr.write(`Refusing to overwrite existing "${outPath}".\n`);
        }
        process.exitCode = EXIT_CODES.IMPORT_FAILURE;
        return;
      }

      const applicationName = slugifyIdentifier(path.basename(sourceDir), 'imported-app');
      const target = options.target ?? match.recognizer.defaultTarget;
      const document = buildCandidateSpecDocument(match.inspection.candidates, {
        applicationName,
        target,
      });
      writeFileSync(outPath, document, 'utf-8');

      const byKind = new Map<string, number>();
      for (const candidate of match.inspection.candidates) {
        byKind.set(candidate.kind, (byKind.get(candidate.kind) ?? 0) + 1);
      }
      const averageConfidence =
        match.inspection.candidates.reduce((sum, c) => sum + c.confidence, 0) /
        match.inspection.candidates.length;

      if (globalOptions.json) {
        process.stdout.write(
          `${JSON.stringify(
            {
              success: true,
              recognized: match.recognizer.source,
              outPath,
              candidates: match.inspection.candidates,
              confidence: averageConfidence,
              unsupportedConstructs: match.inspection.unsupportedConstructs,
              manualActions: match.inspection.manualActions,
            },
            null,
            2,
          )}\n`,
        );
      } else if (!globalOptions.quiet) {
        const lines = [
          `Recognized ${match.recognizer.source} in "${sourceDir}".`,
          `Confidence: ${(averageConfidence * 100).toFixed(0)}% (heuristic — review before trusting).`,
          '',
          'Recovered resources:',
          ...[...byKind.entries()].map(([kind, count]) => `  ${kind}: ${count}`),
          '',
          'Unsupported constructs (not translated):',
          ...match.inspection.unsupportedConstructs.map((note) => `  - ${note}`),
          '',
          'Manual follow-up required:',
          ...match.inspection.manualActions.map((note) => `  - ${note}`),
          '',
          `Wrote candidate specification to "${outPath}". This is a starting point, not a finished project — review it, then run "agentform validate".`,
        ];
        process.stdout.write(`${lines.join('\n')}\n`);
      }
      process.exitCode = EXIT_CODES.SUCCESS;
    });
}
