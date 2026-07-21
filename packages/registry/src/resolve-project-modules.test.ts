import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ModuleDefinition } from '@agentform/schema';
import { afterEach, describe, expect, it } from 'vitest';
import { publishModule } from './local-registry.js';
import { resolveProjectModules } from './resolve-project-modules.js';
import { generateSigningKeyPair } from './signing.js';

function intakeModule(overrides: Partial<ModuleDefinition['spec']> = {}): ModuleDefinition {
  return {
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgentformModule',
    metadata: { name: 'complaint-intake', version: '1.2.0' },
    spec: {
      inputs: { region: { type: 'string', default: 'us-east' } },
      models: { moduleModel: { provider: 'openai', model: 'gpt-5' } },
      agents: {
        intake: {
          model: 'moduleModel',
          role: 'assistant',
          instructions: { text: 'Serve ${input.region}.' },
        },
      },
      ...overrides,
    },
  };
}

function project(overrides: Record<string, unknown> = {}) {
  return {
    apiVersion: 'agentform.dev/v1alpha1',
    kind: 'AgenticApplication',
    metadata: { name: 'fixture-app', version: '1.0.0' },
    spec: {
      runtime: { target: 'openai', environment: 'development' },
      models: {},
      agents: {},
      workflows: {},
      modules: {
        complaintIntake: { source: 'a/b', version: '1.2.0' },
      },
      ...overrides,
    },
  };
}

let registryRoot: string | undefined;

afterEach(() => {
  if (registryRoot) {
    rmSync(registryRoot, { recursive: true, force: true });
    registryRoot = undefined;
  }
});

