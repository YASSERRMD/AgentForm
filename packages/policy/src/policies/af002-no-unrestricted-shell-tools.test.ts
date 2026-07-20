import { describe, expect, it } from 'vitest';
import { af002NoUnrestrictedShellTools } from './af002-no-unrestricted-shell-tools.js';
import { withApplication } from '../test-fixtures.js';
import type { PolicyContext } from '../types.js';

describe('AF002 no-unrestricted-shell-tools', () => {
  it('passes when there are no tools at all', () => {
    const context: PolicyContext = { application: withApplication(() => {}) };
    expect(af002NoUnrestrictedShellTools.check(context)).toEqual([]);
  });

  it('rejects a function tool whose handler runs a shell command with no permissions', () => {
    const app = withApplication((application) => {
      application.spec.tools = {
        runner: { type: 'function', handler: 'exec: bash -c "$CMD"' },
      };
    });
    const findings = af002NoUnrestrictedShellTools.check({ application: app });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.resourceAddress).toBe('spec.tools.runner');
  });

  it('passes a shell-shaped tool that declares explicit permissions', () => {
    const app = withApplication((application) => {
      application.spec.tools = {
        runner: {
          type: 'function',
          handler: 'exec: bash -c "$CMD"',
          permissions: ['exec:restricted-sandbox'],
        },
      };
    });
    expect(af002NoUnrestrictedShellTools.check({ application: app })).toEqual([]);
  });

  it('passes a function tool whose handler has no shell indicator', () => {
    const app = withApplication((application) => {
      application.spec.tools = {
        formatter: { type: 'function', handler: 'formatters/uppercase.ts#run' },
      };
    });
    expect(af002NoUnrestrictedShellTools.check({ application: app })).toEqual([]);
  });
});
