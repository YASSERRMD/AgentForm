import pino, { type Logger, type LevelWithSilent } from 'pino';
import type { GlobalOptions } from './program.js';

export function resolveLogLevel(
  options: Pick<GlobalOptions, 'debug' | 'verbose' | 'quiet'>,
): LevelWithSilent {
  if (options.quiet) {
    return 'silent';
  }
  if (options.debug) {
    return 'debug';
  }
  if (options.verbose) {
    return 'info';
  }
  return 'warn';
}

export function createLogger(options: Pick<GlobalOptions, 'debug' | 'verbose' | 'quiet'>): Logger {
  return pino({ level: resolveLogLevel(options) });
}
