import type { Tool, Workflow } from '@agentform/schema';
import { describe, expect, it } from 'vitest';
import { findUngatedDestructiveToolNodes } from './workflow-risk.js';

const DESTRUCTIVE_TOOLS: Record<string, Tool> = {
  deleteRecord: { type: 'function', handler: 'records.ts#delete', sideEffect: 'destructive' },
};

describe('findUngatedDestructiveToolNodes', () => {
  it('returns nothing for a workflow with no destructive tool calls', () => {
    const workflow: Workflow = {
      entrypoint: 'assistant',
      nodes: { assistant: { type: 'agent', agent: 'assistant' } },
    };
    expect(findUngatedDestructiveToolNodes(workflow, DESTRUCTIVE_TOOLS)).toEqual([]);
  });

  it('flags a destructive tool call with no preceding human approval node', () => {
    const workflow: Workflow = {
      entrypoint: 'assistant',
      nodes: {
        assistant: { type: 'agent', agent: 'assistant' },
        deleteRecord: { type: 'tool', tool: 'deleteRecord' },
      },
      edges: [{ from: 'assistant', to: 'deleteRecord' }],
    };
    expect(findUngatedDestructiveToolNodes(workflow, DESTRUCTIVE_TOOLS)).toEqual(['deleteRecord']);
  });

  it('does not flag a destructive tool call gated by a preceding human approval node', () => {
    const workflow: Workflow = {
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
    expect(findUngatedDestructiveToolNodes(workflow, DESTRUCTIVE_TOOLS)).toEqual([]);
  });

  it('does not flag a tool call whose tool is read/write, not destructive', () => {
    const workflow: Workflow = {
      entrypoint: 'assistant',
      nodes: {
        assistant: { type: 'agent', agent: 'assistant' },
        lookup: { type: 'tool', tool: 'lookupRecord' },
      },
      edges: [{ from: 'assistant', to: 'lookup' }],
    };
    const tools: Record<string, Tool> = {
      lookupRecord: { type: 'function', handler: 'records.ts#lookup', sideEffect: 'read' },
    };
    expect(findUngatedDestructiveToolNodes(workflow, tools)).toEqual([]);
  });
});
