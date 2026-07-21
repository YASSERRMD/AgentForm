import { describe, expect, it } from 'vitest';
import { agenticApplicationSchema } from './application.js';
import { moduleDefinitionSchema, moduleReferenceSchema } from './module.js';

describe('moduleReferenceSchema', () => {
  it('accepts a minimal source/version reference', () => {
    const result = moduleReferenceSchema.safeParse({
      source: 'registry.agentform.dev/government/complaint-intake',
      version: '1.2.0',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an optional inputs record', () => {
    const result = moduleReferenceSchema.safeParse({
      source: 'registry.agentform.dev/government/complaint-intake',
      version: '1.2.0',
      inputs: { region: 'us-east', maxRetries: 3 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-semver version', () => {
    const result = moduleReferenceSchema.safeParse({ source: 'x', version: 'latest' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty source', () => {
    const result = moduleReferenceSchema.safeParse({ source: '', version: '1.0.0' });
    expect(result.success).toBe(false);
  });

  it('rejects an unrecognized field', () => {
    const result = moduleReferenceSchema.safeParse({
      source: 'x',
      version: '1.0.0',
      extra: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('moduleDefinitionSchema', () => {
  function validModule() {
    return {
      apiVersion: 'agentform.dev/v1alpha1',
      kind: 'AgentformModule',
      metadata: { name: 'complaint-intake', version: '1.2.0' },
      spec: {
        inputs: {
          region: { type: 'string', default: 'us-east' },
        },
        outputs: {
          intakeAgentId: { value: '${agents.intake}' },
        },
        models: { primary: { provider: 'openai', model: 'gpt-5' } },
        agents: {
          intake: {
            model: 'primary',
            role: 'assistant',
            instructions: { text: 'Take in a complaint for ${input.region}.' },
          },
        },
      },
    };
  }

  it('accepts a well-formed module definition', () => {
    const result = moduleDefinitionSchema.safeParse(validModule());
    expect(result.success).toBe(true);
  });

  it('accepts a module with no inputs/outputs at all', () => {
    const doc = validModule();
    delete (doc.spec as { inputs?: unknown }).inputs;
    delete (doc.spec as { outputs?: unknown }).outputs;
    expect(moduleDefinitionSchema.safeParse(doc).success).toBe(true);
  });

  it('rejects the wrong apiVersion', () => {
    const doc = { ...validModule(), apiVersion: 'agentform.dev/v2' };
    expect(moduleDefinitionSchema.safeParse(doc).success).toBe(false);
  });

  it('rejects the wrong kind (e.g. a full AgenticApplication document)', () => {
    const doc = { ...validModule(), kind: 'AgenticApplication' };
    expect(moduleDefinitionSchema.safeParse(doc).success).toBe(false);
  });

  it('rejects an invalid input type', () => {
    const doc = validModule();
    (doc.spec.inputs as Record<string, unknown>).region = { type: 'not-a-real-type' };
    expect(moduleDefinitionSchema.safeParse(doc).success).toBe(false);
  });

  it('rejects a top-level runtime field (that belongs to AgenticApplication, not a module)', () => {
    const doc = validModule() as Record<string, unknown>;
    (doc.spec as Record<string, unknown>).runtime = { target: 'openai', environment: 'dev' };
    expect(moduleDefinitionSchema.safeParse(doc).success).toBe(false);
  });
});

describe('a project declaring modules', () => {
  it('validates as part of a full AgenticApplication document', () => {
    const result = agenticApplicationSchema.safeParse({
      apiVersion: 'agentform.dev/v1alpha1',
      kind: 'AgenticApplication',
      metadata: { name: 'fixture-app', version: '1.0.0' },
      spec: {
        runtime: { target: 'openai', environment: 'development' },
        models: {},
        agents: {},
        workflows: { main: { entrypoint: 'a', nodes: { a: { type: 'agent', agent: 'a' } } } },
        modules: {
          complaintIntake: {
            source: 'registry.agentform.dev/government/complaint-intake',
            version: '1.2.0',
            inputs: { region: 'us-east' },
          },
        },
      },
    });
    expect(result.success).toBe(true);
  });
});
