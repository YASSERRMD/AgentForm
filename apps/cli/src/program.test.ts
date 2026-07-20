import { afterEach, describe, expect, it } from 'vitest';
import { CommanderError } from 'commander';
import { createProgram, getGlobalOptions, resolveColor } from './program.js';

describe('createProgram', () => {
  it('exposes the agentform program name and a semver version', () => {
    const program = createProgram();
    expect(program.name()).toBe('agentform');
    expect(program.version()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('parses global options with expected defaults', () => {
    const program = createProgram();
    program.parse(['node', 'agentform'], { from: 'node' });

    const options = getGlobalOptions(program);
    expect(options.json).toBe(false);
    expect(options.verbose).toBe(false);
    expect(options.debug).toBe(false);
    expect(options.quiet).toBe(false);
    expect(options.cwd).toBe(process.cwd());
  });

  it('parses --json, --debug, and --cwd flags', () => {
    const program = createProgram();
    program.parse(['node', 'agentform', '--json', '--debug', '--cwd', '/tmp/example'], {
      from: 'node',
    });

    const options = getGlobalOptions(program);
    expect(options.json).toBe(true);
    expect(options.debug).toBe(true);
    expect(options.cwd).toBe('/tmp/example');
  });

  it('exits with code 0 via a CommanderError on --help', () => {
    const program = createProgram();
    program.configureOutput({ writeOut: () => {}, writeErr: () => {} });

    let thrown: unknown;
    try {
      program.parse(['node', 'agentform', '--help'], { from: 'node' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CommanderError);
    expect((thrown as CommanderError).exitCode).toBe(0);
  });

  it('exits with code 0 via a CommanderError on --version', () => {
    const program = createProgram();
    program.configureOutput({ writeOut: () => {}, writeErr: () => {} });

    let thrown: unknown;
    try {
      program.parse(['node', 'agentform', '--version'], { from: 'node' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CommanderError);
    expect((thrown as CommanderError).exitCode).toBe(0);
  });
});

describe('resolveColor', () => {
  const originalNoColor = process.env.NO_COLOR;
  const originalForceColor = process.env.FORCE_COLOR;
  const originalIsTty = process.stdout.isTTY;

  afterEach(() => {
    if (originalNoColor === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = originalNoColor;
    }
    if (originalForceColor === undefined) {
      delete process.env.FORCE_COLOR;
    } else {
      process.env.FORCE_COLOR = originalForceColor;
    }
    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTty, configurable: true });
  });

  it('disables color when NO_COLOR is set, even if requested', () => {
    process.env.NO_COLOR = '1';
    expect(resolveColor(true)).toBe(false);
  });

  it('enables color when FORCE_COLOR is set, even if not a TTY', () => {
    delete process.env.NO_COLOR;
    process.env.FORCE_COLOR = '1';
    expect(resolveColor(true)).toBe(true);
  });

  it('falls back to the TTY check when neither env var is set', () => {
    delete process.env.NO_COLOR;
    delete process.env.FORCE_COLOR;
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    expect(resolveColor(true)).toBe(false);
  });
});
