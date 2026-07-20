import { describe, expect, it } from 'vitest';
import { af011DestructiveToolsRequireIdempotencyStrategy } from './af011-destructive-tools-require-idempotency-strategy.js';
import { withApplication } from '../test-fixtures.js';
import type { PolicyContext } from '../types.js';

describe('AF011 destructive-tools-require-idempotency-strategy', () => {
  it('passes when there are no tools at all', () => {
    const context: PolicyContext = { application: withApplication(() => {}) };
    expect(af011DestructiveToolsRequireIdempotencyStrategy.check(context)).toEqual([]);
  });

  it('passes a non-destructive tool with no idempotency strategy', () => {
    const app = withApplication((application) => {
      application.spec.tools = {
        lookup: { type: 'function', handler: 'lookup.ts#run', sideEffect: 'read' },
      };
    });
    expect(af011DestructiveToolsRequireIdempotencyStrategy.check({ application: app })).toEqual([]);
  });

  it('rejects a destructive tool with no idempotency strategy', () => {
    const app = withApplication((application) => {
      application.spec.tools = {
        deleteRecord: { type: 'function', handler: 'records.ts#delete', sideEffect: 'destructive' },
      };
    });
    const findings = af011DestructiveToolsRequireIdempotencyStrategy.check({ application: app });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.resourceAddress).toBe('spec.tools.deleteRecord');
  });

  it('passes a destructive tool that declares an idempotency strategy', () => {
    const app = withApplication((application) => {
      application.spec.tools = {
        deleteRecord: {
          type: 'function',
          handler: 'records.ts#delete',
          sideEffect: 'destructive',
          idempotencyStrategy: 'requires an idempotency key derived from the record id',
        },
      };
    });
    expect(af011DestructiveToolsRequireIdempotencyStrategy.check({ application: app })).toEqual([]);
  });
});
