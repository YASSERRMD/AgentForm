import { describe, expect, it } from 'vitest';
import { validateAutoGenCompatibility } from './compatibility.js';
import { baseIR, multiAgentIR, unsupportedNodeIR } from './test-fixtures.js';

describe('validateAutoGenCompatibility', () => {
  it('reports the basic-scope fixture as fully compatible', () => {
    const report = validateAutoGenCompatibility(baseIR());
    expect(report.hasBlockingIncompatibility).toBe(false);
    expect(report.target).toBe('autogen');
  });

  it('reports every node type in the multi-agent fixture as supported or emulated', () => {
    const report = validateAutoGenCompatibility(multiAgentIR());
    const nodeEntries = report.entries.filter((entry) => entry.feature.startsWith('workflow node'));
    expect(nodeEntries).toHaveLength(4);
    expect(
      nodeEntries.every((entry) => entry.level === 'supported' || entry.level === 'emulated'),
    ).toBe(true);
    expect(report.hasBlockingIncompatibility).toBe(false);
  });

  it('marks humanApproval as emulated, not supported — a real but repurposed construct', () => {
    const report = validateAutoGenCompatibility(multiAgentIR());
    const approvalEntry = report.entries.find(
      (entry) => entry.feature === 'workflow node (humanApproval)',
    );
    expect(approvalEntry?.level).toBe('emulated');
  });

  it('flags an unsupported workflow node type (tool) as blocking', () => {
    const report = validateAutoGenCompatibility(unsupportedNodeIR());
    expect(report.hasBlockingIncompatibility).toBe(true);
    const toolNodeEntry = report.entries.find((entry) => entry.feature === 'workflow node (tool)');
    expect(toolNodeEntry?.level).toBe('unsupported');
  });

  it('pins generated dependency and runtime versions', () => {
    const report = validateAutoGenCompatibility(baseIR());
    expect(report.generatedDependencies).toEqual({
      'autogen-agentchat': '0.7.5',
      'autogen-ext': '0.7.5',
    });
    expect(report.runtimeRequirements).toEqual(['python >=3.10']);
  });

  it('warns against unrestricted code execution, per §13.5', () => {
    const report = validateAutoGenCompatibility(baseIR());
    expect(report.securityWarnings.join(' ')).toMatch(/unrestricted code execution/);
  });
});
