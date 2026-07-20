import { describe, expect, it } from 'vitest';
import { validateAgenticApplication } from './validate.js';

describe('validateAgenticApplication edge cases', () => {
  it('rejects an empty document with diagnostics for every missing root field', () => {
    const result = validateAgenticApplication({});
    expect(result.success).toBe(false);
    const paths = result.diagnostics.map((d) => d.path?.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['apiVersion', 'kind', 'metadata', 'spec']));
  });

  it('rejects non-object input without throwing', () => {
    const result = validateAgenticApplication('not-an-object');
    expect(result.success).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('rejects an unrecognized top-level key (schema is closed with .strict())', () => {
    const result = validateAgenticApplication({
      apiVersion: 'agentform.dev/v1alpha1',
      kind: 'AgenticApplication',
      metadata: { name: 'fixture-app', version: '1.0.0' },
      spec: {
        runtime: { target: 'openai', environment: 'development' },
        models: { primary: { provider: 'openai', model: 'gpt-5' } },
        agents: {
          assistant: {
            model: 'primary',
            role: 'assistant',
            instructions: { text: 'You are a helpful assistant.' },
          },
        },
        workflows: {
          main: {
            entrypoint: 'assistant',
            nodes: { assistant: { type: 'agent', agent: 'assistant' } },
          },
        },
      },
      unexpectedTopLevelField: true,
    });

    expect(result.success).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'AGF2006')).toBe(true);
  });

  it('returns typed, parsed data on success', () => {
    const result = validateAgenticApplication({
      apiVersion: 'agentform.dev/v1alpha1',
      kind: 'AgenticApplication',
      metadata: { name: 'fixture-app', version: '1.0.0' },
      spec: {
        runtime: { target: 'openai', environment: 'development' },
        models: { primary: { provider: 'openai', model: 'gpt-5' } },
        agents: {
          assistant: {
            model: 'primary',
            role: 'assistant',
            instructions: { text: 'You are a helpful assistant.' },
          },
        },
        workflows: {
          main: {
            entrypoint: 'assistant',
            nodes: { assistant: { type: 'agent', agent: 'assistant' } },
          },
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.data?.metadata.name).toBe('fixture-app');
    expect(result.data?.spec.models.primary.model).toBe('gpt-5');
  });
});
