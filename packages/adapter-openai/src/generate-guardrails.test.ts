import { describe, expect, it } from 'vitest';
import { collectGuardrailNames, generateGuardrailsFile } from './generate-guardrails.js';
import { baseIR, multiAgentIR } from './test-fixtures.js';
import { isSyntacticallyValidTypeScript } from './test-syntax-check.js';

describe('collectGuardrailNames', () => {
  it('returns an empty list when no agent declares guardrails', () => {
    expect(collectGuardrailNames(baseIR())).toEqual([]);
  });

  it('collects every distinct guardrail name across agents, sorted', () => {
    expect(collectGuardrailNames(multiAgentIR())).toEqual(['no-pii']);
  });
});

describe('generateGuardrailsFile', () => {
  it('returns undefined when there are no guardrails to generate', () => {
    expect(generateGuardrailsFile(baseIR())).toBeUndefined();
  });

  it('produces syntactically valid TypeScript with one stub per guardrail', () => {
    const source = generateGuardrailsFile(multiAgentIR());
    expect(source).toBeDefined();
    expect(isSyntacticallyValidTypeScript(source as string)).toBe(true);
    expect(source).toContain('export const no_pii: InputGuardrail = {');
  });

  it('never fabricates real guardrail logic — always a TODO stub', () => {
    const source = generateGuardrailsFile(multiAgentIR()) as string;
    expect(source).toContain('TODO');
    expect(source).toContain('tripwireTriggered: false');
  });
});
