import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { buildIR } from './build.js';
import { withApplication } from './test-fixtures.js';

const specificationsRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../specifications/v1alpha1',
);

function loadFixture(relativePath: string): unknown {
  return parse(readFileSync(path.join(specificationsRoot, relativePath), 'utf-8'));
}

describe('buildIR', () => {
  it('builds a real production example end to end (municipal-complaint-assistant)', () => {
    const result = buildIR(loadFixture('examples/municipal-complaint-assistant.yaml'));

    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(result.ir).toBeDefined();
    expect(result.ir?.agents.get('intake')).toBeDefined();
    expect(result.ir?.workflows.get('main')?.nodes.size).toBe(3);
    expect(result.ir?.tools.get('complaintRegistry')).toBeDefined();
    expect(result.ir?.policies).toEqual([
      'require-human-approval-for-write',
      'restrict-data-residency',
    ]);
  });

  it('builds the minimal basic-assistant example end to end', () => {
    const result = buildIR(loadFixture('examples/basic-assistant.yaml'));
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(result.ir?.models.get('primary')?.model).toBe('gpt-5');
  });

  it('fails (no IR) when schema validation fails', () => {
    const result = buildIR({ apiVersion: 'wrong', kind: 'AgenticApplication' });
    expect(result.ir).toBeUndefined();
    expect(result.application).toBeUndefined();
    expect(result.diagnostics.some((d) => d.severity === 'error')).toBe(true);
  });

  it('fails (no IR) when a schema-valid document has an invalid graph, but still exposes the schema-validated application', () => {
    const app = withApplication((a) => {
      a.spec.workflows.main!.nodes.orphan = { type: 'agent', agent: 'assistant' };
    });
    const result = buildIR(app);
    expect(result.ir).toBeUndefined();
    expect(result.application).toBeDefined();
    expect(result.diagnostics.some((d) => d.code === 'AGF3005')).toBe(true);
  });

  it('exposes the schema-validated application alongside a successful build', () => {
    const result = buildIR(withApplication(() => {}));
    expect(result.application?.spec.agents.assistant?.role).toBe('assistant');
  });

  it('passes a valid branching graph through to a real IR', () => {
    const app = withApplication((a) => {
      a.spec.workflows.main = {
        entrypoint: 'assistant',
        nodes: {
          assistant: { type: 'agent', agent: 'assistant' },
          approve: { type: 'humanApproval' },
          done: { type: 'terminate' },
        },
        edges: [
          { from: 'assistant', to: 'approve', when: 'output.confidence < 0.85' },
          { from: 'assistant', to: 'done', when: 'output.confidence >= 0.85' },
          { from: 'approve', to: 'done' },
        ],
      };
    });
    const result = buildIR(app);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(result.ir?.workflows.get('main')?.nodes.size).toBe(3);
  });

  it('normalizes an agent with no declared tools/policies to empty arrays in the IR', () => {
    const result = buildIR(withApplication(() => {}));
    expect(result.ir?.agents.get('assistant')?.tools).toEqual([]);
    expect(result.ir?.agents.get('assistant')?.policies).toEqual([]);
  });

  it('produces a stable content hash across two builds of the same document', () => {
    const first = buildIR(withApplication(() => {}));
    const second = buildIR(withApplication(() => {}));
    expect(first.ir?.contentHash).toBe(second.ir?.contentHash);
  });

  it('produces the same content hash regardless of top-level key order (equivalent formatting)', () => {
    const ordered = buildIR({
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
    const reordered = buildIR({
      spec: {
        workflows: {
          main: {
            nodes: { assistant: { agent: 'assistant', type: 'agent' } },
            entrypoint: 'assistant',
          },
        },
        agents: {
          assistant: {
            instructions: { text: 'You are a helpful assistant.' },
            role: 'assistant',
            model: 'primary',
          },
        },
        models: { primary: { model: 'gpt-5', provider: 'openai' } },
        runtime: { environment: 'development', target: 'openai' },
      },
      metadata: { version: '1.0.0', name: 'fixture-app' },
      kind: 'AgenticApplication',
      apiVersion: 'agentform.dev/v1alpha1',
    });

    expect(ordered.ir?.contentHash).toBe(reordered.ir?.contentHash);
  });

  it('produces a different content hash when a resource value actually changes (source change)', () => {
    const a = buildIR(withApplication(() => {}));
    const b = buildIR(
      withApplication((app) => {
        app.spec.models.primary!.model = 'gpt-5.1';
      }),
    );
    expect(a.ir?.contentHash).not.toBe(b.ir?.contentHash);
  });

  it('produces a different content hash when only instructions/prompt text changes', () => {
    const a = buildIR(withApplication(() => {}));
    const b = buildIR(
      withApplication((app) => {
        app.spec.agents.assistant!.instructions = {
          text: 'You are an extremely helpful assistant.',
        };
      }),
    );
    expect(a.ir?.contentHash).not.toBe(b.ir?.contentHash);
  });

  it('produces the same content hash regardless of resource declaration order', () => {
    const a = buildIR({
      apiVersion: 'agentform.dev/v1alpha1',
      kind: 'AgenticApplication',
      metadata: { name: 'app', version: '1.0.0' },
      spec: {
        runtime: { target: 'openai', environment: 'development' },
        models: {
          primary: { provider: 'openai', model: 'gpt-5' },
          fallback: { provider: 'openai', model: 'gpt-4' },
        },
        agents: {
          assistant: { model: 'primary', role: 'a', instructions: { text: 'hi' } },
        },
        workflows: {
          main: {
            entrypoint: 'assistant',
            nodes: { assistant: { type: 'agent', agent: 'assistant' } },
          },
        },
      },
    });
    const b = buildIR({
      apiVersion: 'agentform.dev/v1alpha1',
      kind: 'AgenticApplication',
      metadata: { name: 'app', version: '1.0.0' },
      spec: {
        runtime: { target: 'openai', environment: 'development' },
        models: {
          fallback: { provider: 'openai', model: 'gpt-4' },
          primary: { provider: 'openai', model: 'gpt-5' },
        },
        agents: {
          assistant: { model: 'primary', role: 'a', instructions: { text: 'hi' } },
        },
        workflows: {
          main: {
            entrypoint: 'assistant',
            nodes: { assistant: { type: 'agent', agent: 'assistant' } },
          },
        },
      },
    });
    expect(a.ir?.contentHash).toBe(b.ir?.contentHash);
  });
});
