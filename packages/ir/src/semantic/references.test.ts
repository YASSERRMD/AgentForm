import { describe, expect, it } from 'vitest';
import { validateReferences } from './references.js';
import { withApplication } from '../test-fixtures.js';

describe('validateReferences', () => {
  it('passes a valid document with no diagnostics', () => {
    expect(validateReferences(withApplication(() => {}))).toEqual([]);
  });

  it('reports AGF3001 when an agent references an unknown model', () => {
    const app = withApplication((a) => {
      a.spec.agents.assistant!.model = 'does-not-exist';
    });
    const diagnostics = validateReferences(app);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('AGF3001');
    expect(diagnostics[0]?.path).toEqual(['spec', 'agents', 'assistant', 'model']);
  });

  it('reports AGF3002 when an agent lists an unknown tool', () => {
    const app = withApplication((a) => {
      a.spec.agents.assistant!.tools = ['does-not-exist'];
    });
    const diagnostics = validateReferences(app);
    expect(diagnostics.some((d) => d.code === 'AGF3002')).toBe(true);
  });

  it('reports AGF3002 for an unknown base tool name on a workflow tool node (dotted operation stripped)', () => {
    const app = withApplication((a) => {
      a.spec.workflows.main!.nodes.submit = { type: 'tool', tool: 'missingTool.create' };
    });
    const diagnostics = validateReferences(app);
    expect(diagnostics.some((d) => d.code === 'AGF3002')).toBe(true);
  });

  it('accepts a dotted tool operation reference when the base tool is declared', () => {
    const app = withApplication((a) => {
      a.spec.tools = { registry: { type: 'http', baseUrl: 'https://x', operations: {} } };
      a.spec.workflows.main!.nodes.submit = { type: 'tool', tool: 'registry.create' };
    });
    expect(validateReferences(app)).toEqual([]);
  });

  it('reports AGF3003 when a workflow agent node references an unknown agent', () => {
    const app = withApplication((a) => {
      a.spec.workflows.main!.nodes.assistant = { type: 'agent', agent: 'does-not-exist' };
    });
    const diagnostics = validateReferences(app);
    expect(diagnostics.some((d) => d.code === 'AGF3003')).toBe(true);
  });

  it('reports AGF3012 when an agent references unknown memory', () => {
    const app = withApplication((a) => {
      a.spec.agents.assistant!.memory = { ref: 'does-not-exist' };
    });
    const diagnostics = validateReferences(app);
    expect(diagnostics.some((d) => d.code === 'AGF3012')).toBe(true);
  });

  it('accepts a valid memory reference', () => {
    const app = withApplication((a) => {
      a.spec.memory = { conversation: { type: 'conversation' } };
      a.spec.agents.assistant!.memory = { ref: 'conversation' };
    });
    expect(validateReferences(app)).toEqual([]);
  });
});
