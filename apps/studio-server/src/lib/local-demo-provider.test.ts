import {
  chatDesignResponseSchema,
  chatSpecResponseSchema,
  generatedSpecProposalSchema,
} from '@agentform/studio-genai';
import { formLayoutSchema } from '@agentform/studio-design';
import { describe, expect, it } from 'vitest';
import { createLocalDemoProvider } from './local-demo-provider.js';

describe('createLocalDemoProvider', () => {
  it('reports its provider name as "local-demo"', () => {
    expect(createLocalDemoProvider().name).toBe('local-demo');
  });

  it('satisfies the real formLayoutSchema with an empty (nothing generated) layout', async () => {
    const provider = createLocalDemoProvider();

    const result = await provider.generate({
      systemPrompt: 's',
      userPrompt: 'u',
      schema: formLayoutSchema,
    });

    expect(result).toEqual({});
  });

  it('satisfies the real generatedSpecProposalSchema, explaining why nothing was proposed', async () => {
    const provider = createLocalDemoProvider();

    const result = await provider.generate({
      systemPrompt: 's',
      userPrompt: 'u',
      schema: generatedSpecProposalSchema,
    });

    expect(result.resources).toEqual({});
    expect(result.summary).toContain('local demo mode');
  });

  it('satisfies the real chatSpecResponseSchema with a plain "nothing generated" message, not a proposal', async () => {
    const provider = createLocalDemoProvider();

    const result = await provider.generate({
      systemPrompt: 's',
      userPrompt: 'u',
      schema: chatSpecResponseSchema,
    });

    expect(result.type).toBe('message');
    expect('message' in result && result.message).toContain('local demo mode');
  });

  it('satisfies the real chatDesignResponseSchema with a plain "nothing generated" message, not a proposal', async () => {
    const provider = createLocalDemoProvider();

    const result = await provider.generate({
      systemPrompt: 's',
      userPrompt: 'u',
      schema: chatDesignResponseSchema,
    });

    expect(result.type).toBe('message');
    expect('message' in result && result.message).toContain('local demo mode');
  });

  it('never throws for any of the four real schemas this server actually uses', async () => {
    const provider = createLocalDemoProvider();

    await expect(
      provider.generate({ systemPrompt: 's', userPrompt: 'u', schema: formLayoutSchema }),
    ).resolves.toBeDefined();
    await expect(
      provider.generate({
        systemPrompt: 's',
        userPrompt: 'u',
        schema: generatedSpecProposalSchema,
      }),
    ).resolves.toBeDefined();
    await expect(
      provider.generate({ systemPrompt: 's', userPrompt: 'u', schema: chatSpecResponseSchema }),
    ).resolves.toBeDefined();
    await expect(
      provider.generate({ systemPrompt: 's', userPrompt: 'u', schema: chatDesignResponseSchema }),
    ).resolves.toBeDefined();
  });
});
