import type { IRTool, ResourceId } from '@agentform/ir';
import { describe, expect, it } from 'vitest';
import { validateLangGraphCompatibility } from './compatibility.js';
import { baseIR, graphWorkflowIR, unsupportedNodeIR } from './test-fixtures.js';

describe('validateLangGraphCompatibility', () => {
  it('reports full support for a simple single-agent workflow', () => {
    const report = validateLangGraphCompatibility(baseIR());
    expect(report.target).toBe('langgraph');
    expect(report.hasBlockingIncompatibility).toBe(false);
    expect(report.entries.every((entry) => entry.level !== 'unsupported')).toBe(true);
  });

  it('reports supported for every node type the graph fixture exercises', () => {
    const report = validateLangGraphCompatibility(graphWorkflowIR());
    const nodeEntries = report.entries.filter((entry) => entry.feature.startsWith('workflow node'));
    expect(nodeEntries).toHaveLength(7);
    expect(nodeEntries.every((entry) => entry.level === 'supported')).toBe(true);
    expect(report.hasBlockingIncompatibility).toBe(false);
  });

  it('flags an unsupported workflow node type as blocking', () => {
    const report = validateLangGraphCompatibility(unsupportedNodeIR());
    expect(report.hasBlockingIncompatibility).toBe(true);
    const delayEntry = report.entries.find((entry) => entry.feature === 'workflow node (delay)');
    expect(delayEntry?.level).toBe('unsupported');
  });

  it('flags an unsupported tool type as blocking', () => {
    // No real schema tool type is unsupported today — this simulates a
    // future schema addition the adapter hasn't caught up with yet, which
    // is what the fallback `else` branch in `validateLangGraphCompatibility`
    // exists to handle defensively.
    const ir = graphWorkflowIR();
    const tools = ir.tools as Map<ResourceId, IRTool>;
    tools.set('search-registry', { type: 'not-a-real-type' } as unknown as IRTool);

    const report = validateLangGraphCompatibility(ir);
    expect(report.hasBlockingIncompatibility).toBe(true);
  });

  it('always reports checkpointing as emulated with a persistence warning', () => {
    const report = validateLangGraphCompatibility(baseIR());
    const checkpointing = report.entries.find((entry) => entry.feature === 'checkpointing');
    expect(checkpointing?.level).toBe('emulated');
  });

  it('pins generated dependency and runtime versions', () => {
    const report = validateLangGraphCompatibility(baseIR());
    expect(report.generatedDependencies).toEqual({ langgraph: '0.6.11' });
    expect(report.runtimeRequirements).toEqual(['python >=3.9']);
  });

  it('never claims API keys are embedded in generated code', () => {
    const report = validateLangGraphCompatibility(baseIR());
    expect(report.securityWarnings.join(' ')).toMatch(/never embeds API keys/);
  });
});
