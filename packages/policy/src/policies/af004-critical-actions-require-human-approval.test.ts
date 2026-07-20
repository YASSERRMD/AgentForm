import { describe, expect, it } from 'vitest';
import { af004CriticalActionsRequireHumanApproval } from './af004-critical-actions-require-human-approval.js';
import { withApplication } from '../test-fixtures.js';
import type { PolicyContext } from '../types.js';

function withDestructiveTool() {
  return withApplication((application) => {
    application.spec.tools = {
      deleteRecord: { type: 'function', handler: 'records.ts#delete', sideEffect: 'destructive' },
    };
    application.spec.workflows.main = {
      entrypoint: 'assistant',
      nodes: {
        assistant: { type: 'agent', agent: 'assistant' },
        deleteRecord: { type: 'tool', tool: 'deleteRecord' },
      },
      edges: [{ from: 'assistant', to: 'deleteRecord' }],
    };
  });
}

describe('AF004 critical-actions-require-human-approval', () => {
  it('passes a workflow with no destructive tool calls', () => {
    const context: PolicyContext = { application: withApplication(() => {}) };
    expect(af004CriticalActionsRequireHumanApproval.check(context)).toEqual([]);
  });

  it('rejects a destructive tool call with no preceding human approval node', () => {
    const findings = af004CriticalActionsRequireHumanApproval.check({
      application: withDestructiveTool(),
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.resourceAddress).toBe('spec.workflows.main.nodes.deleteRecord');
  });

  it('passes a destructive tool call gated by a preceding human approval node', () => {
    const app = withApplication((application) => {
      application.spec.tools = {
        deleteRecord: { type: 'function', handler: 'records.ts#delete', sideEffect: 'destructive' },
      };
      application.spec.workflows.main = {
        entrypoint: 'assistant',
        nodes: {
          assistant: { type: 'agent', agent: 'assistant' },
          approval: { type: 'humanApproval' },
          deleteRecord: { type: 'tool', tool: 'deleteRecord' },
        },
        edges: [
          { from: 'assistant', to: 'approval' },
          { from: 'approval', to: 'deleteRecord' },
        ],
      };
    });
    expect(af004CriticalActionsRequireHumanApproval.check({ application: app })).toEqual([]);
  });
});
