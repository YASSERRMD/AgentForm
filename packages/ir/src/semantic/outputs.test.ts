import { describe, expect, it } from 'vitest';
import { validateOutputReferences } from './outputs.js';
import { withApplication } from '../test-fixtures.js';

describe('validateOutputReferences', () => {
  it('passes when there are no outputs', () => {
    expect(validateOutputReferences(withApplication(() => {}))).toEqual([]);
  });

  it('does not validate an opaque literal output value', () => {
    const app = withApplication((a) => {
      a.spec.outputs = { greeting: { value: 'a plain literal string' } };
    });
    expect(validateOutputReferences(app)).toEqual([]);
  });

  it('accepts an output value referencing a declared agent', () => {
    const app = withApplication((a) => {
      a.spec.outputs = { summary: { value: 'agents.assistant.result' } };
    });
    expect(validateOutputReferences(app)).toEqual([]);
  });

  it('accepts an output value referencing a declared model', () => {
    const app = withApplication((a) => {
      a.spec.outputs = { modelUsed: { value: 'models.primary.model' } };
    });
    expect(validateOutputReferences(app)).toEqual([]);
  });

  it('reports AGF3015 when an output references an unknown agent', () => {
    const app = withApplication((a) => {
      a.spec.outputs = { summary: { value: 'agents.does-not-exist.result' } };
    });
    const diagnostics = validateOutputReferences(app);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('AGF3015');
  });

  it('reports AGF3015 when an output references an unknown workflow', () => {
    const app = withApplication((a) => {
      a.spec.outputs = { path: { value: 'workflows.does-not-exist.status' } };
    });
    const diagnostics = validateOutputReferences(app);
    expect(diagnostics.some((d) => d.code === 'AGF3015')).toBe(true);
  });
});
