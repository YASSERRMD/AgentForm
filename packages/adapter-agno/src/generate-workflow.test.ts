import { describe, expect, it } from 'vitest';
import { generateWorkflowFile } from './generate-workflow.js';
import { loopAndStubsIR, richWorkflowIR } from './test-fixtures.js';

describe('generateWorkflowFile', () => {
  it('generates real Router/Parallel/Condition constructs, not stubs, for the rich fixture', () => {
    const ir = richWorkflowIR();
    const workflow = ir.workflows.get('main')!;
    const source = generateWorkflowFile('main', workflow);

    expect(source).toContain('Router(');
    expect(source).toContain('Parallel(');
    expect(source).toContain('Condition(');
    expect(source).toContain('name="approve"');
    expect(source).toContain('requires_confirmation=True');
  });

  it('does not emit a top-level Step for nodes consumed as parallel branches', () => {
    const ir = richWorkflowIR();
    const workflow = ir.workflows.get('main')!;
    const source = generateWorkflowFile('main', workflow);

    // branchANode/branchBNode are parallel branches -- they should appear
    // exactly once each, nested inside the Parallel(...) call, never as
    // their own separate top-level `steps=[...]` entry.
    const topLevelStepsBlock = source.slice(source.indexOf('steps=['), source.indexOf('],\n    )'));
    const parallelCallStart = topLevelStepsBlock.indexOf('Parallel(');
    const parallelCallEnd = topLevelStepsBlock.indexOf(
      ')',
      topLevelStepsBlock.lastIndexOf('name="fanout"'),
    );
    const beforeParallel = topLevelStepsBlock.slice(0, parallelCallStart);
    const afterParallel = topLevelStepsBlock.slice(parallelCallEnd);
    expect(beforeParallel).not.toContain('branchANode');
    expect(afterParallel).not.toContain('name="branchANode"');
  });

  it('places every node reachable from the entrypoint, even when the entrypoint itself sits inside a loop cycle', () => {
    const ir = loopAndStubsIR();
    const workflow = ir.workflows.get('main')!;
    const source = generateWorkflowFile('main', workflow);

    // Regression test: a naive global topological sort (Kahn's algorithm)
    // finds the *entire* graph unplaceable when the entrypoint itself is
    // inside a cycle (attempt -> retry -> attempt), since no node ever
    // reaches in-degree zero — every node ends up "cyclic" and steps=[]
    // comes out empty. walkFromEntrypoint must not have this failure mode.
    expect(source).toContain('Loop(');
    expect(source).toContain('max_iterations=3');
    expect(source).toContain('Step(name="attempt"');
    expect(source).toContain('name="reformat"');
    expect(source).toContain('name="wait"');
    expect(source).not.toMatch(/steps=\[\s*\],/);
    // The back-edge closing the cycle is noted, not silently dropped.
    expect(source).toMatch(/retry -> attempt/);
  });

  it('generates a real time.sleep() call for a delay node, converting duration to seconds', () => {
    const ir = loopAndStubsIR();
    const workflow = ir.workflows.get('main')!;
    const source = generateWorkflowFile('main', workflow);

    expect(source).toContain('import time');
    expect(source).toContain('time.sleep(5)');
  });

  it('generates a Step(workflow=...) reference and import for a subworkflow node', () => {
    const ir = loopAndStubsIR();
    const workflow = ir.workflows.get('main')!;
    const source = generateWorkflowFile('main', workflow);

    expect(source).toContain('workflow=build_sub_workflow()');
    expect(source).toContain('from .sub import build_sub_workflow');
  });
});
