import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { createFakeProvider } from './fake-provider.js';

const SCHEMA = z.object({ greeting: z.string() });

describe('createFakeProvider', () => {
  it('returns scripted responses in order', async () => {
    const provider = createFakeProvider({
      responses: [{ greeting: 'first' }, { greeting: 'second' }],
    });

    const first = await provider.generate({ systemPrompt: 's', userPrompt: 'u1', schema: SCHEMA });
    const second = await provider.generate({ systemPrompt: 's', userPrompt: 'u2', schema: SCHEMA });

    expect(first).toEqual({ greeting: 'first' });
    expect(second).toEqual({ greeting: 'second' });
  });

  it('records every request in order, including prompts and schema', async () => {
    const provider = createFakeProvider({ responses: [{ greeting: 'hi' }] });

    await provider.generate({ systemPrompt: 'system', userPrompt: 'user', schema: SCHEMA });

    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]).toEqual({
      systemPrompt: 'system',
      userPrompt: 'user',
      schema: SCHEMA,
    });
  });

  it('throws once scripted responses are exhausted, rather than looping', async () => {
    const provider = createFakeProvider({ responses: [{ greeting: 'only' }] });

    await provider.generate({ systemPrompt: 's', userPrompt: 'u', schema: SCHEMA });

    await expect(
      provider.generate({ systemPrompt: 's', userPrompt: 'u2', schema: SCHEMA }),
    ).rejects.toThrow(/no scripted response left/);
  });

  it('validates each scripted response against the caller-provided schema', async () => {
    const provider = createFakeProvider({ responses: [{ greeting: 42 }] });

    await expect(
      provider.generate({ systemPrompt: 's', userPrompt: 'u', schema: SCHEMA }),
    ).rejects.toThrow();
  });

  it('reports its provider name as "fake"', () => {
    const provider = createFakeProvider({ responses: [] });
    expect(provider.name).toBe('fake');
  });
});
