import { describe, expect, it } from 'vitest';
import { interpolateDocument } from './variables.js';

describe('interpolateDocument', () => {
  it('resolves ${env.*} from the injected env map', () => {
    const result = interpolateDocument(
      { spec: { endpoint: '${env.OPENAI_BASE_URL}' } },
      { env: { OPENAI_BASE_URL: 'https://openai.example.com' } },
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.value).toEqual({ spec: { endpoint: 'https://openai.example.com' } });
  });

  it('resolves ${var.*} from a declared default and strips the variables section', () => {
    const result = interpolateDocument({
      variables: { region: { default: 'us-east-1' } },
      spec: { runtime: { environment: '${var.region}' } },
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.value).toEqual({ spec: { runtime: { environment: 'us-east-1' } } });
    expect(result.value).not.toHaveProperty('variables');
  });

  it('prefers a variable override over the declared default', () => {
    const result = interpolateDocument(
      { variables: { region: { default: 'us-east-1' } }, spec: { region: '${var.region}' } },
      { variableOverrides: { region: 'eu-west-1' } },
    );

    expect(result.value).toEqual({ spec: { region: 'eu-west-1' } });
  });

  it('reports a missing required variable (no default, no override)', () => {
    const result = interpolateDocument({
      variables: { apiKey: {} },
      spec: { key: '${var.apiKey}' },
    });

    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe('AGF1006');
  });

  it('resolves ${local.*} computed from var/env, and strips the locals section', () => {
    const result = interpolateDocument(
      {
        variables: { region: { default: 'us-east-1' } },
        locals: { fullRegion: 'aws-${var.region}' },
        spec: { region: '${local.fullRegion}' },
      },
      {},
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.value).toEqual({ spec: { region: 'aws-us-east-1' } });
    expect(result.value).not.toHaveProperty('locals');
  });

  it('preserves a non-string variable default type through a whole-field interpolation', () => {
    const result = interpolateDocument({
      variables: { maxTokens: { default: 4096 } },
      spec: { models: { primary: { maxTokens: '${var.maxTokens}' } } },
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.value).toEqual({ spec: { models: { primary: { maxTokens: 4096 } } } });
  });

  it('passes non-object input through unchanged (nothing to interpolate)', () => {
    const result = interpolateDocument('not-a-document');
    expect(result.value).toBe('not-a-document');
    expect(result.diagnostics).toEqual([]);
  });
});
