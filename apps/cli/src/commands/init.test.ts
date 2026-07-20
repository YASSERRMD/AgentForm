import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createFixtureProject, runCli, type FixtureProject } from '../test-fixture-project.js';

let project: FixtureProject | undefined;

afterEach(() => {
  project?.cleanup();
  project = undefined;
});

describe('agentform init', () => {
  it('creates the expected files for the default (basic) template, non-interactively', () => {
    project = createFixtureProject({});
    const result = runCli(['init', '--non-interactive'], project.dir);
    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(project.dir, 'agentform.yaml'))).toBe(true);
    expect(existsSync(path.join(project.dir, 'README.md'))).toBe(true);
    expect(existsSync(path.join(project.dir, '.gitignore'))).toBe(true);
    expect(existsSync(path.join(project.dir, '.env.example'))).toBe(true);
  });

  it('produces a project that immediately passes agentform validate', () => {
    project = createFixtureProject({});
    const initResult = runCli(['init', '--non-interactive'], project.dir);
    expect(initResult.exitCode).toBe(0);
    const validateResult = runCli(['validate'], project.dir);
    expect(validateResult.exitCode).toBe(0);
  });

  it('creates a new named subdirectory when a name argument is given', () => {
    project = createFixtureProject({});
    const result = runCli(['init', 'my-app', '--non-interactive'], project.dir);
    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(project.dir, 'my-app', 'agentform.yaml'))).toBe(true);
  });

  it('sets metadata.name from the given project name', () => {
    project = createFixtureProject({});
    runCli(['init', 'my-named-app', '--non-interactive'], project.dir);
    const content = readFileSync(path.join(project.dir, 'my-named-app', 'agentform.yaml'), 'utf-8');
    expect(content).toContain('name: my-named-app');
  });

  it('honors --template for each of the five starter templates', () => {
    for (const templateId of [
      'basic',
      'tool-agent',
      'multi-agent',
      'human-approval',
      'government-complaint',
    ]) {
      const fixture = createFixtureProject({});
      const result = runCli(['init', '--template', templateId, '--non-interactive'], fixture.dir);
      expect(result.exitCode, `template ${templateId}`).toBe(0);
      expect(existsSync(path.join(fixture.dir, 'agentform.yaml')), `template ${templateId}`).toBe(
        true,
      );
      fixture.cleanup();
    }
  });

  it('honors --target by setting spec.runtime.target', () => {
    project = createFixtureProject({});
    runCli(['init', '--target', 'langgraph', '--non-interactive'], project.dir);
    const content = readFileSync(path.join(project.dir, 'agentform.yaml'), 'utf-8');
    expect(content).toContain('target: langgraph');
  });

  it('rejects an unknown --template with INVALID_USAGE (2)', () => {
    project = createFixtureProject({});
    const result = runCli(
      ['init', '--template', 'does-not-exist', '--non-interactive'],
      project.dir,
    );
    expect(result.exitCode).toBe(2);
  });

  it('rejects an unknown --target with INVALID_USAGE (2)', () => {
    project = createFixtureProject({});
    const result = runCli(
      ['init', '--target', 'not-a-real-framework', '--non-interactive'],
      project.dir,
    );
    expect(result.exitCode).toBe(2);
  });

  it('refuses to overwrite an existing entry file', () => {
    project = createFixtureProject({ 'agentform.yaml': 'metadata:\n  name: existing\n' });
    const result = runCli(['init', '--non-interactive'], project.dir);
    expect(result.exitCode).not.toBe(0);
    const content = readFileSync(path.join(project.dir, 'agentform.yaml'), 'utf-8');
    expect(content).toBe('metadata:\n  name: existing\n');
  });

  it('falls back to non-interactive behavior automatically when stdin/stdout are not a TTY (e.g. piped or spawned)', () => {
    // The e2e harness always spawns without a TTY, so this is really
    // asserting every other test in this file didn't need --non-interactive
    // to avoid hanging on a prompt — but assert it explicitly once too.
    project = createFixtureProject({});
    const result = runCli(['init'], project.dir);
    expect(result.exitCode).toBe(0);
  });

  it('outputs parseable JSON with --json', () => {
    project = createFixtureProject({});
    const result = runCli(['init', '--non-interactive', '--json'], project.dir);
    const parsed = JSON.parse(result.stdout) as {
      success: boolean;
      template: string;
      files: string[];
    };
    expect(parsed.success).toBe(true);
    expect(parsed.template).toBe('basic');
    expect(parsed.files).toContain('agentform.yaml');
  });

  it('supports --help', () => {
    project = createFixtureProject({});
    const result = runCli(['init', '--help'], project.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--template');
    expect(result.stdout).toContain('--non-interactive');
  });
});
