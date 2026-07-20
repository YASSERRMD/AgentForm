import { describe, expect, it } from 'vitest';
import { af006ToolsRequireTimeouts } from './af006-tools-require-timeouts.js';
import { withApplication } from '../test-fixtures.js';
import type { PolicyContext } from '../types.js';

describe('AF006 tools-require-timeouts', () => {
  it('passes when there are no tools at all', () => {
    const context: PolicyContext = { application: withApplication(() => {}) };
    expect(af006ToolsRequireTimeouts.check(context)).toEqual([]);
  });

  it('rejects a tool with no timeout', () => {
    const app = withApplication((application) => {
      application.spec.tools = { lookup: { type: 'function', handler: 'lookup.ts#run' } };
    });
    const findings = af006ToolsRequireTimeouts.check({ application: app });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.resourceAddress).toBe('spec.tools.lookup');
  });

  it('passes a tool with a declared timeout', () => {
    const app = withApplication((application) => {
      application.spec.tools = {
        lookup: { type: 'function', handler: 'lookup.ts#run', timeout: '30s' },
      };
    });
    expect(af006ToolsRequireTimeouts.check({ application: app })).toEqual([]);
  });
});
