import type { Command } from 'commander';
import { stringify } from 'yaml';
import type { AgentformIR } from '@agentform/ir';
import { diagnosticToJson, formatDiagnosticsForHumans } from '../lib/diagnostics-output.js';
import { EXIT_CODES, exitCodeForDiagnostics } from '../lib/exit-codes.js';
import { loadAndBuildIR } from '../lib/pipeline.js';
import { toPlainObject } from '../lib/serialize.js';
import { getGlobalOptions } from '../program.js';

interface InspectCommandOptions {
  readonly environment?: string;
}

const RESOURCE_KIND_TO_COLLECTION: Record<string, keyof AgentformIR> = {
  model: 'models',
  tool: 'tools',
  agent: 'agents',
  workflow: 'workflows',
  memory: 'memory',
  output: 'outputs',
};

function resolveResource(
  ir: AgentformIR,
  address: string,
): { found: true; value: unknown } | { found: false } {
  const separatorIndex = address.indexOf('.');
  if (separatorIndex === -1) {
    return { found: false };
  }
  const kind = address.slice(0, separatorIndex);
  const id = address.slice(separatorIndex + 1);
  const collectionKey = RESOURCE_KIND_TO_COLLECTION[kind];
  if (!collectionKey) {
    return { found: false };
  }
  const collection = ir[collectionKey];
  if (!(collection instanceof Map) || !collection.has(id)) {
    return { found: false };
  }
  return { found: true, value: collection.get(id) };
}

function applicationSummary(ir: AgentformIR): Record<string, unknown> {
  return {
    application: toPlainObject(ir.application),
    contentHash: ir.contentHash,
    resourceCounts: {
      models: ir.models.size,
      tools: ir.tools.size,
      agents: ir.agents.size,
      workflows: ir.workflows.size,
      memory: ir.memory.size,
      outputs: ir.outputs.size,
      policies: ir.policies.length,
    },
  };
}

export function registerInspectCommand(program: Command): void {
  program
    .command('inspect')
    .description('Print a resolved resource, or a summary of the whole application')
    .argument('[address]', 'a resource address like "agent.intake" or "workflow.main"')
    .option('--environment <name>', 'apply the named environment overlay before inspecting')
    .action((address: string | undefined, options: InspectCommandOptions) => {
      const globalOptions = getGlobalOptions(program);
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

      const target = address
        ? resolveResource(result.ir, address)
        : { found: true, value: applicationSummary(result.ir) };

      if (!target.found) {
        if (!globalOptions.quiet) {
          process.stderr.write(
            `No resource found at "${address}". Expected an address like "agent.<id>" (kinds: ${Object.keys(RESOURCE_KIND_TO_COLLECTION).join(', ')}).\n`,
          );
        }
        process.exitCode = EXIT_CODES.INVALID_USAGE;
        return;
      }

      const plainValue = toPlainObject(target.value);
      if (globalOptions.json) {
        process.stdout.write(`${JSON.stringify(plainValue, null, 2)}\n`);
      } else if (!globalOptions.quiet) {
        process.stdout.write(stringify(plainValue, { indent: 2, lineWidth: 0 }));
      }
      process.exitCode = EXIT_CODES.SUCCESS;
    });
}
