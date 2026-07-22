import { describe, expect, it } from 'vitest';
import { validateAgnoCompatibility } from './compatibility.js';
import { baseIR, loopAndStubsIR, richWorkflowIR, unsupportedNodeIR } from './test-fixtures.js';

describe('validateAgnoCompatibility', () => {
  it('reports the basic-scope fixture as fully compatible', () => {
    const report = validateAgnoCompatibility(baseIR());
    expect(report.hasBlockingIncompatibility).toBe(false);
    expect(report.target).toBe('agno');
  });

  it('reports every node type in the rich-workflow fixture as supported', () => {
    const report = validateAgnoCompatibility(richWorkflowIR());
    const nodeEntries = report.entries.filter((entry) => entry.feature.startsWith('workflow node'));
    expect(nodeEntries.length).toBeGreaterThan(0);
    expect(nodeEntries.every((entry) => entry.level === 'supported')).toBe(true);
    expect(report.hasBlockingIncompatibility).toBe(false);
  });

  it('reports loop/transform/delay/subworkflow nodes as supported', () => {
    const report = validateAgnoCompatibility(loopAndStubsIR());
    const nodeEntries = report.entries.filter((entry) => entry.feature.startsWith('workflow node'));
    const typesCovered = new Set(
      nodeEntries.map((entry) => entry.feature.replace('workflow node (', '').replace(')', '')),
    );
    expect(typesCovered).toEqual(
      new Set(['agent', 'loop', 'transform', 'delay', 'subworkflow', 'terminate']),
    );
    expect(report.hasBlockingIncompatibility).toBe(false);
  });

  it('flags join as unsupported, with a detail explaining the real gap', () => {
    const report = validateAgnoCompatibility(unsupportedNodeIR());
    expect(report.hasBlockingIncompatibility).toBe(true);
    const entry = report.entries.find((e) => e.feature === 'workflow node (join)');
    expect(entry?.level).toBe('unsupported');
    expect(entry?.detail).toMatch(/Parallel/);
  });

  it('reports human approval as genuinely (not emulated) supported', () => {
    const report = validateAgnoCompatibility(richWorkflowIR());
    const entry = report.entries.find((e) => e.feature === 'human approval');
    expect(entry?.level).toBe('supported');
    expect(entry?.detail).toMatch(/blocking/);
  });

  it('flags agent delegation as partial when declared, absent otherwise', () => {
    expect(
      validateAgnoCompatibility(baseIR()).entries.some((e) => e.feature === 'agent delegation'),
    ).toBe(false);
  });

  it('pins the generated dependencies and runtime version', () => {
    const report = validateAgnoCompatibility(baseIR());
    expect(report.generatedDependencies).toEqual({ agno: '2.8.0', fastapi: '0.139.2' });
    expect(report.runtimeRequirements).toEqual(['python >=3.9,<4']);
  });

  it('warns about the fastapi dependency surprise', () => {
    const report = validateAgnoCompatibility(baseIR());
    expect(report.securityWarnings.some((w) => w.includes('fastapi'))).toBe(true);
  });
});
