import { describe, expect, it } from 'vitest';
import type { IRTool } from '@agentform/ir';
import { generateToolFile } from './generate-tool.js';
import { isSyntacticallyValidTypeScript } from './test-syntax-check.js';

describe('generateToolFile', () => {
  it('produces syntactically valid TypeScript', () => {
    const tool: IRTool = { type: 'function', handler: 'lookup.ts#run' };
    const source = generateToolFile('lookup', tool);
    expect(isSyntacticallyValidTypeScript(source)).toBe(true);
  });

  it('sanitizes a hyphenated id into a valid identifier', () => {
    const tool: IRTool = { type: 'function', handler: 'x' };
    const source = generateToolFile('search-registry', tool);
    expect(source).toContain('export const search_registry =');
    expect(isSyntacticallyValidTypeScript(source)).toBe(true);
  });

  it('sets needsApproval: true for a destructive tool', () => {
    const tool: IRTool = {
      type: 'function',
      handler: 'x',
      sideEffect: 'destructive',
      idempotencyStrategy: 'no-op if already applied',
    };
    const source = generateToolFile('wipe', tool);
    expect(source).toContain('needsApproval: true');
  });

  it('does not set needsApproval for a read tool', () => {
    const tool: IRTool = { type: 'function', handler: 'x', sideEffect: 'read' };
    const source = generateToolFile('lookup', tool);
    expect(source).not.toContain('needsApproval');
  });

  it('includes a converted timeoutMs when the tool declares a timeout', () => {
    const tool: IRTool = { type: 'function', handler: 'x', timeout: '30s' };
    const source = generateToolFile('lookup', tool);
    expect(source).toContain('timeoutMs: 30000');
  });

  it('generates parameters from the tool inputSchema', () => {
    const tool: IRTool = {
      type: 'function',
      handler: 'x',
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    };
    const source = generateToolFile('search', tool);
    expect(source).toContain('"query": z.string()');
  });

  it('always generates a throwing execute stub, never a fake implementation', () => {
    const tool: IRTool = { type: 'function', handler: 'x' };
    const source = generateToolFile('lookup', tool);
    expect(source).toContain('throw new Error(');
    expect(source).toContain('is not yet implemented');
  });

  it('never includes a timestamp', () => {
    const tool: IRTool = { type: 'function', handler: 'x' };
    const source = generateToolFile('lookup', tool);
    expect(source).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});
