import type { AgenticApplication } from '@agentform/schema';
import { formLayoutSchema } from '@agentform/studio-design';
import { describe, expect, it } from 'vitest';
import { createFakeProvider } from './providers/fake-provider.js';
import { promptToDesign } from './prompt-to-design.js';

const APPLICATION: AgenticApplication = {
  apiVersion: 'agentform.dev/v1alpha1',
  kind: 'AgenticApplication',
  metadata: { name: 'fixture', version: '1.0.0' },
  spec: {
    runtime: { target: 'openai', environment: 'test' },
    models: { primary: { provider: 'openai', model: 'gpt-4' } },
    agents: {
      assistant: {
        model: 'primary',
        role: 'assistant',
        instructions: { text: 'Help.' },
        inputSchema: {
          type: 'object',
          properties: { question: { type: 'string' }, urgency: { type: 'string' } },
        },
        outputSchema: { type: 'object', properties: { answer: { type: 'string' } } },
      },
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

const LAYOUT_RESPONSE = {
  input: [
    { id: 'q', type: 'field', fieldPath: 'question', widget: 'textarea' },
    { id: 'u', type: 'field', fieldPath: 'urgency', widget: 'select' },
  ],
  output: [{ id: 'a', type: 'field', fieldPath: 'answer', widget: 'textarea' }],
};

describe('promptToDesign', () => {
  it('returns the layout the provider generated', async () => {
    const provider = createFakeProvider({ responses: [LAYOUT_RESPONSE] });

    const result = await promptToDesign({
      prompt: 'group urgency with the question',
      agentId: 'assistant',
      currentApplication: APPLICATION,
      provider,
    });

    expect(result.layout).toEqual(LAYOUT_RESPONSE);
  });

  it("lists the agent's real input and output field names in the system prompt", async () => {
    const provider = createFakeProvider({ responses: [LAYOUT_RESPONSE] });

    await promptToDesign({
      prompt: 'lay it out',
      agentId: 'assistant',
      currentApplication: APPLICATION,
      provider,
    });

    const systemPrompt = provider.requests[0]?.systemPrompt ?? '';
    expect(systemPrompt).toContain('question');
    expect(systemPrompt).toContain('urgency');
    expect(systemPrompt).toContain('answer');
  });

  it('does not throw for an unknown agentId, and reports no fields as available', async () => {
    const provider = createFakeProvider({ responses: [{}] });

    await promptToDesign({
      prompt: 'lay it out',
      agentId: 'does-not-exist',
      currentApplication: APPLICATION,
      provider,
    });

    const systemPrompt = provider.requests[0]?.systemPrompt ?? '';
    expect(systemPrompt).toContain('(none declared)');
  });

  it('passes the prompt and the real formLayoutSchema through to the provider', async () => {
    const provider = createFakeProvider({ responses: [LAYOUT_RESPONSE] });

    await promptToDesign({
      prompt: 'group urgency with the question',
      agentId: 'assistant',
      currentApplication: APPLICATION,
      provider,
    });

    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]?.userPrompt).toBe('group urgency with the question');
    expect(provider.requests[0]?.schema).toBe(formLayoutSchema);
  });
});
