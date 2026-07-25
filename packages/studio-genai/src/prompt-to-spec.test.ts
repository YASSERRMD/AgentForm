import type { AgenticApplication } from '@agentform/schema';
import { applyPatch } from '@agentform/studio-core';
import { describe, expect, it } from 'vitest';
import { createFakeProvider } from './providers/fake-provider.js';
import { generatedSpecProposalSchema, promptToSpec } from './prompt-to-spec.js';

const APPLICATION: AgenticApplication = {
  apiVersion: 'agentform.dev/v1alpha1',
  kind: 'AgenticApplication',
  metadata: { name: 'fixture', version: '1.0.0' },
  spec: {
    runtime: { target: 'openai', environment: 'test' },
    models: { primary: { provider: 'openai', model: 'gpt-4' } },
    agents: {
      assistant: { model: 'primary', role: 'assistant', instructions: { text: 'Help.' } },
    },
    workflows: {
      main: {
        entrypoint: 'respond',
        nodes: { respond: { type: 'agent', agent: 'assistant' } },
        edges: [],
      },
    },
  },
};

describe('promptToSpec', () => {
  it('converts newly proposed resources into add patch operations', async () => {
    const provider = createFakeProvider({
      responses: [
        {
          summary: 'Added a lookup tool and a researcher agent.',
          resources: {
            tools: { lookup: { type: 'function', handler: 'tools.lookup' } },
            agents: {
              researcher: {
                model: 'primary',
                role: 'researcher',
                instructions: { text: 'Research things.' },
              },
            },
          },
        },
      ],
    });

    const result = await promptToSpec({
      prompt: 'add a researcher',
      currentApplication: APPLICATION,
      provider,
    });

    expect(result.summary).toBe('Added a lookup tool and a researcher agent.');
    expect(result.skipped).toEqual([]);
    expect(result.patch).toEqual([
      {
        op: 'add',
        path: ['spec', 'tools', 'lookup'],
        value: { type: 'function', handler: 'tools.lookup' },
      },
      {
        op: 'add',
        path: ['spec', 'agents', 'researcher'],
        value: { model: 'primary', role: 'researcher', instructions: { text: 'Research things.' } },
      },
    ]);
  });

  it('applying the returned patch actually adds the resource at the right path', async () => {
    const provider = createFakeProvider({
      responses: [
        {
          summary: 'Added a tool.',
          resources: { tools: { lookup: { type: 'function', handler: 'tools.lookup' } } },
        },
      ],
    });

    const result = await promptToSpec({
      prompt: 'add a tool',
      currentApplication: APPLICATION,
      provider,
    });
    const patched = applyPatch(APPLICATION, result.patch);

    expect(patched.spec.tools?.lookup).toEqual({ type: 'function', handler: 'tools.lookup' });
    expect(APPLICATION.spec.tools).toBeUndefined();
  });

  it('skips a proposed resource whose id already exists, with a reason, rather than overwriting it', async () => {
    const provider = createFakeProvider({
      responses: [
        {
          summary: 'Redefined the primary model.',
          resources: { models: { primary: { provider: 'anthropic', model: 'claude-sonnet-5' } } },
        },
      ],
    });

    const result = await promptToSpec({
      prompt: 'change the model',
      currentApplication: APPLICATION,
      provider,
    });

    expect(result.patch).toEqual([]);
    expect(result.skipped).toEqual([
      {
        resourceType: 'models',
        resourceId: 'primary',
        reason: expect.stringContaining('already exists'),
      },
    ]);
  });

  it('passes the prompt and the real generatedSpecProposalSchema through to the provider', async () => {
    const provider = createFakeProvider({ responses: [{ summary: 'noop', resources: {} }] });

    await promptToSpec({ prompt: 'add a caching tool', currentApplication: APPLICATION, provider });

    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]?.userPrompt).toBe('add a caching tool');
    expect(provider.requests[0]?.schema).toBe(generatedSpecProposalSchema);
  });

  it('includes the current application in the system prompt so the model can reference existing ids', async () => {
    const provider = createFakeProvider({ responses: [{ summary: 'noop', resources: {} }] });

    await promptToSpec({ prompt: 'add a tool', currentApplication: APPLICATION, provider });

    expect(provider.requests[0]?.systemPrompt).toContain('"assistant"');
  });
});
