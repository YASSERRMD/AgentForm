import type { WorkflowNode, WorkflowNodeType } from '@agentform/studio-core';
import { describe, expect, it } from 'vitest';
import {
  CATEGORY_COLOR,
  summarizeWorkflowNode,
  WORKFLOW_NODE_CATEGORY,
} from './workflow-node-visuals';

const ALL_NODE_TYPES: readonly WorkflowNodeType[] = [
  'agent',
  'tool',
  'router',
  'parallel',
  'join',
  'loop',
  'humanApproval',
  'delay',
  'event',
  'subworkflow',
  'transform',
  'condition',
  'terminate',
];

describe('WORKFLOW_NODE_CATEGORY', () => {
  it('assigns exactly one of the 4 categories to every real node type', () => {
    for (const type of ALL_NODE_TYPES) {
      expect(Object.keys(CATEGORY_COLOR)).toContain(WORKFLOW_NODE_CATEGORY[type]);
    }
  });
});

describe('summarizeWorkflowNode', () => {
  const cases: readonly [WorkflowNode, string][] = [
    [{ type: 'agent', agent: 'assistant' }, 'agent: assistant'],
    [{ type: 'tool', tool: 'lookup' }, 'tool: lookup'],
    [{ type: 'subworkflow', workflow: 'billing' }, 'workflow: billing'],
    [{ type: 'loop', maxIterations: 5 }, 'max 5 iteration(s)'],
    [{ type: 'delay', duration: '5s' }, 'wait 5s'],
    [{ type: 'event', eventType: 'user.replied' }, 'event: user.replied'],
    [{ type: 'condition', expression: 'x > 0' }, 'x > 0'],
    [{ type: 'transform', expression: 'x + 1' }, 'x + 1'],
    [{ type: 'terminate' }, 'terminate'],
    [{ type: 'terminate', reason: 'done' }, 'done'],
    [{ type: 'humanApproval' }, 'human approval'],
    [{ type: 'humanApproval', approvers: ['ops'] }, 'approvers: ops'],
    [{ type: 'router' }, 'router'],
    [{ type: 'router', default: 'fallback' }, 'default: fallback'],
    [{ type: 'parallel' }, 'parallel'],
    [{ type: 'parallel', branches: ['a', 'b'] }, '2 branch(es)'],
    [{ type: 'join' }, 'join'],
    [{ type: 'join', strategy: 'all' }, 'strategy: all'],
  ];

  it.each(cases)('summarizes %o as %s', (node, expected) => {
    expect(summarizeWorkflowNode(node)).toBe(expected);
  });
});
