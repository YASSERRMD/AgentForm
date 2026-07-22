import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';
import { EXIT_CODES } from '../lib/exit-codes.js';
import { promptForMissing } from '../lib/init-prompt.js';
import { findTemplate, TEMPLATES } from '../templates/index.js';
import { getGlobalOptions } from '../program.js';

interface InitCommandOptions {
  readonly template?: string;
  readonly target: string;
  readonly nonInteractive: boolean;
}

const DEFAULT_TEMPLATE_ID = 'basic';
const DEFAULT_TARGET = 'openai';
const VALID_TARGETS = [
  'openai',
  'langgraph',
  'microsoft',
  'google-adk',
  'autogen',
  'crewai',
  'agno',
] as const;
const ENTRY_FILENAMES = ['agentform.yaml', 'agentform.yml', 'agentform.json'];

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Scaffold a new Agentform project from a starter template')
    .argument(
      '[name]',
      'project name; also creates a new subdirectory with this name (default: initialize --cwd in place)',
    )
    .option('--template <id>', `starter template id (${TEMPLATES.map((t) => t.id).join(', ')})`)
    .option('--target <target>', `runtime target (${VALID_TARGETS.join(', ')})`, DEFAULT_TARGET)
    .option(
      '--non-interactive',
      'never prompt; use defaults for anything not given as a flag',
      false,
    )
    .action(async (name: string | undefined, options: InitCommandOptions) => {
      const globalOptions = getGlobalOptions(program);

      if (!(VALID_TARGETS as readonly string[]).includes(options.target)) {
        if (!globalOptions.quiet) {
          process.stderr.write(
            `Unknown --target "${options.target}" (expected one of: ${VALID_TARGETS.join(', ')}).\n`,
          );
        }
        process.exitCode = EXIT_CODES.INVALID_USAGE;
        return;
      }

      if (options.template && !findTemplate(options.template)) {
        if (!globalOptions.quiet) {
          process.stderr.write(
            `Unknown --template "${options.template}" (expected one of: ${TEMPLATES.map((t) => t.id).join(', ')}).\n`,
          );
        }
        process.exitCode = EXIT_CODES.INVALID_USAGE;
        return;
      }

      const interactive =
        !options.nonInteractive && Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);
      let resolvedName = name;
      let resolvedTemplateId = options.template;

      if (interactive && (!resolvedName || !resolvedTemplateId)) {
        const answers = await promptForMissing(resolvedName, resolvedTemplateId, TEMPLATES, {
          input: process.stdin,
          output: process.stdout,
        });
        resolvedName = answers.name ?? resolvedName;
        resolvedTemplateId = answers.templateId ?? resolvedTemplateId;
      }

      resolvedName = resolvedName ?? (path.basename(globalOptions.cwd) || 'my-agentform-project');
      resolvedTemplateId = resolvedTemplateId ?? DEFAULT_TEMPLATE_ID;

      const template = findTemplate(resolvedTemplateId);
      if (!template) {
        if (!globalOptions.quiet) {
          process.stderr.write(`Unknown template "${resolvedTemplateId}".\n`);
        }
        process.exitCode = EXIT_CODES.INVALID_USAGE;
        return;
      }

      const targetDir = name ? path.join(globalOptions.cwd, name) : globalOptions.cwd;
      const entryConflict = ENTRY_FILENAMES.find((fileName) =>
        existsSync(path.join(targetDir, fileName)),
      );
      if (entryConflict) {
        if (!globalOptions.quiet) {
          process.stderr.write(
            `Refusing to overwrite existing "${entryConflict}" in "${targetDir}".\n`,
          );
        }
        process.exitCode = EXIT_CODES.GENERAL_FAILURE;
        return;
      }

      const files = template.files({ name: resolvedName, target: options.target });
      for (const [relativePath, content] of Object.entries(files)) {
        const filePath = path.join(targetDir, relativePath);
        mkdirSync(path.dirname(filePath), { recursive: true });
        writeFileSync(filePath, content, 'utf-8');
      }

      const createdFiles = Object.keys(files).sort();

      if (globalOptions.json) {
        process.stdout.write(
          `${JSON.stringify(
            { success: true, directory: targetDir, template: template.id, files: createdFiles },
            null,
            2,
          )}\n`,
        );
      } else if (!globalOptions.quiet) {
        process.stdout.write(
          `Created ${createdFiles.length} files in "${targetDir}" using the "${template.id}" template:\n`,
        );
        for (const file of createdFiles) {
          process.stdout.write(`  ${file}\n`);
        }
      }
      process.exitCode = EXIT_CODES.SUCCESS;
    });
}
