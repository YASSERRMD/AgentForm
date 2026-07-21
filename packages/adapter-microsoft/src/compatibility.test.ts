import { describe, expect, it } from 'vitest';
import { validateMicrosoftCompatibility } from './compatibility.js';
import { baseIR, multiAgentIR, unreachableHandoffIR, unsupportedNodeIR } from './test-fixtures.js';

describe('validateMicrosoftCompatibility', () => {
  it('reports the basic-scope fixture as fully compatible', () => {
    const report = validateMicrosoftCompatibility(baseIR());
    expect(report.hasBlockingIncompatibility).toBe(false);
    expect(report.target).toBe('microsoft');
  });

  it('reports every node type in the multi-agent fixture as supported', () => {
    const report = validateMicrosoftCompatibility(multiAgentIR());
    const nodeEntries = report.entries.filter((entry) => entry.feature.startsWith('workflow node'));
    expect(nodeEntries).toHaveLength(3);
    expect(nodeEntries.every((entry) => entry.level === 'supported')).toBe(true);
  });

  it('reports reachable delegation as fully supported, not partial or emulated', () => {
    const report = validateMicrosoftCompatibility(multiAgentIR());
    expect(report.hasBlockingIncompatibility).toBe(false);
    const entry = report.entries.find((e) => e.feature === 'agent delegation');
    expect(entry?.level).toBe('supported');
    expect(entry?.detail).toContain('intake');
  });

  it("flags humanApproval as unsupported, with a detail explaining the framework's real but non-node-level mechanisms", () => {
    const report = validateMicrosoftCompatibility(unsupportedNodeIR());
    expect(report.hasBlockingIncompatibility).toBe(true);
    const entry = report.entries.find((e) => e.feature === 'workflow node (humanApproval)');
    expect(entry?.level).toBe('unsupported');
    expect(entry?.detail).toMatch(/ApprovalRequiredAIFunction/);
  });

  it('flags an unreachable handoff source as unsupported, blocking generation', () => {
    const report = validateMicrosoftCompatibility(unreachableHandoffIR());
    expect(report.hasBlockingIncompatibility).toBe(true);
    const entry = report.entries.find((e) => e.feature === 'agent delegation');
    expect(entry?.level).toBe('unsupported');
    expect(entry?.detail).toContain('orphan');
    expect(entry?.detail).toMatch(/InvalidOperationException/);
  });

  it('does not report a delegation entry when no agent declares allowedAgents', () => {
    const report = validateMicrosoftCompatibility(baseIR());
    expect(report.entries.some((entry) => entry.feature === 'agent delegation')).toBe(false);
  });

  it('pins the generated dependency and runtime version', () => {
    const report = validateMicrosoftCompatibility(baseIR());
    expect(report.generatedDependencies).toEqual({
      'Microsoft.Agents.AI': '1.13.0',
      'Microsoft.Agents.AI.Workflows': '1.13.0',
    });
    expect(report.runtimeRequirements).toEqual(['dotnet net10.0']);
  });
});
