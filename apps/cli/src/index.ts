#!/usr/bin/env node
import { CommanderError } from 'commander';
import { createProgram, getGlobalOptions } from './program.js';
import { createLogger } from './logger.js';

const program = createProgram();

if (process.argv.length <= 2) {
  program.outputHelp();
  process.exit(0);
}

try {
  program.parse(process.argv);
} catch (error) {
  if (error instanceof CommanderError) {
    process.exit(error.exitCode);
  }
  throw error;
}

const options = getGlobalOptions(program);
const logger = createLogger(options);
logger.debug({ cwd: options.cwd }, 'agentform cli bootstrapped');
