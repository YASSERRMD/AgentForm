import { describe, expect, it } from 'vitest';
import { af003WriteToolsRequireExplicitPermission } from './af003-write-tools-require-explicit-permission.js';
import { withApplication } from '../test-fixtures.js';
import type { PolicyContext } from '../types.js';

describe('AF003 write-tools-require-explicit-permission', () => {
  it('passes when there are no tools at all', () => {
    const context: PolicyContext = { application: withApplication(() => {}) };
    expect(af003WriteToolsRequireExplicitPermission.check(context)).toEqual([]);
  });

  it('passes a read tool with no permissions declared', () => {
    const app = withApplication((application) => {
      application.spec.tools = {
        lookup: { type: 'function', handler: 'lookup.ts#run', sideEffect: 'read' },
      };
    });
    expect(af003WriteToolsRequireExplicitPermission.check({ application: app })).toEqual([]);
  });

  it('rejects a write tool with no permissions declared', () => {
    const app = withApplication((application) => {
      application.spec.tools = {
        updateRecord: { type: 'function', handler: 'records.ts#update', sideEffect: 'write' },
      };
    });
    const findings = af003WriteToolsRequireExplicitPermission.check({ application: app });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.resourceAddress).toBe('spec.tools.updateRecord');
  });

  it('rejects a destructive tool with no permissions declared', () => {
    const app = withApplication((application) => {
      application.spec.tools = {
        deleteRecord: { type: 'function', handler: 'records.ts#delete', sideEffect: 'destructive' },
      };
    });
    expect(af003WriteToolsRequireExplicitPermission.check({ application: app })).toHaveLength(1);
  });

  it('passes a write tool that declares explicit permissions', () => {
    const app = withApplication((application) => {
      application.spec.tools = {
        updateRecord: {
          type: 'function',
          handler: 'records.ts#update',
          sideEffect: 'write',
          permissions: ['records:write'],
        },
      };
    });
    expect(af003WriteToolsRequireExplicitPermission.check({ application: app })).toEqual([]);
  });
});
