import { describe, expect, it } from 'vitest';
import { layoutWorkflowNodes } from './workflow-layout';

const BOX = { width: 180, height: 60 };

describe('layoutWorkflowNodes', () => {
  it('places every node id, using a default box size when none is given', () => {
    const positions = layoutWorkflowNodes(['a', 'b'], [], {});
    expect(Object.keys(positions).sort()).toEqual(['a', 'b']);
    expect(Number.isFinite(positions.a?.x)).toBe(true);
    expect(Number.isFinite(positions.a?.y)).toBe(true);
  });

  it('ranks a linear chain top to bottom: each node strictly below its predecessor', () => {
    // Deliberately passes the same BOX reference for all 3 nodes — dagre
    // mutates the label object it's given in place (verified empirically),
    // so this also regression-tests that layoutWorkflowNodes defensively
    // clones before handing a box to dagre; a shared reference here used
    // to make every node's reported position collide on the last-written
    // node's values.
    const positions = layoutWorkflowNodes(
      ['a', 'b', 'c'],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ],
      { a: BOX, b: BOX, c: BOX },
    );
    expect(positions.a!.y).toBeLessThan(positions.b!.y);
    expect(positions.b!.y).toBeLessThan(positions.c!.y);
  });

  it('ignores an edge referencing a node id not in the current node set', () => {
    // Regression guard: a stale edge (e.g. mid-delete) must not crash layout.
    expect(() =>
      layoutWorkflowNodes(['a'], [{ from: 'a', to: 'does-not-exist' }], { a: BOX }),
    ).not.toThrow();
  });

  it('lays out disconnected nodes without throwing', () => {
    const positions = layoutWorkflowNodes(['a', 'b'], [], { a: BOX, b: BOX });
    expect(positions.a).toBeDefined();
    expect(positions.b).toBeDefined();
  });
});
