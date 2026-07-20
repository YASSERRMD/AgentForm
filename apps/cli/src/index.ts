#!/usr/bin/env node
import { CommanderError } from 'commander';
import { registerCommands } from './commands/index.js';
import { resolveCommanderExitCode } from './lib/exit-codes.js';
import { createProgram, getGlobalOptions } from './program.js';
import { createLogger } from './logger.js';

const program = createProgram();
registerCommands(program);

if (process.argv.length <= 2) {
  program.outputHelp();
  process.exit(0);
}

try {
  // parseAsync (not parse) because some commands (init's interactive
  // prompting) have async actions — parse() would return before such an
  // action finishes, and an action that later rejects would become an
  // unhandled promise rejection instead of hitting this catch block.
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof CommanderError) {
    process.exit(resolveCommanderExitCode(error));
  }
  throw error;
}

const options = getGlobalOptions(program);
const logger = createLogger(options);
logger.debug({ cwd: options.cwd }, 'agentform cli bootstrapped');
