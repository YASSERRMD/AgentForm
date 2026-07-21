import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ModuleDefinition } from '@agentform/schema';
import { publishModule } from '@agentform/registry';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFixtureProject, runCli, type FixtureProject } from '../test-fixture-project.js';

function moduleDefinition(): ModuleDefinition {
  return {
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgentformModule',
    metadata: { name: 'complaint-intake', version: '1.0.0' },
    spec: {
      inputs: { region: { type: 'string', default: 'us-east' } },
      models: { primary: { provider: 'openai', model: 'gpt-5' } },
      agents: {
        intake: {
          model: 'primary',
          role: 'assistant',
          instructions: { text: 'Serve ${input.region}.' },
        },
      },
    },
  };
}

function projectWithModule(inputs?: Record<string, string>): Record<string, string> {
  const inputsBlock = inputs
    ? `      inputs:\n${Object.entries(inputs)
        .map(([k, v]) => `        ${k}: ${v}`)
        .join('\n')}\n`
    : '';
  return {
    'agentform.yaml': [
      'apiVersion: agentform.dev/v1alpha1',
      'kind: AgenticApplication',
      'metadata:',
      '  name: fixture-app',
      '  version: 1.0.0',
      'spec:',
      '  runtime:',
      '    target: openai',
      '    environment: development',
      '  models: {}',
      '  agents: {}',
      '  workflows:',
      '    main:',
      '      entrypoint: intake',
      '      nodes:',
      '        intake:',
      '          type: agent',
      '          agent: intake',
      '  modules:',
      '    complaintIntake:',
      '      source: government/complaint-intake',
      '      version: 1.0.0',
      inputsBlock,
    ].join('\n'),
  };
}

let fixture: FixtureProject | undefined;
let registryRoot: string | undefined;
let previousRegistryRoot: string | undefined;

beforeEach(() => {
  registryRoot = mkdtempSync(path.join(tmpdir(), 'agentform-registry-e2e-'));
  previousRegistryRoot = process.env.AGENTFORM_REGISTRY_ROOT;
  process.env.AGENTFORM_REGISTRY_ROOT = registryRoot;
});

afterEach(() => {
  fixture?.cleanup();
  fixture = undefined;
  if (registryRoot) {
    rmSync(registryRoot, { recursive: true, force: true });
    registryRoot = undefined;
  }
  if (previousRegistryRoot === undefined) {
    delete process.env.AGENTFORM_REGISTRY_ROOT;
  } else {
    process.env.AGENTFORM_REGISTRY_ROOT = previousRegistryRoot;
  }
});

describe('module resolution (agentform validate/inspect)', () => {
  it('merges a published module into the project and substitutes its default input', () => {
    publishModule(registryRoot!, 'government/complaint-intake', moduleDefinition());
    fixture = createFixtureProject(projectWithModule());

    const validated = runCli(['validate'], fixture.dir);
    expect(validated.exitCode).toBe(0);

    const inspected = runCli(['inspect', 'agent.intake', '--json'], fixture.dir);
    expect(inspected.exitCode).toBe(0);
    const parsed = JSON.parse(inspected.stdout) as { instructions: { text: string } };
    expect(parsed.instructions.text).toBe('Serve us-east.');
  });

  it('a project-supplied input overrides the module default', () => {
    publishModule(registryRoot!, 'government/complaint-intake', moduleDefinition());
    fixture = createFixtureProject(projectWithModule({ region: 'eu-west' }));

    const inspected = runCli(['inspect', 'agent.intake', '--json'], fixture.dir);
    const parsed = JSON.parse(inspected.stdout) as { instructions: { text: string } };
    expect(parsed.instructions.text).toBe('Serve eu-west.');
  });

  it('fails validation when the declared module is not published', () => {
    fixture = createFixtureProject(projectWithModule());
    const result = runCli(['validate'], fixture.dir);
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('AGF7001');
  });
});

describe('agentform lockfile', () => {
  it('writes agentform.lock pinning the resolved module', () => {
    publishModule(registryRoot!, 'government/complaint-intake', moduleDefinition());
    fixture = createFixtureProject(projectWithModule());

    const result = runCli(['lockfile'], fixture.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('complaintIntake');

    const lockPath = path.join(fixture.dir, 'agentform.lock');
    expect(existsSync(lockPath)).toBe(true);
    const lockfile = JSON.parse(readFileSync(lockPath, 'utf-8')) as {
      modules: { id: string; source: string; version: string }[];
    };
    expect(lockfile.modules).toEqual([
      {
        id: 'complaintIntake',
        source: 'government/complaint-intake',
        version: '1.0.0',
        contentHash: expect.any(String),
        signatureVerified: false,
      },
    ]);
  });

  it('--check reports up to date immediately after writing', () => {
    publishModule(registryRoot!, 'government/complaint-intake', moduleDefinition());
    fixture = createFixtureProject(projectWithModule());

    expect(runCli(['lockfile'], fixture.dir).exitCode).toBe(0);
    const result = runCli(['lockfile', '--check'], fixture.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('up to date');
  });

  it('--check reports out of date (exit 1) when no lockfile exists yet', () => {
    publishModule(registryRoot!, 'government/complaint-intake', moduleDefinition());
    fixture = createFixtureProject(projectWithModule());

    const result = runCli(['lockfile', '--check'], fixture.dir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('out of date');
  });

  it('--check reports out of date when the registry now serves different content for the same locked version', () => {
    publishModule(registryRoot!, 'government/complaint-intake', moduleDefinition());
    fixture = createFixtureProject(projectWithModule());
    expect(runCli(['lockfile'], fixture.dir).exitCode).toBe(0);

    // Re-publish the *same* source+version with different content — the
    // published module's own contentHash changes, so the lockfile (which
    // pinned the original hash) is now stale without agentform.yaml
    // itself having changed at all.
    const republished = moduleDefinition();
    publishModule(registryRoot!, 'government/complaint-intake', {
      ...republished,
      spec: {
        ...republished.spec,
        agents: {
          intake: {
            model: 'primary',
            role: 'assistant',
            instructions: { text: 'Different instructions entirely.' },
          },
        },
      },
    });

    const result = runCli(['lockfile', '--check'], fixture.dir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('out of date');
  });

  it('supports --help', () => {
    fixture = createFixtureProject({ 'placeholder.txt': 'x' });
    const result = runCli(['lockfile', '--help'], fixture.dir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--check');
  });
});
