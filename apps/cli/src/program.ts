import { createRequire } from 'node:module';
import { Command } from 'commander';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as {
  name: string;
  version: string;
  description: string;
};

export interface GlobalOptions {
  json: boolean;
  color: boolean;
  verbose: boolean;
  debug: boolean;
  quiet: boolean;
  cwd: string;
}

interface RawGlobalOptions {
  json: boolean;
  color: boolean;
  verbose: boolean;
  debug: boolean;
  quiet: boolean;
  cwd: string;
}

/**
 * Colored output is opt-out (`--no-color`) but must still fall back to
 * disabled when stdout isn't a TTY, or when NO_COLOR/FORCE_COLOR env
 * conventions request otherwise.
 */
export function resolveColor(requestedColor: boolean): boolean {
  if (process.env.NO_COLOR) {
    return false;
  }
  if (process.env.FORCE_COLOR) {
    return true;
  }
  return requestedColor && Boolean(process.stdout.isTTY);
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name('agentform')
    .description(packageJson.description)
    .version(packageJson.version, '-V, --version', 'output the current version')
    .option('--json', 'output machine-readable JSON', false)
    .option('--no-color', 'disable colored output')
    .option('--verbose', 'enable verbose output', false)
    .option('--debug', 'enable debug output and stack traces', false)
    .option('--quiet', 'suppress non-essential output', false)
    .option('--cwd <path>', 'run as if agentform was started in <path>', process.cwd())
    .showHelpAfterError()
    .configureHelp({ sortSubcommands: true });

  // Exit via a thrown CommanderError instead of calling process.exit()
  // directly, so both the CLI entrypoint and tests can control the
  // process lifecycle explicitly.
  program.exitOverride();

  return program;
}

export function getGlobalOptions(program: Command): GlobalOptions {
  const opts = program.opts<RawGlobalOptions>();

  return {
    json: opts.json,
    color: resolveColor(opts.color),
    verbose: opts.verbose,
    debug: opts.debug,
    quiet: opts.quiet,
    cwd: opts.cwd,
  };
}
