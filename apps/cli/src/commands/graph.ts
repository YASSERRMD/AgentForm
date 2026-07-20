import { writeFileSync } from 'node:fs';
import type { Command } from 'commander';
import type { AgentformIR, IRWorkflow } from '@agentform/ir';
import { diagnosticToJson, formatDiagnosticsForHumans } from '../lib/diagnostics-output.js';
import { EXIT_CODES, exitCodeForDiagnostics } from '../lib/exit-codes.js';
import { renderDot, renderGraphJson, renderMermaid } from '../lib/graph-render.js';
import { loadAndBuildIR } from '../lib/pipeline.js';
import { getGlobalOptions } from '../program.js';

type GraphFormat = 'mermaid' | 'dot' | 'json';

interface GraphCommandOptions {
  readonly format: GraphFormat;
  readonly output?: string;
  readonly workflow?: string;
  readonly environment?: string;
}

function selectWorkflows(
  ir: AgentformIR,
  workflowId: string | undefined,
): { workflows: readonly (readonly [string, IRWorkflow])[] } | { error: string } {
  if (workflowId) {
    const workflow = ir.workflows.get(workflowId);
    if (!workflow) {
      return {
        error: `No workflow "${workflowId}" in this project (declared: ${[...ir.workflows.keys()].join(', ') || 'none'}).`,
      };
    }
    return { workflows: [[workflowId, workflow]] };
  }
  return { workflows: [...ir.workflows] };
}

function renderAll(
  format: GraphFormat,
  workflows: readonly (readonly [string, IRWorkflow])[],
): string {
  if (format === 'json') {
    const graphs = workflows.map(([id, workflow]) => renderGraphJson(id, workflow));
    return `${JSON.stringify(workflows.length === 1 ? graphs[0] : graphs, null, 2)}\n`;
  }

  const render = format === 'mermaid' ? renderMermaid : renderDot;
  return workflows.map(([id, workflow]) => render(id, workflow)).join('\n');
}

export function registerGraphCommand(program: Command): void {
  program
    .command('graph')
    .description('Generate a Mermaid, DOT, or JSON graph of a workflow')
    .option('--format <format>', 'mermaid, dot, or json', 'mermaid')
    .option('--output <file>', 'write the graph to a file instead of stdout')
    .option('--workflow <id>', 'graph only this workflow (default: every workflow in the project)')
    .option('--environment <name>', 'apply the named environment overlay before graphing')
    .action((options: GraphCommandOptions) => {
      const globalOptions = getGlobalOptions(program);

      if (!['mermaid', 'dot', 'json'].includes(options.format)) {
        if (!globalOptions.quiet) {
          process.stderr.write(
            `Unknown --format "${options.format}" (expected mermaid, dot, or json).\n`,
          );
        }
        process.exitCode = EXIT_CODES.INVALID_USAGE;
        return;
      }

      const result = loadAndBuildIR({
        rootDir: globalOptions.cwd,
        environment: options.environment,
      });
      const exitCode = exitCodeForDiagnostics(result.diagnostics);

      if (exitCode !== EXIT_CODES.SUCCESS || !result.ir) {
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

      const selection = selectWorkflows(result.ir, options.workflow);
      if ('error' in selection) {
        if (!globalOptions.quiet) {
          process.stderr.write(`${selection.error}\n`);
        }
        process.exitCode = EXIT_CODES.INVALID_USAGE;
        return;
      }

      if (selection.workflows.length === 0) {
        if (!globalOptions.quiet) {
          process.stderr.write('This project declares no workflows.\n');
        }
        process.exitCode = EXIT_CODES.INVALID_USAGE;
        return;
      }

      const rendered = renderAll(options.format, selection.workflows);

      if (options.output) {
        writeFileSync(options.output, rendered, 'utf-8');
        if (!globalOptions.quiet && !globalOptions.json) {
          process.stdout.write(`Wrote ${options.output}\n`);
        }
      } else {
        process.stdout.write(rendered);
      }

      process.exitCode = EXIT_CODES.SUCCESS;
    });
}