describe('resolveProjectModules', () => {
  it('passes a document with no modules through unchanged', () => {
    registryRoot = mkdtempSync(path.join(tmpdir(), 'agentform-resolve-'));
    const doc = project({ modules: undefined });
    const result = resolveProjectModules(doc, { registryRoot });
    expect(result.diagnostics).toEqual([]);
    expect(result.resolvedModules).toEqual([]);
  });

  it('merges a resolved module into agents/models, substituting the default input', () => {
    registryRoot = mkdtempSync(path.join(tmpdir(), 'agentform-resolve-'));
    publishModule(registryRoot, 'a/b', intakeModule());

    const result = resolveProjectModules(project(), { registryRoot });
    expect(result.diagnostics).toEqual([]);
    const value = result.value as {
      spec: { agents: Record<string, unknown>; models: Record<string, unknown> };
    };
    expect(value.spec.agents.intake).toMatchObject({
      instructions: { text: 'Serve us-east.' },
    });
    expect(value.spec.models.moduleModel).toBeDefined();
    expect(result.resolvedModules).toEqual([
      {
        id: 'complaintIntake',
        source: 'a/b',
        version: '1.2.0',
        contentHash: expect.any(String),
        signatureVerified: false,
      },
    ]);
  });

  it('a consuming project can override a module input default', () => {
    registryRoot = mkdtempSync(path.join(tmpdir(), 'agentform-resolve-'));
    publishModule(registryRoot, 'a/b', intakeModule());

    const result = resolveProjectModules(
      project({
        modules: {
          complaintIntake: { source: 'a/b', version: '1.2.0', inputs: { region: 'eu-west' } },
        },
      }),
      { registryRoot },
    );
    const value = result.value as {
      spec: { agents: { intake: { instructions: { text: string } } } };
    };
    expect(value.spec.agents.intake.instructions.text).toBe('Serve eu-west.');
  });

  it('reports a missing required input with no default', () => {
    registryRoot = mkdtempSync(path.join(tmpdir(), 'agentform-resolve-'));
    publishModule(registryRoot, 'a/b', intakeModule({ inputs: { region: { type: 'string' } } }));

    const result = resolveProjectModules(project(), { registryRoot });
    expect(result.diagnostics.some((d) => d.code === 'AGF7004')).toBe(true);
  });

  it('reports a module that is not published in the registry', () => {
    registryRoot = mkdtempSync(path.join(tmpdir(), 'agentform-resolve-'));
    const result = resolveProjectModules(project(), { registryRoot });
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({ code: 'AGF7001', severity: 'error' });
    expect(result.resolvedModules).toEqual([]);
  });

  it('reports a collision between a module resource and an inline-declared one, inline wins', () => {
    registryRoot = mkdtempSync(path.join(tmpdir(), 'agentform-resolve-'));
    publishModule(registryRoot, 'a/b', intakeModule());

    const result = resolveProjectModules(
      project({
        agents: { intake: { model: 'x', role: 'inline-wins', instructions: { text: 'inline' } } },
      }),
      { registryRoot },
    );
    expect(result.diagnostics.some((d) => d.code === 'AGF7005')).toBe(true);
    const value = result.value as { spec: { agents: { intake: { role: string } } } };
    expect(value.spec.agents.intake.role).toBe('inline-wins');
  });

  it('reports a collision between two modules, the first-processed one wins', () => {
    registryRoot = mkdtempSync(path.join(tmpdir(), 'agentform-resolve-'));
    publishModule(registryRoot, 'a/b', intakeModule());
    publishModule(
      registryRoot,
      'c/d',
      intakeModule({
        agents: {
          intake: { model: 'moduleModel', role: 'second-module', instructions: { text: 'x' } },
        },
      }),
    );

    const result = resolveProjectModules(
      project({
        modules: {
          first: { source: 'a/b', version: '1.2.0' },
          second: { source: 'c/d', version: '1.2.0' },
        },
      }),
      { registryRoot },
    );
    expect(result.diagnostics.some((d) => d.code === 'AGF7005')).toBe(true);
    const value = result.value as { spec: { agents: { intake: { role: string } } } };
    expect(value.spec.agents.intake.role).toBe('assistant');
  });

  describe('signature verification', () => {
    it('warns (but still merges) an unsigned module when a trusted key is configured', () => {
      registryRoot = mkdtempSync(path.join(tmpdir(), 'agentform-resolve-'));
      publishModule(registryRoot, 'a/b', intakeModule());
      const keys = generateSigningKeyPair();

      const result = resolveProjectModules(project(), {
        registryRoot,
        trustedPublicKeyPem: keys.publicKeyPem,
      });
      expect(result.diagnostics).toMatchObject([{ code: 'AGF7006', severity: 'warning' }]);
      expect(result.resolvedModules).toHaveLength(1);
    });

    it('errors and skips merging a module whose signature does not verify', () => {
      registryRoot = mkdtempSync(path.join(tmpdir(), 'agentform-resolve-'));
      const signerKeys = generateSigningKeyPair();
      const trustedKeys = generateSigningKeyPair();
      publishModule(registryRoot, 'a/b', intakeModule(), {
        privateKeyPem: signerKeys.privateKeyPem,
        publicKeyPem: signerKeys.publicKeyPem,
      });

      const result = resolveProjectModules(project(), {
        registryRoot,
        trustedPublicKeyPem: trustedKeys.publicKeyPem,
      });
      expect(result.diagnostics).toMatchObject([{ code: 'AGF7006', severity: 'error' }]);
      expect(result.resolvedModules).toEqual([]);
      const value = result.value as { spec: { agents: Record<string, unknown> } };
      expect(value.spec.agents.intake).toBeUndefined();
    });

    it('verifies and merges a correctly signed module', () => {
      registryRoot = mkdtempSync(path.join(tmpdir(), 'agentform-resolve-'));
      const keys = generateSigningKeyPair();
      publishModule(registryRoot, 'a/b', intakeModule(), {
        privateKeyPem: keys.privateKeyPem,
        publicKeyPem: keys.publicKeyPem,
      });

      const result = resolveProjectModules(project(), {
        registryRoot,
        trustedPublicKeyPem: keys.publicKeyPem,
      });
      expect(result.diagnostics).toEqual([]);
      expect(result.resolvedModules[0]?.signatureVerified).toBe(true);
    });
  });
});
