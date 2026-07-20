import { describe, expect, it } from 'vitest';
import type { DirectedGraph } from '@agentform/core';
import { orderPlanItems } from './order.js';
import type { PlanItem } from './types.js';

function item(
  overrides: Partial<PlanItem> & Pick<PlanItem, 'resourceAddress' | 'operation'>,
): PlanItem {
  return {
    kind: 'agent',
    risk: 'LOW',
    changes: [],
    reasons: [],
    requiresApproval: false,
    ...overrides,
  };
}

describe('orderPlanItems', () => {
  it('orders CREATE items with the dependency before the dependent', () => {
    const graph: DirectedGraph = {
      nodes: new Set(['model.primary', 'agent.assistant']),
      edges: [{ from: 'model.primary', to: 'agent.assistant' }],
    };
    const items = [
      item({ resourceAddress: 'agent.assistant', operation: 'CREATE' }),
      item({ resourceAddress: 'model.primary', operation: 'CREATE' }),
    ];

    const ordered = orderPlanItems(items, graph);
    expect(ordered.map((i) => i.resourceAddress)).toEqual(['model.primary', 'agent.assistant']);
  });

  it('orders DELETE items with the dependent before the dependency', () => {
    const graph: DirectedGraph = {
      nodes: new Set(['model.primary', 'agent.assistant']),
      edges: [{ from: 'model.primary', to: 'agent.assistant' }],
    };
    const items = [
      item({ resourceAddress: 'model.primary', operation: 'DELETE' }),
      item({ resourceAddress: 'agent.assistant', operation: 'DELETE' }),
    ];

    const ordered = orderPlanItems(items, graph);
    expect(ordered.map((i) => i.resourceAddress)).toEqual(['agent.assistant', 'model.primary']);
  });

  it('places every non-delete item before every delete item', () => {
    const graph: DirectedGraph = {
      nodes: new Set(['model.primary', 'agent.assistant', 'agent.old']),
      edges: [],
    };
    const items = [
      item({ resourceAddress: 'agent.old', operation: 'DELETE' }),
      item({ resourceAddress: 'agent.assistant', operation: 'CREATE' }),
      item({ resourceAddress: 'model.primary', operation: 'UPDATE' }),
    ];

    const ordered = orderPlanItems(items, graph);
    const deleteIndex = ordered.findIndex((i) => i.operation === 'DELETE');
    const nonDeleteIndexes = ordered
      .map((i, index) => (i.operation !== 'DELETE' ? index : -1))
      .filter((index) => index >= 0);
    expect(Math.max(...nonDeleteIndexes)).toBeLessThan(deleteIndex);
  });

  it('respects a longer chain (model -> agent -> workflow)', () => {
    const graph: DirectedGraph = {
      nodes: new Set(['model.primary', 'agent.assistant', 'workflow.main']),
      edges: [
        { from: 'model.primary', to: 'agent.assistant' },
        { from: 'agent.assistant', to: 'workflow.main' },
      ],
    };
    const items = [
      item({ resourceAddress: 'workflow.main', operation: 'CREATE' }),
      item({ resourceAddress: 'model.primary', operation: 'CREATE' }),
      item({ resourceAddress: 'agent.assistant', operation: 'CREATE' }),
    ];

    const ordered = orderPlanItems(items, graph);
    expect(ordered.map((i) => i.resourceAddress)).toEqual([
      'model.primary',
      'agent.assistant',
      'workflow.main',
    ]);
  });
});
