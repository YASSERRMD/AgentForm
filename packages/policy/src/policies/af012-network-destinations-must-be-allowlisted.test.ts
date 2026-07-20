import { describe, expect, it } from 'vitest';
import { af012NetworkDestinationsMustBeAllowlisted } from './af012-network-destinations-must-be-allowlisted.js';
import { withApplication } from '../test-fixtures.js';
import type { PolicyContext } from '../types.js';

describe('AF012 network-destinations-must-be-allowlisted', () => {
  it('passes when there are no tools at all', () => {
    const context: PolicyContext = { application: withApplication(() => {}) };
    expect(af012NetworkDestinationsMustBeAllowlisted.check(context)).toEqual([]);
  });

  it('passes a non-network tool type with no networkDestination', () => {
    const app = withApplication((application) => {
      application.spec.tools = {
        formatter: { type: 'function', handler: 'formatters/uppercase.ts#run' },
      };
    });
    expect(af012NetworkDestinationsMustBeAllowlisted.check({ application: app })).toEqual([]);
  });

  it('rejects an http tool with no networkDestination', () => {
    const app = withApplication((application) => {
      application.spec.tools = {
        registry: {
          type: 'http',
          baseUrl: 'https://registry.example.com',
          operations: { search: { method: 'GET', path: '/search' } },
        },
      };
    });
    const findings = af012NetworkDestinationsMustBeAllowlisted.check({ application: app });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.resourceAddress).toBe('spec.tools.registry');
  });

  it('rejects an openapi tool with no networkDestination', () => {
    const app = withApplication((application) => {
      application.spec.tools = {
        registry: { type: 'openapi', specPath: './specs/registry.yaml' },
      };
    });
    expect(af012NetworkDestinationsMustBeAllowlisted.check({ application: app })).toHaveLength(1);
  });

  it('passes an http tool that declares networkDestination', () => {
    const app = withApplication((application) => {
      application.spec.tools = {
        registry: {
          type: 'http',
          baseUrl: 'https://registry.example.com',
          operations: { search: { method: 'GET', path: '/search' } },
          networkDestination: 'registry.example.com',
        },
      };
    });
    expect(af012NetworkDestinationsMustBeAllowlisted.check({ application: app })).toEqual([]);
  });
});
