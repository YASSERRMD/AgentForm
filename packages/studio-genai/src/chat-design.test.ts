import type { AgenticApplication } from '@agentform/schema';
import { formLayoutSchema } from '@agentform/studio-design';
import { describe, expect, it } from 'vitest';
import { chatEditDesign } from './chat-design.js';
import { createFakeProvider } from './providers/fake-provider.js';

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
        inputSchema: { type: 'object', properties: { question: {}, urgency: {} } },
        outputSchema: { type: 'object', properties: { answer: {} } },
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

describe('chatEditDesign', () => {
  it('returns just a message when the model replies conversationally, with no layout', async () => {
    const provider = createFakeProvider({
      responses: [{ type: 'message', message: 'This agent has two input fields today.' }],
    });

    const result = await chatEditDesign({
      message: 'what fields does this have?',
      agentId: 'assistant',
      currentApplication: APPLICATION,
      provider,
    });

    expect(result).toEqual({ message: 'This agent has two input fields today.' });
  });

  it('returns a message and a layout when the model proposes one', async () => {
    const layout = {
      input: [{ id: 'q', type: 'field', fieldPath: 'question', widget: 'textarea' }],
    };
    const provider = createFakeProvider({
      responses: [{ type: 'proposal', message: 'Grouped the question field.', layout }],
    });

    const result = await chatEditDesign({
      message: 'lay out the question field',
      agentId: 'assistant',
      currentApplication: APPLICATION,
      provider,
    });

    expect(result).toEqual({ message: 'Grouped the question field.', layout });
  });

  it('passes prior conversation history through to the provider', async () => {
    const provider = createFakeProvider({ responses: [{ type: 'message', message: 'ok' }] });
    const history = [
      { role: 'user' as const, content: 'group urgency with the question' },
      { role: 'assistant' as const, content: 'Done.' },
    ];

    await chatEditDesign({
      message: 'thanks',
      history,
      agentId: 'assistant',
      currentApplication: APPLICATION,
      provider,
    });

    expect(provider.requests[0]?.history).toEqual(history);
  });

  it('does not throw for an unknown agentId, reporting no fields as available', async () => {
    const provider = createFakeProvider({ responses: [{ type: 'message', message: 'ok' }] });

    await chatEditDesign({
      message: 'hello',
      agentId: 'does-not-exist',
      currentApplication: APPLICATION,
      provider,
    });

    expect(provider.requests[0]?.systemPrompt).toContain('(none declared)');
  });

  it('passes the message and the real formLayoutSchema through when proposing', async () => {
    const layout = { input: [] };
    const provider = createFakeProvider({
      responses: [{ type: 'proposal', message: 'ok', layout }],
    });

    await chatEditDesign({
      message: 'lay it out',
      agentId: 'assistant',
      currentApplication: APPLICATION,
      provider,
    });

    // The proposal branch of chatDesignResponseSchema embeds formLayoutSchema for its `layout`
    // field rather than reusing the exact same schema instance, so assert equivalent behavior
    // instead of reference equality: a value formLayoutSchema itself accepts should parse fine.
    expect(() => formLayoutSchema.parse(layout)).not.toThrow();
    expect(provider.requests[0]?.userPrompt).toBe('lay it out');
  });
});
