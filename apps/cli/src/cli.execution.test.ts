import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const cliEntry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/index.js');

describe('agentform CLI binary (built ESM output)', () => {
  it('runs --help as plain ESM and exits 0', () => {
    const output = execFileSync(process.execPath, [cliEntry, '--help'], { encoding: 'utf-8' });
    expect(output).toContain('agentform');
    expect(output).toContain('--version');
    expect(output).toContain('--cwd');
  });

  it('runs --version and prints the package semver', () => {
    const output = execFileSync(process.execPath, [cliEntry, '--version'], {
      encoding: 'utf-8',
    }).trim();
    expect(output).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('shows help when invoked with no arguments', () => {
    const output = execFileSync(process.execPath, [cliEntry], { encoding: 'utf-8' });
    expect(output).toContain('Usage: agentform');
  });
});
