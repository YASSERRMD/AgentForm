import { describe, expect, it } from 'vitest';
import { validateToolPermissions } from './permissions.js';
import { withApplication } from '../test-fixtures.js';

describe('validateToolPermissions', () => {
  it('passes when there are no tools', () => {
    expect(validateToolPermissions(withApplication(() => {}))).toEqual([]);
  });

  it('passes a read-only tool with no declared permissions', () => {
    const app = withApplication((a) => {
      a.spec.tools = { search: { type: 'mcp', server: 'x', operation: 'y', sideEffect: 'read' } };
    });
    expect(validateToolPermissions(app)).toEqual([]);
  });

  it('reports AGF3011 for a write tool with no declared permissions', () => {
    const app = withApplication((a) => {
      a.spec.tools = {
        registry: { type: 'http', baseUrl: 'https://x', operations: {}, sideEffect: 'write' },
      };
    });
    const diagnostics = validateToolPermissions(app);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('AGF3011');
  });

  it('reports AGF3011 for a destructive tool with an empty permissions array', () => {
    const app = withApplication((a) => {
      a.spec.tools = {
        deleter: {
          type: 'function',
          handler: 'delete',
          sideEffect: 'destructive',
          permissions: [],
        },
      };
    });
    const diagnostics = validateToolPermissions(app);
    expect(diagnostics.some((d) => d.code === 'AGF3011')).toBe(true);
  });

  it('passes a write tool that declares permissions', () => {
    const app = withApplication((a) => {
      a.spec.tools = {
        registry: {
          type: 'http',
          baseUrl: 'https://x',
          operations: {},
          sideEffect: 'write',
          permissions: ['complaints:write'],
        },
      };
    });
    expect(validateToolPermissions(app)).toEqual([]);
  });

  it('does not flag a tool with no declared sideEffect at all', () => {
    const app = withApplication((a) => {
      a.spec.tools = { search: { type: 'mcp', server: 'x', operation: 'y' } };
    });
    expect(validateToolPermissions(app)).toEqual([]);
  });
});
