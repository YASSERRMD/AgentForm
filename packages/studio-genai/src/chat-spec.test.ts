import type { AgenticApplication } from '@agentform/schema';
import { describe, expect, it } from 'vitest';
import { chatEditSpec, chatSpecResponseSchema } from './chat-spec.js';
import { createFakeProvider } from './providers/fake-provider.js';

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

describe('chatEditSpec', () => {
  it('returns just a message when the model replies conversationally, with no patch', async () => {
    const provider = createFakeProvider({
      responses: [{ type: 'message', message: 'The assistant currently uses the primary model.' }],
    });

    const result = await chatEditSpec({
      message: 'what model does the assistant use?',
      currentApplication: APPLICATION,
      provider,
    });

    expect(result).toEqual({ message: 'The assistant currently uses the primary model.' });
  });

  it('returns a message and a patch when the model proposes an edit', async () => {
    const provider = createFakeProvider({
      responses: [
        {
          type: 'proposal',
          message: "I've changed the assistant's role to researcher.",
          patch: [
            { op: 'replace', path: ['spec', 'agents', 'assistant', 'role'], value: 'researcher' },
          ],
        },
      ],
    });

    const result = await chatEditSpec({
      message: 'make the assistant a researcher instead',
      currentApplication: APPLICATION,
      provider,
    });

    expect(result).toEqual({
      message: "I've changed the assistant's role to researcher.",
      patch: [
        { op: 'replace', path: ['spec', 'agents', 'assistant', 'role'], value: 'researcher' },
      ],
    });
  });

  it('supports a remove operation against an existing resource', async () => {
    const provider = createFakeProvider({
      responses: [
        {
          type: 'proposal',
          message: 'Removed the main workflow.',
          patch: [{ op: 'remove', path: ['spec', 'workflows', 'main'] }],
        },
      ],
    });

    const result = await chatEditSpec({
      message: 'delete the main workflow',
      currentApplication: APPLICATION,
      provider,
    });

    expect(result.patch).toEqual([{ op: 'remove', path: ['spec', 'workflows', 'main'] }]);
  });

  it('passes prior conversation history through to the provider', async () => {
    const provider = createFakeProvider({
      responses: [{ type: 'message', message: 'Sure — anything else?' }],
    });
    const history = [
      { role: 'user' as const, content: 'add a lookup tool' },
      { role: 'assistant' as const, content: "I've added a lookup tool." },
    ];

    await chatEditSpec({ message: 'thanks', history, currentApplication: APPLICATION, provider });

    expect(provider.requests[0]?.history).toEqual(history);
  });

  it('passes the message and the real chatSpecResponseSchema through to the provider', async () => {
    const provider = createFakeProvider({ responses: [{ type: 'message', message: 'ok' }] });

    await chatEditSpec({ message: 'hello', currentApplication: APPLICATION, provider });

    expect(provider.requests[0]?.userPrompt).toBe('hello');
    expect(provider.requests[0]?.schema).toBe(chatSpecResponseSchema);
  });

  it('includes the current application in the system prompt', async () => {
    const provider = createFakeProvider({ responses: [{ type: 'message', message: 'ok' }] });

    await chatEditSpec({ message: 'hello', currentApplication: APPLICATION, provider });

    expect(provider.requests[0]?.systemPrompt).toContain('"assistant"');
  });
});
