import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { discoverEntryFile, nodeFileSystem } from '@agentform/parser';
import { diagnosticToJson } from '../lib/diagnostics-output.js';
import { EXIT_CODES } from '../lib/exit-codes.js';
import { formatSourceText } from '../lib/format-source.js';
import { getGlobalOptions } from '../program.js';

interface FormatCommandOptions {
  readonly check: boolean;
}

function resolveTarget(
  file: string | undefined,
  cwd: string,
): { relativePath: string } | { failed: true } {
  if (file) {
    return { relativePath: file };
  }
  const entry = discoverEntryFile(cwd, nodeFileSystem);
  if (!entry.file) {
    return { failed: true };
  }
  return { relativePath: entry.file };
}

export function registerFormatCommand(program: Command): void {
  program
    .command('format')
    .description('Normalize the formatting of an Agentform YAML/JSON source file')
    .argument('[file]', 'file to format, relative to --cwd (defaults to the project entry file)')
    .option('--check', 'check whether the file is already formatted, without writing', false)
    .action((file: string | undefined, options: FormatCommandOptions) => {
      const globalOptions = getGlobalOptions(program);
      const target = resolveTarget(file, globalOptions.cwd);

      if ('failed' in target) {
        const entry = discoverEntryFile(globalOptions.cwd, nodeFileSystem);
        if (globalOptions.json) {
          process.stdout.write(
            `${JSON.stringify({ success: false, diagnostics: entry.diagnostics.map(diagnosticToJson) }, null, 2)}\n`,
          );
        } else if (!globalOptions.quiet) {
          process.stderr.write(`No Agentform source file found in "${globalOptions.cwd}".\n`);
        }
        process.exitCode = EXIT_CODES.SOURCE_PARSING_FAILURE;
        return;
      }

      const targetPath = path.join(globalOptions.cwd, target.relativePath);
      let original: string;
      try {
        original = readFileSync(targetPath, 'utf-8');
      } catch {
        if (!globalOptions.quiet) {
          process.stderr.write(`Cannot read "${target.relativePath}".\n`);
        }
        process.exitCode = EXIT_CODES.GENERAL_FAILURE;
        return;
      }

      const formatted = formatSourceText(original, target.relativePath);
      const alreadyFormatted = original === formatted;

      if (options.check) {
        if (globalOptions.json) {
          process.stdout.write(
            `${JSON.stringify({ formatted: alreadyFormatted, file: target.relativePath }, null, 2)}\n`,
          );
        } else if (!globalOptions.quiet) {
          process.stdout.write(
            `${target.relativePath} is ${alreadyFormatted ? '' : 'not '}formatted.\n`,
          );
        }
        process.exitCode = alreadyFormatted ? EXIT_CODES.SUCCESS : EXIT_CODES.GENERAL_FAILURE;
        return;
      }

      if (!alreadyFormatted) {
        writeFileSync(targetPath, formatted, 'utf-8');
      }

      if (globalOptions.json) {
        process.stdout.write(
          `${JSON.stringify({ changed: !alreadyFormatted, file: target.relativePath }, null, 2)}\n`,
        );
      } else if (!globalOptions.quiet) {
        process.stdout.write(
          alreadyFormatted
            ? `${target.relativePath} is already formatted.\n`
            : `Formatted ${target.relativePath}.\n`,
        );
      }
      process.exitCode = EXIT_CODES.SUCCESS;
    });
}
