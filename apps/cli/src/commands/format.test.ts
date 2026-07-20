import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFixtureProject, runCli, type FixtureProject } from '../test-fixture-project.js';

let project: FixtureProject | undefined;

afterEach(() => {
  project?.cleanup();
  project = undefined;
});

describe('agentform format', () => {
  it('detects an unformatted file with --check and exits non-zero', () => {
    project = createFixtureProject({
      'agentform.yaml': 'metadata:\n    name: app\n    version: 1.0.0\n',
    });
    const result = runCli(['format', '--check'], project.dir);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout).toContain('is not formatted');
  });

  it('reports an already-formatted file as formatted with --check and exits 0', () => {
    project = createFixtureProject({
      'agentform.yaml': 'metadata:\n  name: app\n  version: 1.0.0\n',
    });
    const result = runCli(['format', '--check'], project.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('is formatted');
  });

  it('rewrites an unformatted file in place', () => {
    project = createFixtureProject({
      'agentform.yaml': 'metadata:\n    name: app\n    version: 1.0.0\n',
    });
    const result = runCli(['format'], project.dir);
    expect(result.exitCode).toBe(0);
    const rewritten = readFileSync(path.join(project.dir, 'agentform.yaml'), 'utf-8');
    expect(rewritten).toBe('metadata:\n  name: app\n  version: 1.0.0\n');
  });

  it('rewrites deterministically — formatting twice produces byte-identical output', () => {
    project = createFixtureProject({
      'agentform.yaml': 'metadata:\n      name: app\n      version:   1.0.0\n',
    });
    runCli(['format'], project.dir);
    const once = readFileSync(path.join(project.dir, 'agentform.yaml'), 'utf-8');
    runCli(['format'], project.dir);
    const twice = readFileSync(path.join(project.dir, 'agentform.yaml'), 'utf-8');
    expect(twice).toBe(once);
  });

  it('accepts an explicit file argument instead of the default entry file', () => {
    project = createFixtureProject({
      'agentform.yaml': 'metadata:\n  name: app\n  version: 1.0.0\n',
      'agents/researcher.yaml': 'role:    researcher\n',
    });
    const result = runCli(['format', 'agents/researcher.yaml'], project.dir);
    expect(result.exitCode).toBe(0);
    const rewritten = readFileSync(path.join(project.dir, 'agents/researcher.yaml'), 'utf-8');
    expect(rewritten).toBe('role: researcher\n');
  });

  it('outputs parseable JSON with --json', () => {
    project = createFixtureProject({
      'agentform.yaml': 'metadata:\n    name: app\n',
    });
    const result = runCli(['format', '--check', '--json'], project.dir);
    const parsed = JSON.parse(result.stdout) as { formatted: boolean; file: string };
    expect(parsed.formatted).toBe(false);
    expect(parsed.file).toBe('agentform.yaml');
  });

  it('fails with source-parsing exit code when no entry file exists and none is specified', () => {
    project = createFixtureProject({ 'README.md': 'nothing here' });
    const result = runCli(['format'], project.dir);
    expect(result.exitCode).toBe(3);
  });

  it('supports --help', () => {
    project = createFixtureProject({ 'agentform.yaml': 'metadata:\n  name: app\n' });
    const result = runCli(['format', '--help'], project.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--check');
  });
});
