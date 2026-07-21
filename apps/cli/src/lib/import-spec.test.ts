import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import type { ImportCandidate } from '@agentform/plugin-sdk';
import { buildCandidateSpecDocument } from './import-spec.js';

function candidate(
  overrides: Partial<ImportCandidate> & Pick<ImportCandidate, 'resourceAddress' | 'kind'>,
): ImportCandidate {
  return { value: {}, confidence: 0.5, ...overrides };
}

describe('buildCandidateSpecDocument', () => {
  it('always includes models/agents/tools/workflows, even when empty', () => {
    const text = buildCandidateSpecDocument([], { applicationName: 'demo', target: 'openai' });
    const parsed = parse(text) as { spec: Record<string, unknown> };
    expect(parsed.spec.models).toEqual({});
    expect(parsed.spec.agents).toEqual({});
    expect(parsed.spec.tools).toEqual({});
    expect(parsed.spec.workflows).toEqual({});
  });

  it('places each candidate under its kind-appropriate collection, keyed by id', () => {
    const text = buildCandidateSpecDocument(
      [
        candidate({
          resourceAddress: 'agent.assistant',
          kind: 'agent',
          value: { role: 'assistant' },
        }),
        candidate({
          resourceAddress: 'model.primary',
          kind: 'model',
          value: { provider: 'openai', model: 'gpt-5' },
        }),
      ],
      { applicationName: 'demo', target: 'openai' },
    );
    const parsed = parse(text) as { spec: Record<string, Record<string, unknown>> };
    expect(parsed.spec.agents!.assistant).toEqual({ role: 'assistant' });
    expect(parsed.spec.models!.primary).toEqual({ provider: 'openai', model: 'gpt-5' });
  });

  it('sets apiVersion/kind/metadata.name/runtime.target as expected', () => {
    const text = buildCandidateSpecDocument([], { applicationName: 'my-app', target: 'langgraph' });
    const parsed = parse(text) as {
      apiVersion: string;
      kind: string;
      metadata: { name: string; description: string };
      spec: { runtime: { target: string; environment: string } };
    };
    expect(parsed.apiVersion).toBe('agentform.dev/v1alpha1');
    expect(parsed.kind).toBe('AgenticApplication');
    expect(parsed.metadata.name).toBe('my-app');
    expect(parsed.metadata.description).toContain('agentform import');
    expect(parsed.spec.runtime).toEqual({ target: 'langgraph', environment: 'development' });
  });

  it('produces parseable, deterministic YAML', () => {
    const candidates = [candidate({ resourceAddress: 'tool.search', kind: 'tool' })];
    const first = buildCandidateSpecDocument(candidates, {
      applicationName: 'a',
      target: 'openai',
    });
    const second = buildCandidateSpecDocument(candidates, {
      applicationName: 'a',
      target: 'openai',
    });
    expect(first).toBe(second);
  });

  it('ignores a candidate whose kind has no known collection', () => {
    const text = buildCandidateSpecDocument(
      [candidate({ resourceAddress: 'memory.buffer', kind: 'memory' })],
      { applicationName: 'demo', target: 'openai' },
    );
    const parsed = parse(text) as { spec: Record<string, unknown> };
    expect(parsed.spec.memory).toBeUndefined();
  });
});
